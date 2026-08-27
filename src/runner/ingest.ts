import { graphql } from '@octokit/graphql';
import { execSync } from 'node:child_process';
import type {
  CandidateIssue,
  RawGraphQLComment,
  RawGraphQLIssueNode,
  RawGraphQLPR,
} from './types.js';

export function getGitHubToken(): string {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim().length > 0) {
    return process.env.GITHUB_TOKEN.trim();
  }
  if (process.env.GH_TOKEN && process.env.GH_TOKEN.trim().length > 0) {
    return process.env.GH_TOKEN.trim();
  }

  // Fallback to gh CLI for local development
  try {
    const token = execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (token) {
      return token;
    }
  } catch {
    // ignore
  }

  throw new Error(
    'GitHub token not found. Please set GITHUB_TOKEN environment variable or log in with `gh auth login`.'
  );
}

const SEARCH_QUERY = `
query SearchCandidateIssues($searchQuery: String!, $cursor: String) {
  search(query: $searchQuery, type: ISSUE, first: 25, after: $cursor) {
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on Issue {
        id
        number
        title
        url
        body
        createdAt
        updatedAt
        author {
          login
        }
        assignees(first: 3) {
          totalCount
        }
        labels(first: 8) {
          nodes {
            name
          }
        }
        comments(last: 8) {
          nodes {
            body
            createdAt
            author {
              login
            }
          }
        }
        timelineItems(last: 5, itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT]) {
          nodes {
            ... on CrossReferencedEvent {
              source {
                ... on PullRequest {
                  state
                  url
                }
              }
            }
            ... on ConnectedEvent {
              subject {
                ... on PullRequest {
                  state
                  url
                }
              }
            }
          }
        }
        repository {
          nameWithOwner
          url
          stargazerCount
          pushedAt
          primaryLanguage {
            name
          }
          defaultBranchRef {
            name
          }
          pullRequests(last: 5, states: [MERGED, CLOSED]) {
            nodes {
              createdAt
              closedAt
              reviews(first: 1) {
                nodes {
                  createdAt
                }
              }
            }
          }
        }
      }
    }
  }
}
`;

export async function executeGraphQLWithRetry(
  graphqlClient: any,
  query: string,
  variables: Record<string, any>,
  maxRetries = 3
): Promise<any> {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      return await graphqlClient(query, variables);
    } catch (err: any) {
      attempt++;
      const isTransient =
        err?.status === 502 ||
        err?.status === 503 ||
        err?.status === 504 ||
        err?.message?.includes('Bad Gateway') ||
        err?.message?.includes('ETIMEDOUT') ||
        err?.message?.includes('ECONNRESET');

      if (isTransient && attempt < maxRetries) {
        const delayMs = attempt * 2500;
        console.warn(
          `[Ingest] Transient error (${err?.status || err?.message}). Retrying query in ${delayMs}ms (attempt ${attempt}/${maxRetries})...`
        );
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        throw err;
      }
    }
  }
}

