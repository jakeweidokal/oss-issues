import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test, { describe } from 'node:test';

describe('Frontend Static Site Integrity & User-First Contract', () => {
  const htmlPath = path.resolve('src/site/index.html');
  const aboutPath = path.resolve('src/site/about.html');
  const jsPath = path.resolve('src/site/app.js');

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const aboutContent = fs.readFileSync(aboutPath, 'utf8');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  test('about.html exists and provides clear user-first explanations', () => {
    assert.ok(fs.existsSync(aboutPath), 'about.html must exist in src/site');
    assert.ok(aboutContent.includes('About Quick Issues'));
    assert.ok(aboutContent.includes('How Quick Issues Works') || aboutContent.includes('How Quick Issues Filters'));
    assert.ok(aboutContent.includes('Solvability Score'));
    assert.ok(aboutContent.includes('Blast Radius'));
    assert.ok(aboutContent.includes('Setup Friction'));
    assert.ok(aboutContent.includes('How to Claim'));
  });

  test('styles.css does not block global body scrolling on document pages', () => {
    const cssPath = path.resolve('src/site/styles.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');
    assert.ok(!cssContent.includes('body {\n  font-family: var(--font-sans);\n  background-color: var(--bg-app);\n  color: var(--text-main);\n  height: 100vh;\n  overflow: hidden;'));
    assert.ok(cssContent.includes('body.app-layout {'));
  });

  test('index.html contains site explainer banner and link to about.html', () => {
    assert.ok(htmlContent.includes('about.html'), 'index.html must link to about.html');
    assert.ok(htmlContent.includes('What is this?'));
  });

  test('index.html contains all critical DOM elements referenced in app.js', () => {
    const requiredIds = [
      'issues-list',
      'stat-count-badge',
      'list-count-label',
      'search-input',
      'blast-radius-filter',
      'friction-filter',
      'language-filter',
      'sort-by',
      'list-pane',
      'detail-pane',
      'detail-empty',
      'detail-content',
      'detail-repo',
      'detail-stars',
      'detail-lang',
      'detail-turnaround',
      'detail-title',
      'detail-score-badge',
      'detail-score-helper',
      'detail-blast-badge',
      'detail-friction-badge',
      'detail-friction-helper',
      'detail-summary',
      'detail-blast-reason',
      'detail-repro-container',
      'detail-repro-cmd',
      'detail-copy-repro',
      'detail-files-container',
      'detail-files-list',
      'detail-discovered',
      'detail-github-link',
      'toast',
    ];

    for (const id of requiredIds) {
      assert.ok(
        htmlContent.includes(`id="${id}"`),
        `index.html must contain element with id="${id}"`
      );
    }
  });

  test('app.js includes self-descriptive helper functions', () => {
    assert.ok(jsContent.includes('getSolvabilityLabel'));
    assert.ok(jsContent.includes('getSolvabilityHelper'));
    assert.ok(jsContent.includes('getFrictionLabel'));
    assert.ok(jsContent.includes('getFrictionHelper'));
    assert.ok(jsContent.includes('getBlastRadiusLabel'));
  });
});
