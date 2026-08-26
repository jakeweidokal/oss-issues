import { z } from 'zod';

export const EnrichedIssueSchema = z.object({
  id: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  repo: z.string(),
  repoUrl: z.string(),
  stars: z.number(),
  language: z.string().nullable(),
  labels: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
  blastRadius: z.enum(['Low', 'Medium', 'High']),
  blastRadiusReason: z.string(),
  setupFriction: z.enum([
    'Zero-dependency',
    'Standard',
    'Docker required',
    'Local DB required',
    'Complex',
  ]),
  quickReproCommand: z.string().nullable(),
  solvabilityScore: z.number().min(1).max(10),
  keyFiles: z.array(z.string()),
  summary: z.string(),
  maintainerTurnaroundDays: z.number(),
  defaultBranch: z.string(),
  discoveredAt: z.string(),
});

export type EnrichedIssue = z.infer<typeof EnrichedIssueSchema>;

export interface RawGraphQLComment {
  body: string;
  createdAt: string;
  author: { login: string } | null;
}

export interface RawGraphQLPR {
  createdAt: string;
  closedAt: string | null;
  reviews: {
    nodes: Array<{ createdAt: string }>;
  };
}

export interface RawGraphQLIssueNode {
  id: string;
  number: number;
  title: string;
  url: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: { login: string } | null;
  assignees: { totalCount: number };
  labels: { nodes: Array<{ name: string }> };
  comments: {
    nodes: RawGraphQLComment[];
  };
  timelineItems: {
    nodes: Array<{
      source?: { state?: string; url?: string };
      subject?: { state?: string; url?: string };
    }>;
  };
  repository: {
    nameWithOwner: string;
    url: string;
    stargazerCount: number;
    pushedAt: string;
    primaryLanguage: { name: string } | null;
    defaultBranchRef: { name: string } | null;
    pullRequests: {
      nodes: RawGraphQLPR[];
    };
  };
}

export interface CandidateIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  body: string;
  repo: string;
  repoUrl: string;
  stars: number;
  language: string | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
  defaultBranch: string;
  maintainerTurnaroundDays: number;
}

export interface StaticAnalysisResult {
  candidateFiles: string[];
  targetFileSnippet?: string;
  testFile?: string;
  importCount?: number;
  hasAdjoiningTests: boolean;
  isolationScore: 'High' | 'Medium' | 'Low';
  inferredReproCommand?: string;
}

export interface SemanticAnalysisResult {
  blastRadius: 'Low' | 'Medium' | 'High';
  blastRadiusReason: string;
  setupFriction: 'Zero-dependency' | 'Standard' | 'Docker required' | 'Local DB required' | 'Complex';
  quickReproCommand: string | null;
  solvabilityScore: number;
  keyFiles: string[];
  summary: string;
}

export interface HistoryItem {
  id: string;
  url: string;
  repo: string;
  title: string;
  discoveredAt: string;
  status: 'published' | 'skipped' | 'filtered';
  reason?: string;
}

export interface RunnerOptions {
  dryRun?: boolean;
  limit?: number;
  skipClone?: boolean;
  query?: string;
  verbose?: boolean;
}
