// Route 1: Single-Column Developer Stream with First-Class Language Tabs

let allIssues = [];
let filteredIssues = [];

const state = {
  selectedLanguage: 'all',
  searchQuery: '',
  blastRadius: 'all',
  sortBy: 'solvability',
};

// Safe DOM accessor
function getEl(id) {
  return document.getElementById(id);
}

// Helpers for user-friendly self-descriptive labels
function getSolvabilityLabel(score) {
  if (score >= 8) return `High Solvability (${score}/10)`;
  if (score >= 5) return `Moderate Solvability (${score}/10)`;
  return `Complex (${score}/10)`;
}

function getBlastRadiusLabel(blast) {
  if (blast === 'Low') return 'Low Blast (Isolated)';
  if (blast === 'Medium') return 'Medium Blast';
  if (blast === 'High') return 'High Blast';
  return `${blast} Blast`;
}

function getFrictionLabel(friction) {
  if (friction === 'Zero-dependency') return 'Zero-dep';
  if (friction === 'Standard') return 'Standard Install';
  if (friction === 'Docker required') return 'Docker Required';
  if (friction === 'Local DB required') return 'Local DB';
  return friction;
}

// Safe Lucide icon initializer
function safeCreateIcons() {
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    try {
      window.lucide.createIcons();
    } catch (err) {
      console.warn('Lucide icon error:', err);
    }
  }
}

// Load issues
async function loadIssues() {
  const container = getEl('issues-container');
  try {
    const candidatePaths = [
      'data/issues.json',
      './data/issues.json',
      '../data/issues.json',
      window.location.pathname.replace(/\/[^/]*$/, '') + '/data/issues.json',
    ];
    let response;

    for (const path of candidatePaths) {
      try {
        const res = await fetch(path);
        if (res && res.ok) {
          response = res;
          break;
        }
      } catch {
        // try next candidate path
      }
    }

    if (!response) {
      throw new Error('Failed to load issues dataset from any candidate path');
    }

    allIssues = await response.json();
    renderLanguageTabs();
    applyFiltersAndRender();
  } catch (err) {
    console.error('Error loading issues:', err);
    if (container) {
      container.innerHTML = '<div class="p-12 text-center text-xs text-zinc-500">Could not load issues dataset. Please check your network connection or try refreshing.</div>';
    }
  }
}

// Render first-class language filter tabs
function renderLanguageTabs() {
  const tabsContainer = getEl('language-tabs');
  if (!tabsContainer) return;

  const countsByLang = {};
  allIssues.forEach((issue) => {
    const lang = issue.language || 'Other';
    countsByLang[lang] = (countsByLang[lang] || 0) + 1;
  });

  const sortedLanguages = Object.keys(countsByLang).sort((a, b) => countsByLang[b] - countsByLang[a]);

  let html = `
    <button class="lang-pill ${state.selectedLanguage === 'all' ? 'active' : ''}" data-lang="all">
      All (${allIssues.length})
    </button>
  `;

  sortedLanguages.forEach((lang) => {
    const count = countsByLang[lang];
    const isActive = state.selectedLanguage === lang;
    html += `
      <button class="lang-pill ${isActive ? 'active' : ''}" data-lang="${escapeHtml(lang)}">
        ${escapeHtml(lang)} (${count})
      </button>
    `;
  });

  tabsContainer.innerHTML = html;

  // Attach click listeners to pills
  tabsContainer.querySelectorAll('.lang-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.selectedLanguage = btn.dataset.lang || 'all';
      renderLanguageTabs();
      applyFiltersAndRender();
    });
  });
}

function applyFiltersAndRender() {
  filteredIssues = allIssues.filter((issue) => {
    // Language Tab Filter
    if (state.selectedLanguage !== 'all') {
      const issueLang = issue.language || 'Other';
      if (issueLang !== state.selectedLanguage) {
        return false;
      }
    }

    // Search Query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchTitle = (issue.title || '').toLowerCase().includes(q);
      const matchRepo = (issue.repo || '').toLowerCase().includes(q);
      const matchSummary = (issue.summary || '').toLowerCase().includes(q);
      const matchFiles = (issue.keyFiles || []).some((f) => (f || '').toLowerCase().includes(q));
      if (!matchTitle && !matchRepo && !matchSummary && !matchFiles) {
        return false;
      }
    }

    // Blast Radius Filter
    if (state.blastRadius !== 'all' && issue.blastRadius !== state.blastRadius) {
      return false;
    }

    return true;
  });

  // Sort
  filteredIssues.sort((a, b) => {
    if (state.sortBy === 'solvability') {
      return b.solvabilityScore - a.solvabilityScore;
    }
    if (state.sortBy === 'stars') {
      return b.stars - a.stars;
    }
    if (state.sortBy === 'turnaround') {
      return a.maintainerTurnaroundDays - b.maintainerTurnaroundDays;
    }
    if (state.sortBy === 'recent') {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    }
    return 0;
  });

  const statBadge = getEl('stat-count-badge');
  if (statBadge) statBadge.textContent = `${allIssues.length} issues`;

  const countLabel = getEl('list-count-label');
  if (countLabel) {
    const langLabel = state.selectedLanguage === 'all' ? '' : ` ${state.selectedLanguage}`;
    countLabel.textContent = `${filteredIssues.length}${langLabel} matching`;
  }

  renderFeed();
}

