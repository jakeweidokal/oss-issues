import { GoogleGenAI, Type } from '@google/genai';
import type {
  CandidateIssue,
  SemanticAnalysisResult,
  StaticAnalysisResult,
} from './types.js';

export function getGeminiApiKey(): string | undefined {
  return process.env.GEMINI_API_KEY?.trim() || undefined;
}

export function heuristicSemanticFallback(
  issue: CandidateIssue,
  staticAnalysis: StaticAnalysisResult
): SemanticAnalysisResult {
  const blastRadius: 'Low' | 'Medium' | 'High' =
    staticAnalysis.isolationScore === 'High'
      ? 'Low'
      : staticAnalysis.isolationScore === 'Medium'
      ? 'Medium'
      : 'High';

  const blastRadiusReason =
    staticAnalysis.isolationScore === 'High'
      ? 'Changes appear localized to a single module with existing unit tests.'
      : 'Requires modifying standard application logic across several files.';

  const isDockerMentioned =
    issue.body.toLowerCase().includes('docker-compose') ||
    issue.body.toLowerCase().includes('docker run');
  const isDbMentioned =
    issue.body.toLowerCase().includes('postgres') ||
    issue.body.toLowerCase().includes('database') ||
    issue.body.toLowerCase().includes('mongodb');

  const setupFriction = isDockerMentioned
    ? 'Docker required'
    : isDbMentioned
    ? 'Local DB required'
    : 'Standard';

  const solvabilityScore =
    staticAnalysis.isolationScore === 'High' ? 8 : staticAnalysis.isolationScore === 'Medium' ? 6 : 4;

  const keyFiles = staticAnalysis.candidateFiles.length > 0
    ? staticAnalysis.candidateFiles
    : ['src/index'];

  return {
    blastRadius,
    blastRadiusReason,
    setupFriction,
    quickReproCommand: staticAnalysis.inferredReproCommand || null,
    solvabilityScore,
    keyFiles,
    summary: `Fix issue #${issue.number} in ${issue.repo}: ${issue.title}`,
  };
}

export async function analyzeIssueSemantics(
  issue: CandidateIssue,
  staticAnalysis: StaticAnalysisResult,
  options: { verbose?: boolean; dryRun?: boolean } = {}
): Promise<SemanticAnalysisResult> {
  const apiKey = getGeminiApiKey();

  if (!apiKey || options.dryRun) {
    if (options.verbose) {
      console.log(
        `[Semantic] ${
          options.dryRun ? 'Dry-run mode' : 'GEMINI_API_KEY not set'
        }. Using heuristic fallback for #${issue.number} in ${issue.repo}`
      );
    }
    return heuristicSemanticFallback(issue, staticAnalysis);
  }

  const ai = new GoogleGenAI({ apiKey });

  const targetFileSnippet = staticAnalysis.targetFileSnippet
    ? `\n--- Target File Outline/Snippet ---\n${staticAnalysis.targetFileSnippet}\n---`
    : '';

  const prompt = `You are a staff engineer triaging open-source issues for new contributors.
Analyze this issue and repository context to score its blast radius, setup friction, reproduction command, and solvability.

Repository: ${issue.repo} (${issue.stars} stars, primary language: ${issue.language || 'Unknown'})
Issue #${issue.number}: ${issue.title}
Issue Labels: ${issue.labels.join(', ')}

Issue Description:
${issue.body.slice(0, 4000)}

Static Analysis Context:
- Identified Candidate Files: ${staticAnalysis.candidateFiles.join(', ') || 'None located'}
- Sibling / Adjoining Unit Test: ${staticAnalysis.testFile || 'None located'}
- Inferred Repro Command: ${staticAnalysis.inferredReproCommand || 'None'}
- Module Isolation: ${staticAnalysis.isolationScore} (${staticAnalysis.importCount ?? 0} imports)
${targetFileSnippet}

Guidelines:
1. Blast Radius:
   - "Low": Localized bug fix or small feature in an isolated file/function.
   - "Medium": Touches multiple modules or core utilities with tests.
   - "High": Architectural refactor, public API breakage, or cross-cutting dependency changes.
2. Setup Friction:
   - "Zero-dependency": Pure library/algorithm with standard build tools.
   - "Standard": Standard language runtime install (e.g. npm/pnpm/pip/cargo).
   - "Docker required": Explicitly requires Docker/containers to run.
   - "Local DB required": Requires PostgreSQL, Redis, Mongo, or other external databases.
   - "Complex": Requires multiple third-party API keys, hardware, or multi-service topology.
3. Quick Repro Command: Exact command to run the reproduction or unit test (e.g. \`pnpm test path/to/spec.ts\` or \`pytest tests/test_foo.py\`).
4. Solvability Score: Integer from 1 (nearly impossible without deep context) to 10 (exceptionally clear, localized, easily testable).
5. Summary: 2 concise sentences explaining what needs to be fixed and where.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            blastRadius: {
              type: Type.STRING,
              enum: ['Low', 'Medium', 'High'],
            },
            blastRadiusReason: {
              type: Type.STRING,
            },
            setupFriction: {
              type: Type.STRING,
              enum: [
                'Zero-dependency',
                'Standard',
                'Docker required',
                'Local DB required',
                'Complex',
              ],
            },
            quickReproCommand: {
              type: Type.STRING,
            },
            solvabilityScore: {
              type: Type.INTEGER,
            },
            keyFiles: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            summary: {
              type: Type.STRING,
            },
          },
          required: [
            'blastRadius',
            'blastRadiusReason',
            'setupFriction',
            'solvabilityScore',
            'keyFiles',
            'summary',
          ],
        },
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from Gemini API');
    }

    const parsed = JSON.parse(text);

    return {
      blastRadius: parsed.blastRadius || 'Medium',
      blastRadiusReason: parsed.blastRadiusReason || 'Standard localized issue',
      setupFriction: parsed.setupFriction || 'Standard',
      quickReproCommand: parsed.quickReproCommand || staticAnalysis.inferredReproCommand || null,
      solvabilityScore: Math.max(1, Math.min(10, parsed.solvabilityScore || 6)),
      keyFiles: Array.isArray(parsed.keyFiles) && parsed.keyFiles.length > 0
        ? parsed.keyFiles
        : staticAnalysis.candidateFiles,
      summary: parsed.summary || issue.title,
    };
  } catch (err: any) {
    if (options.verbose) {
      console.warn(
        `[Semantic] Gemini generation failed for ${issue.repo}#${issue.number}:`,
        err?.message || err
      );
    }
    return heuristicSemanticFallback(issue, staticAnalysis);
  }
}
