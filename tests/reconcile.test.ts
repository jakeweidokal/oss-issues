import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import {
  checkIssueActiveStatus,
  reconcileExistingIssues,
} from '../src/runner/reconcile.js';
import type { EnrichedIssue } from '../src/runner/types.js';

function createMockEnrichedIssue(id: string, repo = 'test/repo', number = 1): EnrichedIssue {
  return {
    id,
    number,
    title: `Mock Issue ${number}`,
    url: `https://github.com/${repo}/issues/${number}`,
    repo,
    repoUrl: `https://github.com/${repo}`,
    stars: 500,
    language: 'TypeScript',
    labels: ['good first issue'],
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-05T00:00:00Z',
    blastRadius: 'Low',
    blastRadiusReason: 'Single module fix',
    setupFriction: 'Zero-dependency',
    quickReproCommand: 'pnpm test',
    solvabilityScore: 9,
    keyFiles: ['src/index.ts'],
    summary: 'Fix something small',
    maintainerTurnaroundDays: 1.5,
    defaultBranch: 'main',
    discoveredAt: '2026-08-10T00:00:00Z',
  };
}

describe('Active Issue Status Checker & Dataset Reconciliation', () => {
  describe('checkIssueActiveStatus', () => {
    test('marks an open, unassigned, unclaimed issue as active', () => {
      const node = {
        id: 'node-1',
        state: 'OPEN',
        assignees: { totalCount: 0 },
        comments: { nodes: [] },
        timelineItems: { nodes: [] },
        repository: { isArchived: false },
      };

      const result = checkIssueActiveStatus(node);
      assert.equal(result.active, true);
      assert.equal(result.reason, undefined);
    });

    test('detects deleted or missing node', () => {
      assert.deepEqual(checkIssueActiveStatus(null), { active: false, reason: 'deleted' });
      assert.deepEqual(checkIssueActiveStatus({}), { active: false, reason: 'deleted' });
    });

    test('detects closed issue state', () => {
      const node = {
        id: 'node-closed',
        state: 'CLOSED',
        assignees: { totalCount: 0 },
        comments: { nodes: [] },
        timelineItems: { nodes: [] },
        repository: { isArchived: false },
      };

      const result = checkIssueActiveStatus(node);
      assert.equal(result.active, false);
      assert.equal(result.reason, 'closed');
    });

    test('detects assigned issue', () => {
      const node = {
        id: 'node-assigned',
        state: 'OPEN',
        assignees: { totalCount: 1 },
        comments: { nodes: [] },
        timelineItems: { nodes: [] },
        repository: { isArchived: false },
      };

      const result = checkIssueActiveStatus(node);
      assert.equal(result.active, false);
      assert.equal(result.reason, 'assigned');
    });

    test('detects open PR linked in timeline', () => {
      const node = {
        id: 'node-pr',
        state: 'OPEN',
        assignees: { totalCount: 0 },
        comments: { nodes: [] },
        timelineItems: {
          nodes: [
            {
              source: {
                state: 'OPEN',
                url: 'https://github.com/test/repo/pull/12',
              },
            },
          ],
        },
        repository: { isArchived: false },
      };

      const result = checkIssueActiveStatus(node);
      assert.equal(result.active, false);
      assert.equal(result.reason, 'pr_opened');
    });

    test('detects recent claim comment within 14 days', () => {
      const node = {
        id: 'node-claim',
        state: 'OPEN',
        assignees: { totalCount: 0 },
        comments: {
          nodes: [
            {
              author: { login: 'some-dev' },
              body: 'I am working on this now!',
              createdAt: new Date().toISOString(),
            },
          ],
        },
        timelineItems: { nodes: [] },
        repository: { isArchived: false },
      };

      const result = checkIssueActiveStatus(node);
      assert.equal(result.active, false);
      assert.equal(result.reason, 'claimed');
    });

    test('detects archived repository', () => {
      const node = {
        id: 'node-archived',
        state: 'OPEN',
        assignees: { totalCount: 0 },
        comments: { nodes: [] },
        timelineItems: { nodes: [] },
        repository: { isArchived: true },
      };

      const result = checkIssueActiveStatus(node);
      assert.equal(result.active, false);
      assert.equal(result.reason, 'archived');
    });
  });

  describe('reconcileExistingIssues', () => {
    test('handles empty dataset gracefully', async () => {
      const result = await reconcileExistingIssues([]);
      assert.deepEqual(result.activeIssues, []);
      assert.deepEqual(result.removedIssues, []);
      assert.equal(result.stats.closed, 0);
    });

    test('reconciles mixed dataset and partitions active vs removed issues', async () => {
      const issueActive = createMockEnrichedIssue('id-active', 'test/active', 1);
      const issueClosed = createMockEnrichedIssue('id-closed', 'test/closed', 2);
      const issueAssigned = createMockEnrichedIssue('id-assigned', 'test/assigned', 3);
      const issueClaimed = createMockEnrichedIssue('id-claimed', 'test/claimed', 4);
      const issueDeleted = createMockEnrichedIssue('id-deleted', 'test/deleted', 5);

      const mockNodes: Record<string, any> = {
        'id-active': {
          id: 'id-active',
          state: 'OPEN',
          assignees: { totalCount: 0 },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: { isArchived: false },
        },
        'id-closed': {
          id: 'id-closed',
          state: 'CLOSED',
          assignees: { totalCount: 0 },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: { isArchived: false },
        },
        'id-assigned': {
          id: 'id-assigned',
          state: 'OPEN',
          assignees: { totalCount: 2 },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: { isArchived: false },
        },
        'id-claimed': {
          id: 'id-claimed',
          state: 'OPEN',
          assignees: { totalCount: 0 },
          comments: {
            nodes: [
              {
                author: { login: 'dev_user' },
                body: 'Can I take this?',
                createdAt: new Date().toISOString(),
              },
            ],
          },
          timelineItems: { nodes: [] },
          repository: { isArchived: false },
        },
        // 'id-deleted' is omitted from nodes, returning undefined
      };

      const mockGraphQLClient = async (_query: string, vars: { ids: string[] }) => {
        return {
          nodes: vars.ids.map((id) => mockNodes[id] || null),
        };
      };

      const existingIssues = [
        issueActive,
        issueClosed,
        issueAssigned,
        issueClaimed,
        issueDeleted,
      ];

      const result = await reconcileExistingIssues(existingIssues, {
        graphqlClient: mockGraphQLClient,
      });

      assert.equal(result.activeIssues.length, 1);
      assert.equal(result.activeIssues[0].id, 'id-active');

      assert.equal(result.removedIssues.length, 4);
      assert.deepEqual(
        result.removedIssues.map((r) => ({ id: r.issue.id, reason: r.reason })),
        [
          { id: 'id-closed', reason: 'closed' },
          { id: 'id-assigned', reason: 'assigned' },
          { id: 'id-claimed', reason: 'claimed' },
          { id: 'id-deleted', reason: 'deleted' },
        ]
      );

      assert.equal(result.stats.closed, 1);
      assert.equal(result.stats.assigned, 1);
      assert.equal(result.stats.claimed, 1);
      assert.equal(result.stats.deleted, 1);
      assert.equal(result.stats.pr_opened, 0);
      assert.equal(result.stats.archived, 0);
    });

    test('supports batching when issues exceed batchSize', async () => {
      let callCount = 0;
      const issues: EnrichedIssue[] = [];
      const mockNodes: any[] = [];

      for (let i = 0; i < 25; i++) {
        const id = `issue-${i}`;
        issues.push(createMockEnrichedIssue(id, 'test/repo', i + 1));
        mockNodes.push({
          id,
          state: 'OPEN',
          assignees: { totalCount: 0 },
          comments: { nodes: [] },
          timelineItems: { nodes: [] },
          repository: { isArchived: false },
        });
      }

      const mockGraphQLClient = async (_query: string, vars: { ids: string[] }) => {
        callCount++;
        return {
          nodes: vars.ids.map((id) => mockNodes.find((n) => n.id === id) || null),
        };
      };

      const result = await reconcileExistingIssues(issues, {
        graphqlClient: mockGraphQLClient,
        batchSize: 10,
      });

      assert.equal(callCount, 3, '25 items with batchSize 10 should make 3 GraphQL queries');
      assert.equal(result.activeIssues.length, 25);
      assert.equal(result.removedIssues.length, 0);
    });

    test('prunes issues older than maxAgeDays as too_old', async () => {
      const ancientIssue = createMockEnrichedIssue('ancient-id', 'test/ancient', 200);
      ancientIssue.createdAt = '2018-03-16T00:00:00Z'; // 8 years old

      const freshIssue = createMockEnrichedIssue('fresh-id', 'test/fresh', 1);
      freshIssue.createdAt = new Date().toISOString();

      const mockGraphQLClient = async (_query: string, vars: { ids: string[] }) => {
        return {
          nodes: vars.ids.map((id) => ({
            id,
            state: 'OPEN',
            assignees: { totalCount: 0 },
            comments: { nodes: [] },
            timelineItems: { nodes: [] },
            repository: { isArchived: false },
          })),
        };
      };

      const result = await reconcileExistingIssues([ancientIssue, freshIssue], {
        graphqlClient: mockGraphQLClient,
        maxAgeDays: 60,
      });

      assert.equal(result.activeIssues.length, 1);
      assert.equal(result.activeIssues[0].id, 'fresh-id');
      assert.equal(result.removedIssues.length, 1);
      assert.equal(result.removedIssues[0].reason, 'too_old');
      assert.equal(result.stats.too_old, 1);
    });

    test('fails safe and preserves issues if GraphQL error occurs', async () => {
      const issue1 = createMockEnrichedIssue('issue-1');
      const issue2 = createMockEnrichedIssue('issue-2');

      const mockFailingClient = async () => {
        throw new Error('500 Internal Server Error on GitHub API');
      };

      const result = await reconcileExistingIssues([issue1, issue2], {
        graphqlClient: mockFailingClient,
      });

      // Dataset should be preserved rather than wiped
      assert.equal(result.activeIssues.length, 2);
      assert.equal(result.removedIssues.length, 0);
    });
  });
});