const CLAIM_REGEX =
  /\b(i('?m| am)\s+(working|taking)|can i\s+(take|work|fix)|working on (this|it)|take this|claiming|claim this|assigned to me|please assign|assign me|i would like to (work|take|fix)|i'll take|ill take|assign to me|may i take)\b/i;

const BOT_LOGINS = [
  'github-actions[bot]',
  'dependabot[bot]',
  'renovate[bot]',
  'stale[bot]',
  'codecov[bot]',
  'snyk-bot',
];

export function hasRecentClaim(comments?: RawGraphQLComment[]): boolean {
  if (!comments || !Array.isArray(comments)) {
    return false;
  }
  const now = Date.now();
  const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

  for (const comment of comments) {
    if (!comment) continue;
    const author = comment.author?.login || '';
    if (BOT_LOGINS.includes(author.toLowerCase())) {
      continue;
    }

    const commentAge = now - new Date(comment.createdAt).getTime();
    if (commentAge <= FOURTEEN_DAYS_MS) {
      if (CLAIM_REGEX.test(comment.body)) {
        return true;
      }
    }
  }
  return false;
}

export function hasOpenLinkedPR(timelineItems?: RawGraphQLIssueNode['timelineItems']): boolean {
  if (!timelineItems?.nodes || !Array.isArray(timelineItems.nodes)) {
    return false;
  }
  for (const item of timelineItems.nodes) {
    if (!item) continue;
    const prState = item.source?.state || item.subject?.state;
    if (prState === 'OPEN') {
      return true;
    }
  }
  return false;
}

export function calculateMaintainerTurnaroundDays(
  pullRequests: RawGraphQLPR[],
  pushedAt: string
): number {
  const now = Date.now();
  const pushAgeDays = (now - new Date(pushedAt).getTime()) / (1000 * 60 * 60 * 24);

  // If repo hasn't been pushed to in 14 days, turnaround is considered high
  if (pushAgeDays > 14) {
    return 15;
  }

  const responseDurations: number[] = [];

  for (const pr of pullRequests) {
    const prCreated = new Date(pr.createdAt).getTime();
    let firstResponseTime: number | null = null;

    if (pr.reviews?.nodes?.length > 0) {
      firstResponseTime = new Date(pr.reviews.nodes[0].createdAt).getTime();
    } else if (pr.closedAt) {
      firstResponseTime = new Date(pr.closedAt).getTime();
    }

    if (firstResponseTime && firstResponseTime >= prCreated) {
      const days = (firstResponseTime - prCreated) / (1000 * 60 * 60 * 24);
      responseDurations.push(days);
    }
  }

  if (responseDurations.length === 0) {
    // Default fallback based on push recency
    return pushAgeDays <= 3 ? 2 : 5;
  }

  responseDurations.sort((a, b) => a - b);
  const median = responseDurations[Math.floor(responseDurations.length / 2)];
  return Math.round(median * 10) / 10;
}

export interface IngestFilterResult {
  accepted: CandidateIssue[];
  skippedReasons: Record<string, number>;
}

export async function fetchAndFilterCandidateIssues(
  options: {
    limit?: number;
    customQuery?: string;
    minStars?: number;
    maxAgeDays?: number;
    verbose?: boolean;
    graphqlClient?: any;
  } = {}
): Promise<IngestFilterResult> {
  let graphqlWithAuth = options.graphqlClient;
  if (!graphqlWithAuth) {
    const token = getGitHubToken();
    graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
  }

  const minStars = options.minStars ?? 200;
  const maxAgeDays = options.maxAgeDays ?? 60;
  const minCreatedDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  // Multiple targeted queries to maximize discovery of verified recent issues
  const searchQueries = options.customQuery
    ? [options.customQuery]
    : [
        `is:issue is:open no:assignee label:"good first issue" created:>=${minCreatedDate} sort:created-desc`,
        `is:issue is:open no:assignee label:"good-first-issue" created:>=${minCreatedDate} sort:created-desc`,
        `is:issue is:open no:assignee label:"help wanted" created:>=${minCreatedDate} sort:created-desc`,
      ];

  const targetLimit = options.limit || 20;
  const accepted: CandidateIssue[] = [];
  const seenIds = new Set<string>();
  const skippedReasons: Record<string, number> = {
    'assigned': 0,
    'open-pr-linked': 0,
    'recent-claim-comment': 0,
    'inactive-maintainer': 0,
    'low-stars': 0,
    'too-old': 0,
    'short-description': 0,
    'no-default-branch': 0,
  };

  for (const queryStr of searchQueries) {
    if (accepted.length >= targetLimit) break;

    let cursor: string | null = null;
    let hasNextPage = true;
    let pageCount = 0;

    if (options.verbose) {
      console.log(`[Ingest] Querying GitHub GraphQL with: ${queryStr}`);
    }

    while (hasNextPage && accepted.length < targetLimit && pageCount < 8) {
      pageCount++;
      const response: any = await executeGraphQLWithRetry(
        graphqlWithAuth,
        SEARCH_QUERY,
        {
          searchQuery: queryStr,
          cursor,
        }
      );

      const searchData = response?.search;
      if (!searchData || !searchData.nodes) {
        break;
      }

      hasNextPage = searchData.pageInfo?.hasNextPage ?? false;
      cursor = searchData.pageInfo?.endCursor ?? null;

      for (const node of searchData.nodes) {
        if (!node || !node.id || !node.repository) {
          continue;
        }

        if (seenIds.has(node.id)) {
          continue;
        }
        seenIds.add(node.id);

        const issueNode = node as RawGraphQLIssueNode;

        // 1. Assignee Check
        if (issueNode.assignees?.totalCount > 0) {
          skippedReasons['assigned']++;
          continue;
        }

        // 2. Open Linked PR Check
        if (hasOpenLinkedPR(issueNode.timelineItems)) {
          skippedReasons['open-pr-linked']++;
          continue;
        }

        // 3. Recent Claim Comments Check
        if (hasRecentClaim(issueNode.comments?.nodes)) {
          skippedReasons['recent-claim-comment']++;
          continue;
        }

        // 4. Minimum Stars Hard Filter (Programmatic check)
        if ((issueNode.repository.stargazerCount || 0) < minStars) {
          skippedReasons['low-stars']++;
          continue;
        }

        // 5. Issue Age Check (reject issues older than maxAgeDays)
        const issueAgeDays =
          (Date.now() - new Date(issueNode.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (issueAgeDays > maxAgeDays) {
          skippedReasons['too-old']++;
          continue;
        }

        // 6. Issue Description Quality Check
        const body = (issueNode.body || '').trim();
        if (body.length < 60) {
          skippedReasons['short-description']++;
          continue;
        }

        // 7. Default Branch Check
        const defaultBranch = issueNode.repository.defaultBranchRef?.name;
        if (!defaultBranch) {
          skippedReasons['no-default-branch']++;
          continue;
        }

        // 8. Maintainer Turnaround & Responsiveness
        const turnaroundDays = calculateMaintainerTurnaroundDays(
          issueNode.repository.pullRequests?.nodes || [],
          issueNode.repository.pushedAt
        );

        if (turnaroundDays > 7) {
          skippedReasons['inactive-maintainer']++;
          continue;
        }

        accepted.push({
          id: issueNode.id,
          number: issueNode.number,
          title: issueNode.title,
          url: issueNode.url,
          body,
          repo: issueNode.repository.nameWithOwner,
          repoUrl: issueNode.repository.url,
          stars: issueNode.repository.stargazerCount,
          language: issueNode.repository.primaryLanguage?.name || null,
          labels: (issueNode.labels?.nodes || []).map((l) => l.name),
          createdAt: issueNode.createdAt,
          updatedAt: issueNode.updatedAt,
          defaultBranch,
          maintainerTurnaroundDays: turnaroundDays,
        });

        if (accepted.length >= targetLimit) {
          break;
        }
      }
    }
  }

  if (options.verbose) {
    console.log(
      `[Ingest] Ingestion complete. Accepted ${accepted.length} candidate issues. Filter drop counts:`,
      skippedReasons
    );
  }

  return { accepted, skippedReasons };
}
