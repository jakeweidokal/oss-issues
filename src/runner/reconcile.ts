import { graphql } from '@octokit/graphql';
import {
  executeGraphQLWithRetry,
  getGitHubToken,
  hasOpenLinkedPR,
  hasRecentClaim,
} from './ingest.js';
import type {
  EnrichedIssue,
  InactiveReason,
  ReconcileResult,
} from './types.js';

export const RECONCILE_NODES_QUERY = `
query CheckActiveIssues($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Issue {
      id
      state
      assignees(first: 3) {
        totalCount
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
        isArchived
      }
    }
  }
}
`;

export interface ActiveCheckStatus {
  active: boolean;
  reason?: InactiveReason;
}

export function checkIssueActiveStatus(
  node: any,
  issue?: EnrichedIssue,
  maxAgeDays = 60
): ActiveCheckStatus {
  if (!node || !node.id) {
    return { active: false, reason: 'deleted' };
  }
  if (node.repository?.isArchived) {
    return { active: false, reason: 'archived' };
  }
  if (node.state !== 'OPEN') {
    return { active: false, reason: 'closed' };
  }
  if (node.assignees?.totalCount > 0) {
    return { active: false, reason: 'assigned' };
  }
  if (hasOpenLinkedPR(node.timelineItems)) {
    return { active: false, reason: 'pr_opened' };
  }
  if (hasRecentClaim(node.comments?.nodes || [])) {
    return { active: false, reason: 'claimed' };
  }
  if (issue?.createdAt) {
    const ageDays = (Date.now() - new Date(issue.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > maxAgeDays) {
      return { active: false, reason: 'too_old' };
    }
  }
  return { active: true };
}

export async function reconcileExistingIssues(
  existingIssues: EnrichedIssue[],
  options: {
    verbose?: boolean;
    graphqlClient?: any;
    batchSize?: number;
    maxAgeDays?: number;
  } = {}
): Promise<ReconcileResult> {
  const maxAgeDays = options.maxAgeDays ?? 60;
  const stats: Record<InactiveReason, number> = {
    closed: 0,
    assigned: 0,
    claimed: 0,
    pr_opened: 0,
    archived: 0,
    deleted: 0,
    too_old: 0,
    stale: 0,
  };

  if (existingIssues.length === 0) {
    return { activeIssues: [], removedIssues: [], stats };
  }

  let graphqlWithAuth = options.graphqlClient;
  if (!graphqlWithAuth) {
    try {
      const token = getGitHubToken();
      graphqlWithAuth = graphql.defaults({
        headers: {
          authorization: `token ${token}`,
        },
      });
    } catch (err: any) {
      console.warn(`[Reconcile] Could not obtain GitHub token: ${err?.message || err}. Skipping reconciliation.`);
      return { activeIssues: [...existingIssues], removedIssues: [], stats };
    }
  }

  const batchSize = options.batchSize || 50;
  const activeIssues: EnrichedIssue[] = [];
  const removedIssues: Array<{ issue: EnrichedIssue; reason: InactiveReason }> = [];

  for (let i = 0; i < existingIssues.length; i += batchSize) {
    const batch = existingIssues.slice(i, i + batchSize);
    const ids = batch.map((issue) => issue.id);

    if (options.verbose) {
      console.log(`[Reconcile] Checking active status for batch of ${batch.length} issues (${ids.slice(0, 3).join(', ')}...)...`);
    }

    try {
      const response: any = await executeGraphQLWithRetry(
        graphqlWithAuth,
        RECONCILE_NODES_QUERY,
        { ids }
      );

      const nodes: any[] = response?.nodes || [];
      const nodeMap = new Map<string, any>();
      for (const node of nodes) {
        if (node && node.id) {
          nodeMap.set(node.id, node);
        }
      }

      for (const issue of batch) {
        const node = nodeMap.get(issue.id);
        const status = checkIssueActiveStatus(node, issue, maxAgeDays);

        if (status.active) {
          activeIssues.push(issue);
        } else {
          const reason = status.reason || 'deleted';
          stats[reason]++;
          removedIssues.push({ issue, reason });
          if (options.verbose) {
            console.log(
              `  🚫 Issue ${issue.repo}#${issue.number} is no longer active (${reason}). Removing from dataset.`
            );
          }
        }
      }
    } catch (err: any) {
      console.warn(
        `[Reconcile] Batch query failed (${err?.message || err}). Keeping batch as active to avoid data loss.`
      );
      activeIssues.push(...batch);
    }
  }

  return { activeIssues, removedIssues, stats };
}
