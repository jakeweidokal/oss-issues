Plan and design an automated, zero-cost pipeline that scans GitHub for verified, solvable open-source issues and outputs an enriched static dataset.

### Core Objective
Build a lightweight, serverless scanner running on GitHub Actions that queries the GitHub GraphQL API, filters out phantom/stale/claimed issues, runs local AST and semantic analysis to score issue blast radius and setup friction, and commits a structured `issues.json` file for static frontend consumption.

### Architectural Constraints & Requirements
1. Operating Cost: Must run strictly at $0.00 using GitHub Actions (public runner), GitHub GraphQL API free quotas, local AST/ripgrep tools, and the free-tier Gemini API (for targeted file-level analysis only).
2. Data Flow:
   - Step 1 (Ingest & Filter): Batch-query GitHub GraphQL for repos with >200 stars, active pushes within 14 days, and `good first issue` / `help wanted` labels. Exclude assigned tickets, tickets with recent "claim" comments, and repos with slow maintainer review turnaround (>7 days to PR review).
   - Step 2 (Local Code Inspection): Shallow clone candidate repos (--depth=1) in the ephemeral CI runner. Locate candidate files using ripgrep and tree-sitter. Measure module isolation (import count) and verify if adjacent unit test files exist.
   - Step 3 (Targeted Semantic Scoping): For isolated issues, pass only the issue body and the identified target file/test paths to Gemini 1.5 Flash to extract:
     * Blast Radius score (Low / Medium / High)
     * Setup Friction (Zero-dependency / Docker required / Local DB required)
     * Quick reproduction command (e.g., `pnpm test path/to/spec`)
   - Step 4 (Static Publishing): Output an aggregated `data/issues.json` and a static RSS/Atom feed, committed back to the repository for hosting on GitHub Pages / Cloudflare Pages.

### Please Break Down the Plan Into:
1. Repository structure and tech stack choices (Python vs TypeScript for the runner script).
2. The GitHub GraphQL query and filtering logic (including maintainer responsiveness metrics and regex claim filters).
3. The local static analysis pipeline (AST / dependency checks to determine blast radius before calling any API).
4. The structured prompt and JSON response schema for the Gemini Flash semantic step.
5. The GitHub Actions workflow YAML configuration, including cron triggers, secret handling, caching, and auto-committing the generated static output.
6. A minimal, single-file static frontend architecture to display and filter the resulting dataset.
