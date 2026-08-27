import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  calculateMaintainerTurnaroundDays,
  executeGraphQLWithRetry,
  fetchAndFilterCandidateIssues,
  hasOpenLinkedPR,
  hasRecentClaim,
} from '../src/runner/ingest.js';
import type { RawGraphQLComment, RawGraphQLIssueNode, RawGraphQLPR } from '../src/runner/types.js';

describe('Ingest & Heuristics', () => {
  describe('executeGraphQLWithRetry (502 / Transient Failure Resilience)', () => {
    test('succeeds on first attempt if no error occurs', async () => {
      let calls = 0;
      const mockClient = async () => {
        calls++;
        return { data: { search: { nodes: [] } } };
      };

      const result = await executeGraphQLWithRetry(mockClient, 'query', {});
      assert.equal(calls, 1);
      assert.deepEqual(result, { data: { search: { nodes: [] } } });
    });

    test('recovers after transient 502 Bad Gateway error', async () => {
      let calls = 0;
      const mockClient = async () => {
        calls++;
        if (calls === 1) {
          const error: any = new Error('502 Bad Gateway');
          error.status = 502;
          throw error;
        }
        return { data: { search: { nodes: [{ id: 'recovered-1' }] } } };
      };

      const result = await executeGraphQLWithRetry(mockClient, 'query', {}, 3);
      assert.equal(calls, 2, 'Should have retried once after 502');
      assert.equal(result.data.search.nodes[0].id, 'recovered-1');
    });

    test('throws after maxRetries exceeded on persistent 502 error', async () => {
      let calls = 0;
      const mockClient = async () => {
        calls++;
        const error: any = new Error('502 Bad Gateway');
        error.status = 502;
        throw error;
      };

      await assert.rejects(
        async () => {
          await executeGraphQLWithRetry(mockClient, 'query', {}, 2);
        },
        /502 Bad Gateway/
      );
      assert.equal(calls, 2);
    });
  });

  describe('Claim Detection (hasRecentClaim)', () => {
    const nowIso = new Date().toISOString();
    const oldIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    test('detects active claim comments within 14 days', () => {
      const claimComments: RawGraphQLComment[] = [
        { author: { login: 'contributor1' }, body: 'Can I work on this issue?', createdAt: nowIso },
      ];
      assert.equal(hasRecentClaim(claimComments), true);

      const claimComments2: RawGraphQLComment[] = [
        { author: { login: 'contributor2' }, body: 'Please assign this to me', createdAt: nowIso },
      ];
      assert.equal(hasRecentClaim(claimComments2), true);

      const claimComments3: RawGraphQLComment[] = [
        { author: { login: 'contributor3' }, body: "I'm working on this now", createdAt: nowIso },
      ];
      assert.equal(hasRecentClaim(claimComments3), true);
    });

    test('ignores claims older than 14 days', () => {
      const oldClaim: RawGraphQLComment[] = [
        { author: { login: 'abandoned_user' }, body: 'Can I take this?', createdAt: oldIso },
      ];
      assert.equal(hasRecentClaim(oldClaim), false);
    });

    test('ignores bot comments', () => {
      const botComments: RawGraphQLComment[] = [
        { author: { login: 'github-actions[bot]' }, body: 'Please assign labels', createdAt: nowIso },
        { author: { login: 'dependabot[bot]' }, body: 'Bump version', createdAt: nowIso },
      ];
      assert.equal(hasRecentClaim(botComments), false);
    });
  });

  describe('Maintainer Turnaround Calculation', () => {
    test('computes median review duration in days', () => {
      const prs: RawGraphQLPR[] = [
        {
          createdAt: '2026-08-20T10:00:00Z',
          closedAt: null,
          reviews: { nodes: [{ createdAt: '2026-08-21T10:00:00Z' }] }, // 1.0 day
        },
        {
          createdAt: '2026-08-18T10:00:00Z',
          closedAt: '2026-08-20T10:00:00Z', // 2.0 days
          reviews: { nodes: [] },
        },
        {
          createdAt: '2026-08-10T10:00:00Z',
          closedAt: '2026-08-13T10:00:00Z', // 3.0 days
          reviews: { nodes: [] },
        },
      ];

      const turnaround = calculateMaintainerTurnaroundDays(prs, new Date().toISOString());
      assert.equal(turnaround, 2.0);
    });

    test('penalizes stale repos with push age > 14 days', () => {
      const stalePushedAt = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
      const turnaround = calculateMaintainerTurnaroundDays([], stalePushedAt);
      assert.ok(turnaround > 7);
    });
  });

  describe('Star Count Threshold Guard', () => {
    test('filters out candidate repos with fewer than minStars (e.g. 3, 33, 199 stars)', async () => {
      const mockRawIssues: RawGraphQLIssueNode[] = [
        {
          id: 'issue-low-stars',
          number: 1,
          title: 'Low star issue',
          url: 'https://github.com/low/repo/issues/1',
          body: 'This is a test issue with plenty of descriptive text to pass length checks.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assignees: { totalCount: 0 },
          labels: { nodes: [{ name: 'good first issue' }] },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: {
            nameWithOwner: 'low/repo',
            url: 'https://github.com/low/repo',
            stargazerCount: 3, // < 200
            pushedAt: new Date().toISOString(),
            defaultBranchRef: { name: 'main' },
            primaryLanguage: { name: 'TypeScript' },
            pullRequests: { nodes: [] },
          },
        },
        {
          id: 'issue-valid-stars',
          number: 2,
          title: 'Valid star issue',
          url: 'https://github.com/valid/repo/issues/2',
          body: 'This is a valid test issue with plenty of descriptive text to pass length checks.',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assignees: { totalCount: 0 },
          labels: { nodes: [{ name: 'good first issue' }] },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: {
            nameWithOwner: 'valid/repo',
            url: 'https://github.com/valid/repo',
            stargazerCount: 1500, // >= 200
            pushedAt: new Date().toISOString(),
            defaultBranchRef: { name: 'main' },
            primaryLanguage: { name: 'TypeScript' },
            pullRequests: { nodes: [] },
          },
        },
      ];

      // Test with custom GraphQL client returning mock raw issues
      const mockGraphQLClient = async () => ({
        search: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: mockRawIssues,
        },
      });

      // Test custom query with minStars using mock client
      const result = await fetchAndFilterCandidateIssues({
        limit: 10,
        minStars: 200,
        customQuery: 'test query',
        graphqlClient: mockGraphQLClient,
      });

      // The 3-star repo should be excluded, and the 1500-star repo accepted
      assert.equal(result.accepted.some((i) => i.repo === 'low/repo'), false);
      assert.equal(result.accepted.some((i) => i.repo === 'valid/repo'), true);
      assert.equal(result.skippedReasons['low-stars'], 1);
    });
  });

  describe('Issue Age & Recency Filter', () => {
    test('filters out stale issues older than maxAgeDays', async () => {
      const eightYearsAgoIso = new Date(Date.now() - 8 * 365 * 24 * 60 * 60 * 1000).toISOString();
      const freshIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

      const mockIssues: RawGraphQLIssueNode[] = [
        {
          id: 'issue-ancient',
          number: 200,
          title: 'Ancient 8-year-old issue',
          url: 'https://github.com/ancient/repo/issues/200',
          body: 'This is an ancient issue created 8 years ago with plenty of descriptive text to pass length checks.',
          createdAt: eightYearsAgoIso,
          updatedAt: new Date().toISOString(),
          assignees: { totalCount: 0 },
          labels: { nodes: [{ name: 'good first issue' }] },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: {
            nameWithOwner: 'ancient/repo',
            url: 'https://github.com/ancient/repo',
            stargazerCount: 1500,
            pushedAt: new Date().toISOString(),
            defaultBranchRef: { name: 'main' },
            primaryLanguage: { name: 'TypeScript' },
            pullRequests: { nodes: [] },
          },
        },
        {
          id: 'issue-fresh',
          number: 101,
          title: 'Fresh issue created 5 days ago',
          url: 'https://github.com/fresh/repo/issues/101',
          body: 'This is a fresh issue created recently with plenty of descriptive text to pass length checks.',
          createdAt: freshIso,
          updatedAt: new Date().toISOString(),
          assignees: { totalCount: 0 },
          labels: { nodes: [{ name: 'good first issue' }] },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: {
            nameWithOwner: 'fresh/repo',
            url: 'https://github.com/fresh/repo',
            stargazerCount: 1500,
            pushedAt: new Date().toISOString(),
            defaultBranchRef: { name: 'main' },
            primaryLanguage: { name: 'TypeScript' },
            pullRequests: { nodes: [] },
          },
        },
      ];

      const mockClient = async () => ({
        search: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: mockIssues,
        },
      });

      const result = await fetchAndFilterCandidateIssues({
        limit: 10,
        maxAgeDays: 60,
        customQuery: 'test query',
        graphqlClient: mockClient,
      });

      assert.equal(result.accepted.some((i) => i.id === 'issue-ancient'), false);
      assert.equal(result.accepted.some((i) => i.id === 'issue-fresh'), true);
      assert.equal(result.skippedReasons['too-old'], 1);
    });

    test('generates queries with created date filter and sort:created-desc without invalid qualifiers', async () => {
      let executedQuery = '';
      const mockClient = async (_query: string, vars: { searchQuery: string }) => {
        executedQuery = vars.searchQuery;
        return {
          search: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [],
          },
        };
      };

      await fetchAndFilterCandidateIssues({
        limit: 5,
        maxAgeDays: 30,
        graphqlClient: mockClient,
      });

      assert.ok(executedQuery.includes('sort:created-desc'), 'Query must sort by created desc');
      assert.ok(executedQuery.includes('created:>='), 'Query must filter by created date');
      assert.ok(!executedQuery.includes('stars:>='), 'Query must not include invalid stars qualifier');
      assert.ok(!executedQuery.includes('pushed:>'), 'Query must not include invalid pushed qualifier');
    });
  });
});