function renderFeed() {
  const container = getEl('issues-container');
  if (!container) return;

  if (filteredIssues.length === 0) {
    container.innerHTML = `
      <div class="p-16 text-center border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
        <i data-lucide="inbox" class="w-8 h-8 mx-auto text-zinc-400 stroke-1"></i>
        <div class="text-sm font-semibold text-zinc-800 dark:text-zinc-200">No matching issues found</div>
        <p class="text-xs text-zinc-500">Try adjusting your language tab or search query.</p>
      </div>
    `;
    safeCreateIcons();
    return;
  }

  container.innerHTML = filteredIssues
    .map((issue) => {
      const validFiles = (issue.keyFiles || []).filter((f) => f && f !== 'src/index');
      const filesHtml =
        validFiles.length > 0
          ? `<div class="flex flex-wrap gap-1.5 pt-1">
              ${validFiles
                .slice(0, 3)
                .map(
                  (f) =>
                    `<span class="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">${escapeHtml(
                      f
                    )}</span>`
                )
                .join('')}
            </div>`
          : '';

      const reproHtml = issue.quickReproCommand
        ? `<div class="space-y-1 pt-1">
            <div class="flex items-center justify-between text-[11px] text-zinc-500 font-medium">
              <span>Quick Test Command</span>
              <button class="copy-cmd-btn text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1 font-sans" data-cmd="${escapeHtml(
                issue.quickReproCommand
              )}">
                <i data-lucide="copy" class="w-3 h-3"></i> Copy
              </button>
            </div>
            <pre class="font-mono text-xs overflow-x-auto select-all py-2 px-3 rounded-md bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200">${escapeHtml(
              issue.quickReproCommand
            )}</pre>
          </div>`
        : '';

      return `
        <article class="issue-card space-y-4">
          <!-- Card Header: Repo & Quick Stats -->
          <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400 pb-1 border-b border-zinc-100 dark:border-zinc-800/80">
            <div class="flex items-center gap-2">
              <a href="${escapeHtml(
                issue.repoUrl
              )}" target="_blank" rel="noopener noreferrer" class="font-bold text-zinc-800 dark:text-zinc-200 hover:underline">
                ${escapeHtml(issue.repo)}
              </a>
              <span>&middot;</span>
              <span>★ ${formatNumber(issue.stars)}</span>
              <span>&middot;</span>
              <span class="font-medium text-zinc-700 dark:text-zinc-300">${escapeHtml(
                issue.language || 'Multi-language'
              )}</span>
            </div>
            <div class="flex items-center gap-2 text-[11px]">
              <span>⚡ ~${issue.maintainerTurnaroundDays}d review</span>
              <span>&middot;</span>
              <span>${formatRelativeTime(issue.createdAt)}</span>
            </div>
          </div>

          <!-- Issue Title -->
          <h2 class="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
            <a href="${escapeHtml(
              issue.url
            )}" target="_blank" rel="noopener noreferrer" class="hover:underline">
              #${issue.number} ${escapeHtml(issue.title)}
            </a>
          </h2>

          <!-- Task Overview -->
          <p class="text-xs sm:text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
            ${escapeHtml(issue.summary)}
          </p>

          <!-- Reproduction Command Snippet -->
          ${reproHtml}

          <!-- Identified Files -->
          ${filesHtml}

          <!-- Card Footer: Tags & Claim Action -->
          <div class="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span class="px-2 py-0.5 rounded font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700">
                ${getSolvabilityLabel(issue.solvabilityScore)}
              </span>
              <span class="px-2 py-0.5 rounded font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                ${getBlastRadiusLabel(issue.blastRadius)}
              </span>
              <span class="px-2 py-0.5 rounded font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-800">
                ${getFrictionLabel(issue.setupFriction)}
              </span>
            </div>

            <a href="${escapeHtml(
              issue.url
            )}" target="_blank" rel="noopener noreferrer"
               class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-white dark:text-zinc-900 text-xs font-semibold transition-colors shadow-sm shrink-0">
              <span>Claim on GitHub</span>
              <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
            </a>
          </div>
        </article>
      `;
    })
    .join('');

  // Attach copy listeners
  container.querySelectorAll('.copy-cmd-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd');
      if (cmd) {
        navigator.clipboard.writeText(cmd).then(() => {
          showToast('Copied test command');
        });
      }
    });
  });

  safeCreateIcons();
}

// Toast helper
function showToast(message) {
  const toast = getEl('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2000);
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return String(num);
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'recently';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (isNaN(days) || days < 0) return 'recently';
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// Attach filter listeners
function initEventListeners() {
  const searchInput = getEl('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      applyFiltersAndRender();
    });
  }

  const blastFilter = getEl('blast-radius-filter');
  if (blastFilter) {
    blastFilter.addEventListener('change', (e) => {
      state.blastRadius = e.target.value;
      applyFiltersAndRender();
    });
  }

  const sortBy = getEl('sort-by');
  if (sortBy) {
    sortBy.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      applyFiltersAndRender();
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }

    if (e.key === '/') {
      e.preventDefault();
      const s = getEl('search-input');
      if (s) s.focus();
    }
  });
}

function init() {
  initEventListeners();
  loadIssues();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
