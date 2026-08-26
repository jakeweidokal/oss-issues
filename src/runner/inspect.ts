import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CandidateIssue, StaticAnalysisResult } from './types.js';

const FILE_PATH_REGEX =
  /(?:^|[\s`('"])([a-zA-Z0-9_\-./]+\.(?:ts|tsx|js|jsx|py|go|rs|java|c|cpp|rb|php|vue|svelte|css|html|json|yaml|yml))(?::\d+)?(?:[\s`'")]|$)/g;

const BACKTICK_SYMBOL_REGEX = /`([a-zA-Z0-9_$.]{3,50})`/g;

const EXCLUDE_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  'vendor',
  '.next',
  '.cache',
  'coverage',
  '.venv',
  'venv',
  'target',
]);

export function findAdjoiningTestFile(cloneDir: string, filePath: string): string | undefined {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  const testCandidates = [
    // Same dir test variations
    path.join(dir, `${baseName}.test${ext}`),
    path.join(dir, `${baseName}.spec${ext}`),
    path.join(dir, `test_${baseName}${ext}`),
    path.join(dir, `${baseName}_test${ext}`),
    // __tests__ dir
    path.join(dir, '__tests__', `${baseName}.test${ext}`),
    path.join(dir, '__tests__', `${baseName}.spec${ext}`),
    path.join(dir, '__tests__', `${baseName}${ext}`),
    // tests root variations
    path.join('tests', `${baseName}.test${ext}`),
    path.join('tests', `test_${baseName}${ext}`),
    path.join('test', `${baseName}.test${ext}`),
    path.join('test', `test_${baseName}${ext}`),
    path.join('tests', 'unit', `${baseName}.test${ext}`),
  ];

  for (const candidate of testCandidates) {
    const fullPath = path.join(cloneDir, candidate);
    if (fs.existsSync(fullPath)) {
      return candidate.replace(/\\/g, '/');
    }
  }

  return undefined;
}

export function countImports(content: string, ext: string): number {
  let count = 0;
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed.startsWith('import ') ||
      trimmed.startsWith('export * from') ||
      trimmed.startsWith('const ') && trimmed.includes('require(') ||
      trimmed.startsWith('from ') && trimmed.includes('import ') ||
      trimmed.startsWith('use ') && (ext === '.rs' || ext === '.php') ||
      trimmed.startsWith('#include ')
    ) {
      count++;
    }
  }

  return count;
}

export function inferReproCommand(
  language: string | null,
  testFile: string | undefined,
  targetFile: string | undefined
): string | undefined {
  const lang = (language || '').toLowerCase();
  const testPath = testFile || targetFile;

  if (!testPath) {
    if (lang === 'typescript' || lang === 'javascript') return 'pnpm test';
    if (lang === 'python') return 'pytest';
    if (lang === 'go') return 'go test ./...';
    if (lang === 'rust') return 'cargo test';
    return undefined;
  }

  if (lang === 'typescript' || lang === 'javascript') {
    return `pnpm test ${testPath}`;
  }
  if (lang === 'python') {
    return `pytest ${testPath}`;
  }
  if (lang === 'go') {
    return `go test -v ./${path.dirname(testPath).replace(/\\/g, '/')}`;
  }
  if (lang === 'rust') {
    return `cargo test --test ${path.basename(testPath, path.extname(testPath))}`;
  }

  return undefined;
}

function searchRepoFiles(
  cloneDir: string,
  symbols: string[],
  maxFiles = 3
): string[] {
  const matchedFiles: Set<string> = new Set();

  function walk(currentDir: string, depth = 0) {
    if (depth > 6 || matchedFiles.size >= maxFiles) return;

    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.has(entry.name)) {
          walk(path.join(currentDir, entry.name), depth + 1);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (
          ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java', '.rb'].includes(
            ext
          )
        ) {
          const relPath = path
            .relative(cloneDir, path.join(currentDir, entry.name))
            .replace(/\\/g, '/');

          // Check if filename itself matches a symbol
          for (const sym of symbols) {
            if (entry.name.toLowerCase().includes(sym.toLowerCase())) {
              matchedFiles.add(relPath);
              break;
            }
          }

          if (matchedFiles.size >= maxFiles) return;
        }
      }
    }
  }

  walk(cloneDir);
  return Array.from(matchedFiles);
}

