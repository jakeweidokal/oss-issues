import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test, { describe } from 'node:test';

describe('Frontend Static Site Integrity & Route 1 Stream Layout', () => {
  const htmlPath = path.resolve('src/site/index.html');
  const aboutPath = path.resolve('src/site/about.html');
  const jsPath = path.resolve('src/site/app.js');
  const cssPath = path.resolve('src/site/styles.css');

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const aboutContent = fs.readFileSync(aboutPath, 'utf8');
  const jsContent = fs.readFileSync(jsPath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  test('about.html exists and provides clear user-first explanations with full scroll', () => {
    assert.ok(fs.existsSync(aboutPath), 'about.html must exist in src/site');
    assert.ok(aboutContent.includes('About Quick Issues'));
    assert.ok(aboutContent.includes('How Quick Issues Works') || aboutContent.includes('How Quick Issues Filters'));
    assert.ok(aboutContent.includes('Solvability Score'));
    assert.ok(aboutContent.includes('Blast Radius'));
    assert.ok(aboutContent.includes('Setup Friction'));
    assert.ok(aboutContent.includes('How to Claim'));
    assert.ok(!aboutContent.includes('overflow: hidden'));
  });

  test('styles.css enables full vertical scrolling across all views', () => {
    assert.ok(!cssContent.includes('overflow: hidden'));
    assert.ok(cssContent.includes('overflow-y: auto'));
  });

  test('index.html contains first-class language tabs and search elements', () => {
    const requiredIds = [
      'stat-count-badge',
      'list-count-label',
      'language-tabs',
      'search-input',
      'blast-radius-filter',
      'sort-by',
      'issues-container',
      'toast',
    ];

    for (const id of requiredIds) {
      assert.ok(
        htmlContent.includes(`id="${id}"`),
        `index.html must contain element with id="${id}"`
      );
    }
  });

  test('index.html contains site explainer banner and link to about.html', () => {
    assert.ok(htmlContent.includes('about.html'), 'index.html must link to about.html');
    assert.ok(htmlContent.includes('How it works'));
  });

  test('app.js includes self-descriptive helper functions and language tab renderer', () => {
    assert.ok(jsContent.includes('renderLanguageTabs'));
    assert.ok(jsContent.includes('getSolvabilityLabel'));
    assert.ok(jsContent.includes('getBlastRadiusLabel'));
    assert.ok(jsContent.includes('getFrictionLabel'));
  });
});
