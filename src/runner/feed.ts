import { create } from 'xmlbuilder2';
import type { EnrichedIssue } from './types.js';

export function generateRssFeed(
  issues: EnrichedIssue[],
  siteUrl = 'https://jakeweidokal.github.io/oss-issues/'
): string {
  const feedObj = {
    rss: {
      '@version': '2.0',
      '@xmlns:atom': 'http://www.w3.org/2005/Atom',
      channel: {
        title: 'Quick Issues — Curated, Solvable Open Source Issues',
        link: siteUrl,
        description:
          'Curated open-source issues scored for low blast radius, minimal setup friction, and active maintainer turnaround.',
        language: 'en-us',
        lastBuildDate: new Date().toUTCString(),
        'atom:link': {
          '@href': `${siteUrl}data/feed.xml`,
          '@rel': 'self',
          '@type': 'application/rss+xml',
        },
        item: issues.slice(0, 50).map((issue) => {
          const reproHtml = issue.quickReproCommand
            ? `<p><strong>Repro Command:</strong> <code>${escapeForHtml(issue.quickReproCommand)}</code></p>`
            : '';

          const htmlDescription = `
<p><strong>Repository:</strong> <a href="${issue.repoUrl}">${issue.repo}</a> (${issue.stars} ⭐, ${issue.language || 'Multi-language'})</p>
<p><strong>Solvability Score:</strong> ${issue.solvabilityScore}/10 | <strong>Blast Radius:</strong> ${issue.blastRadius} | <strong>Setup Friction:</strong> ${issue.setupFriction}</p>
<p><strong>Summary:</strong> ${escapeForHtml(issue.summary)}</p>
<p><strong>Blast Radius Analysis:</strong> ${escapeForHtml(issue.blastRadiusReason)}</p>
${reproHtml}
<p><a href="${issue.url}">View and Claim Issue on GitHub →</a></p>
`.trim();

          return {
            title: `[${issue.repo}] #${issue.number} ${issue.title} (Solvability: ${issue.solvabilityScore}/10)`,
            link: issue.url,
            guid: {
              '@isPermaLink': 'true',
              '#': issue.url,
            },
            pubDate: new Date(issue.createdAt).toUTCString(),
            description: {
              $: htmlDescription,
            },
            category: [
              issue.language || 'General',
              `blast-radius-${issue.blastRadius.toLowerCase()}`,
              `friction-${issue.setupFriction.toLowerCase().replace(/\s+/g, '-')}`,
              ...issue.labels,
            ],
          };
        }),
      },
    },
  };

  const doc = create({ version: '1.0', encoding: 'UTF-8' }, feedObj);
  return doc.end({ prettyPrint: true });
}

function escapeForHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