export async function inspectCandidateRepo(
  issue: CandidateIssue,
  options: { verbose?: boolean; timeoutMs?: number } = {}
): Promise<StaticAnalysisResult> {
  const tempDir = path.join(
    os.tmpdir(),
    `oss-inspect-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );

  if (options.verbose) {
    console.log(`[Inspect] Shallow cloning ${issue.repo} into ${tempDir}...`);
  }

  try {
    // Ephemeral shallow clone (--depth=1)
    const cloneUrl = `${issue.repoUrl}.git`;
    execSync(
      `git clone --depth 1 --single-branch --branch "${issue.defaultBranch}" "${cloneUrl}" "${tempDir}"`,
      {
        stdio: 'ignore',
        timeout: options.timeoutMs || 25000,
      }
    );

    // 1. Extract candidate files from issue markdown
    const fullText = `${issue.title}\n${issue.body}`;
    const candidateMatches = new Set<string>();

    let match: RegExpExecArray | null;
    while ((match = FILE_PATH_REGEX.exec(fullText)) !== null) {
      const candidate = match[1].trim();
      const resolved = path.join(tempDir, candidate);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        candidateMatches.add(candidate.replace(/\\/g, '/'));
      }
    }

    // 2. Extract backtick symbols if no explicit file path was matched
    if (candidateMatches.size === 0) {
      const symbols: string[] = [];
      while ((match = BACKTICK_SYMBOL_REGEX.exec(fullText)) !== null) {
        if (match[1].length > 3) {
          symbols.push(match[1]);
        }
      }

      if (symbols.length > 0) {
        const found = searchRepoFiles(tempDir, symbols, 3);
        for (const f of found) {
          candidateMatches.add(f);
        }
      }
    }

    const candidateFiles = Array.from(candidateMatches).slice(0, 3);
    const topFile = candidateFiles[0];

    let targetFileSnippet: string | undefined;
    let importCount: number | undefined;
    let testFile: string | undefined;

    if (topFile) {
      const fullPath = path.join(tempDir, topFile);
      if (fs.existsSync(fullPath)) {
        const fileContent = fs.readFileSync(fullPath, 'utf8');
        const ext = path.extname(topFile);

        importCount = countImports(fileContent, ext);
        testFile = findAdjoiningTestFile(tempDir, topFile);

        // Take first 150 lines or up to 8KB
        const lines = fileContent.split('\n').slice(0, 150);
        targetFileSnippet = lines.join('\n').slice(0, 8000);
      }
    }

    const hasAdjoiningTests = Boolean(testFile);
    let isolationScore: 'High' | 'Medium' | 'Low' = 'Medium';

    if (candidateFiles.length === 1 && (importCount ?? 0) < 15 && hasAdjoiningTests) {
      isolationScore = 'High';
    } else if (candidateFiles.length > 3 || (importCount ?? 0) > 30) {
      isolationScore = 'Low';
    }

    const inferredReproCommand = inferReproCommand(
      issue.language,
      testFile,
      topFile
    );

    return {
      candidateFiles,
      targetFileSnippet,
      testFile,
      importCount,
      hasAdjoiningTests,
      isolationScore,
      inferredReproCommand,
    };
  } catch (err: any) {
    if (options.verbose) {
      console.warn(`[Inspect] Inspection failed for ${issue.repo}:`, err?.message || err);
    }
    return {
      candidateFiles: [],
      hasAdjoiningTests: false,
      isolationScore: 'Medium',
    };
  } finally {
    // Guarantee cleanup of ephemeral clone directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup error
    }
  }
}
