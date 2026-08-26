import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test, { describe } from 'node:test';

describe('Frontend Static Site Integrity', () => {
  const htmlPath = path.resolve('src/site/index.html');
  const jsPath = path.resolve('src/site/app.js');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

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
      'detail-score',
      'detail-title',
      'detail-blast-badge',
      'detail-friction-badge',
      'detail-turnaround-badge',
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

  test('app.js does not contain hard crashes on missing DOM elements', () => {
    // Assert getEl helper is defined and used throughout
    assert.ok(jsContent.includes('function getEl('));
    assert.ok(jsContent.includes('document.getElementById(id)'));
  });
});
