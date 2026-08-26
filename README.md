# ⚡ Quick Issues

[![Scan OSS Issues & Publish](https://github.com/jakeweidokal/oss-issues/actions/workflows/scan.yml/badge.svg)](https://github.com/jakeweidokal/oss-issues/actions/workflows/scan.yml)
[![Live Site](https://img.shields.io/badge/Live%20Site-Quick%20Issues-zinc)](https://jakeweidokal.github.io/oss-issues/)
[![RSS Feed](https://img.shields.io/badge/Feed-RSS%202.0-orange)](https://jakeweidokal.github.io/oss-issues/data/feed.xml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An automated, zero-cost pipeline scanning GitHub for verified, solvable open-source issues with low blast radius, minimal setup friction, and responsive maintainers.

- **Live Directory**: [jakeweidokal.github.io/oss-issues](https://jakeweidokal.github.io/oss-issues/) (Future: `quickissues.dev`)
- **RSS Feed**: [jakeweidokal.github.io/oss-issues/data/feed.xml](https://jakeweidokal.github.io/oss-issues/data/feed.xml)

---

## ⚡ Highlights

- **$0 Operating Cost**: Runs entirely on GitHub Actions public runners, GitHub GraphQL API free quotas, ephemeral ripgrep/AST inspection, and Gemini 1.5 Flash.
- **Maintainer Responsiveness Guard**: Excludes stale or ghost issues by measuring repository push recency (≤ 14 days) and median PR review turnaround time (≤ 7 days).
- **Claim & Collision Detection**: Regex-scans recent issue comments to eliminate tickets already being worked on.
- **Local Code Isolation**: Shallow clones candidate repositories (`--depth=1`) in ephemeral CI to evaluate import count and find adjoining test files (`*.test.ts`, `*.spec.js`, `test_*.py`).
- **Targeted Semantic Scoping**: Uses Gemini 1.5 Flash in structured JSON schema mode to extract blast radius, setup friction, solvability ratings (1–10), and quick reproduction test commands.
- **Minimal, Fast Static UI**: Clean, editorial-style stream of issues with instant client-side search, multi-faceted filtering, and dark mode support.

---

## 🚀 Local Development

```bash
git clone https://github.com/jakeweidokal/oss-issues.git
cd oss-issues
pnpm install

# Run scanner in dry-run mode
pnpm scan:dry --limit=5

# Live scanner run
pnpm scan --limit=10

# Build static assets
pnpm build:site
```

---

## 📄 License

MIT © [Jake Weidokal](https://weidok.al)
