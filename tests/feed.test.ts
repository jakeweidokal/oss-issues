import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { create } from 'xmlbuilder2';
import { generateRssFeed } from '../src/runner/feed.js';
import type { EnrichedIssue } from '../src/runner/types.js';

describe('RSS Feed Generation', () => {
  const mockIssues: EnrichedIssue[] = [
    {
      id: 'issue-1',
      number: 42,
      title: 'Fix: parse date & time with <special> characters & "quotes"',
      url: 'https://github.com/example/repo/issues/42',
      repo: 'example/repo',
      repoUrl: 'https://github.com/example/repo',
      stars: 1500,
      language: 'TypeScript',
      labels: ['good first issue', 'bug'],
      createdAt: '2026-08-25T10:00:00Z',
      updatedAt: '2026-08-26T10:00:00Z',
      blastRadius: 'Low',
      blastRadiusReason: 'Isolated to date parser module & adjoining tests.',
      setupFriction: 'Zero-dependency',
      quickReproCommand: 'pnpm test tests/date.test.ts --filter "date & time <iso>"',
      solvabilityScore: 9,
      keyFiles: ['src/parser.ts', 'tests/date.test.ts'],
      summary: 'Add support for ISO-8601 timestamps with <custom> timezone offsets.',
      maintainerTurnaroundDays: 1.2,
      defaultBranch: 'main',
      discoveredAt: '2026-08-26T12:00:00Z',
    },
    {
      id: 'issue-2',
      number: 108,
      title: 'Implement CLI flag `--dry-run` & verify stderr output',
      url: 'https://github.com/example/cli/issues/108',
      repo: 'example/cli',
      repoUrl: 'https://github.com/example/cli',
      stars: 450,
      language: 'Rust',
      labels: ['help wanted'],
      createdAt: '2026-08-24T08:00:00Z',
      updatedAt: '2026-08-25T08:00:00Z',
      blastRadius: 'Medium',
      blastRadiusReason: 'Modifies CLI argument parser.',
      setupFriction: 'Standard',
      quickReproCommand: null,
      solvabilityScore: 7,
      keyFiles: ['src/main.rs'],
      summary: 'Parse --dry-run flag before executing commands.',
      maintainerTurnaroundDays: 2.5,
      defaultBranch: 'main',
      discoveredAt: '2026-08-26T12:00:00Z',
    },
  ];

  test('generates valid, parseable XML without undeclared entity errors', () => {
    const xml = generateRssFeed(mockIssues, 'https://quickissues.dev/');

    // Assert XML is string and non-empty
    assert.ok(xml && xml.length > 0);
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));

    // Assert it contains Quick Issues channel title
    assert.ok(xml.includes('<title>Quick Issues — Curated, Solvable Open Source Issues</title>'));

    // Assert it contains proper CDATA sections
    assert.ok(xml.includes('<![CDATA['));
    assert.ok(xml.includes(']]>'));

    // Assert that raw invalid HTML entities like &rarr; are NOT in the XML
    assert.ok(!xml.includes('&rarr;'));
    assert.ok(xml.includes('View and Claim Issue on GitHub →'));

    // STRICT XML VALIDATION: Parse generated XML using xmlbuilder2 parser
    assert.doesNotThrow(() => {
      const parsed = create(xml);
      assert.ok(parsed);
      const items = parsed.root().find((n: any) => n.node.nodeName === 'item', true, true);
      assert.ok(items);
    }, 'Generated RSS feed XML must parse without any XML entity or syntax errors');
  });

  test('escapes special characters inside summaries and repro commands', () => {
    const xml = generateRssFeed(mockIssues);
    // <special> inside summary should be escaped to &lt;special&gt; within the CDATA or element
    assert.ok(xml.includes('&lt;special&gt;') || xml.includes('<special>'));
    assert.ok(xml.includes('pnpm test tests/date.test.ts'));
  });
});
