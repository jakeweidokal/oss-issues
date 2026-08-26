import * as fs from 'node:fs';
import * as path from 'node:path';
import 'dotenv/config';
import { generateRssFeed } from './feed.js';
import { fetchAndFilterCandidateIssues } from './ingest.js';
import { inspectCandidateRepo } from './inspect.js';
import { analyzeIssueSemantics } from './semantic.js';
import {
  type EnrichedIssue,
  EnrichedIssueSchema,
  type HistoryItem,
  type RunnerOptions,
} from './types.js';

function parseCliArgs(): RunnerOptions {
  const args = process.argv.slice(2);
  const options: RunnerOptions = {};

  for (const arg of args) {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--skip-clone') {
      options.skipClone = true;
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--query=')) {
      options.query = arg.split('=').slice(1).join('=');
    }
  }

  return options;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SITE_DATA_DIR = path.resolve(process.cwd(), 'src/site/data');
const ISSUES_PATH = path.join(DATA_DIR, 'issues.json');
const HISTORY_PATH = path.join(DATA_DIR, 'history.json');
const FEED_PATH = path.join(DATA_DIR, 'feed.xml');

function loadJson<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.warn(`[Runner] Could not load ${filePath}, using fallback:`, err);
  }
  return fallback;
}

function saveJson(filePath: string, data: any): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export async function runPipeline(options: RunnerOptions = {}): Promise<void> {
  const isVerbose = Boolean(options.verbose);
  const isDryRun = Boolean(options.dryRun);
  const limit = options.limit || 15;

  console.log('====================================================');
  console.log('⚡ Quick Issues Scanner');
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log(`🔧 Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE PRODUCTION'}`);
  console.log(`🎯 Issue Limit: ${limit}`);
  console.log('====================================================\n');

  // 1. Ingest & Filter Candidates
  console.log('🔍 Step 1: Querying GitHub GraphQL & applying heuristic filters...');
  const { accepted, skippedReasons } = await fetchAndFilterCandidateIssues({
    limit,
    customQuery: options.query,
    verbose: isVerbose,
  });

  console.log(`\n✅ Ingest complete. ${accepted.length} candidates passed initial heuristic filters.`);
  console.log('📊 Filtering Drop Breakdown:', JSON.stringify(skippedReasons, null, 2));

  if (accepted.length === 0) {
    console.log('ℹ️ No new candidates to process. Exiting.');
    return;
  }

  // 2. Load History & Existing Dataset (enforce min 200 stars & real repos)
  const history: Record<string, HistoryItem> = loadJson(HISTORY_PATH, {});
  const existingIssues: EnrichedIssue[] = loadJson<EnrichedIssue[]>(ISSUES_PATH, []).filter(
    (i: EnrichedIssue) => (i.stars || 0) >= 200 && !i.repo.startsWith('example/')
  );
  const existingMap = new Map<string, EnrichedIssue>(
    existingIssues.map((i) => [i.id, i])
  );

  const enrichedList: EnrichedIssue[] = [];

  // 3. Process Each Candidate
  console.log('\n🔬 Step 2 & 3: Local Code Inspection & Gemini Semantic Analysis...');
  for (let i = 0; i < accepted.length; i++) {
    const candidate = accepted[i];
    console.log(`\n[${i + 1}/${accepted.length}] Evaluating ${candidate.repo}#${candidate.number} - "${candidate.title.slice(0, 60)}..."`);

    // Check if already processed recently
    if (history[candidate.id] && !isDryRun) {
      console.log(`  ↪ Already in history (status: ${history[candidate.id].status}). Skipping re-analysis.`);
      if (existingMap.has(candidate.id)) {
        enrichedList.push(existingMap.get(candidate.id)!);
      }
      continue;
    }

    // Step 2: Shallow clone & static analysis
    let staticResult: import('./types.js').StaticAnalysisResult = {
      candidateFiles: [],
      hasAdjoiningTests: false,
      isolationScore: 'Medium',
    };

    if (!options.skipClone) {
      try {
        console.log(`  📁 Inspecting code isolation in ${candidate.repo}...`);
        staticResult = await inspectCandidateRepo(candidate, { verbose: isVerbose });
        console.log(
          `  🔍 Files: [${staticResult.candidateFiles.join(', ') || 'none'}], Isolation: ${staticResult.isolationScore}, Tests: ${staticResult.hasAdjoiningTests}`
        );
      } catch (err: any) {
        console.warn(`  ⚠️ Static analysis error:`, err?.message || err);
      }
    }

    // Step 3: Semantic scoping with Gemini 1.5 Flash
    console.log('  🤖 Running Gemini semantic scoping...');
    const semanticResult = await analyzeIssueSemantics(candidate, staticResult, {
      verbose: isVerbose,
      dryRun: isDryRun,
    });

    console.log(`  ✨ Blast Radius: ${semanticResult.blastRadius} | Friction: ${semanticResult.setupFriction} | Solvability: ${semanticResult.solvabilityScore}/10`);

    const enriched: EnrichedIssue = {
      id: candidate.id,
      number: candidate.number,
      title: candidate.title,
      url: candidate.url,
      repo: candidate.repo,
      repoUrl: candidate.repoUrl,
      stars: candidate.stars,
      language: candidate.language,
      labels: candidate.labels,
      createdAt: candidate.createdAt,
      updatedAt: candidate.updatedAt,
      blastRadius: semanticResult.blastRadius,
      blastRadiusReason: semanticResult.blastRadiusReason,
      setupFriction: semanticResult.setupFriction,
      quickReproCommand: semanticResult.quickReproCommand,
      solvabilityScore: semanticResult.solvabilityScore,
      keyFiles: semanticResult.keyFiles,
      summary: semanticResult.summary,
      maintainerTurnaroundDays: candidate.maintainerTurnaroundDays,
      defaultBranch: candidate.defaultBranch,
      discoveredAt: new Date().toISOString(),
    };

    // Validate schema
    const parsed = EnrichedIssueSchema.safeParse(enriched);
    if (!parsed.success) {
      console.error('  ❌ Validation error on enriched issue:', parsed.error.format());
      continue;
    }

    enrichedList.push(enriched);
    existingMap.set(enriched.id, enriched);

    history[candidate.id] = {
      id: candidate.id,
      url: candidate.url,
      repo: candidate.repo,
      title: candidate.title,
      discoveredAt: enriched.discoveredAt,
      status: 'published',
    };
  }

  // 4. Merge & Sort Dataset
  const allIssues = Array.from(existingMap.values());
  allIssues.sort((a, b) => {
    // Sort primarily by solvability score desc, then discoveredAt desc
    if (b.solvabilityScore !== a.solvabilityScore) {
      return b.solvabilityScore - a.solvabilityScore;
    }
    return new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
  });

  // Keep top 150 active issues
  const finalDataset = allIssues.slice(0, 150);

  // 5. Generate RSS Feed
  console.log('\n📰 Step 4: Generating RSS/Atom feed...');
  const rssXml = generateRssFeed(finalDataset);

  // 6. Save Data Files
  if (!isDryRun) {
    console.log(`💾 Step 5: Writing ${finalDataset.length} issues to ${ISSUES_PATH}...`);
    saveJson(ISSUES_PATH, finalDataset);
    saveJson(HISTORY_PATH, history);

    const dir = path.dirname(FEED_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FEED_PATH, rssXml, 'utf8');

    // Also sync to src/site/data for local/pages preview
    saveJson(path.join(SITE_DATA_DIR, 'issues.json'), finalDataset);
    if (!fs.existsSync(SITE_DATA_DIR)) fs.mkdirSync(SITE_DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(SITE_DATA_DIR, 'feed.xml'), rssXml, 'utf8');

    console.log('✅ All data and feed files successfully updated!');
  } else {
    console.log(`\n[DRY RUN] Would write ${finalDataset.length} issues to ${ISSUES_PATH}.`);
  }

  console.log('\n🎉 Pipeline run completed successfully!\n');
}

// Execute if run directly
const isDirectRun = process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js');
if (isDirectRun) {
  const options = parseCliArgs();
  runPipeline(options).catch((err) => {
    console.error('\n❌ Fatal error in scanner pipeline:', err);
    process.exit(1);
  });
}
