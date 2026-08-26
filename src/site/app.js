// Quick Issues Client Application

let allIssues = [];
let filteredIssues = [];

const state = {
  searchQuery: '',
  blastRadius: 'all',
  setupFriction: 'all',
  language: 'all',
  sortBy: 'solvability',
};

// DOM Elements
const elements = {
  issuesGrid: document.getElementById('issues-grid'),
  emptyState: document.getElementById('empty-state'),
  loadingState: document.getElementById('loading-state'),
  searchInput: document.getElementById('search-input'),
  blastRadiusFilter: document.getElementById('blast-radius-filter'),
  frictionFilter: document.getElementById('friction-filter'),
  languageFilter: document.getElementById('language-filter'),
  sortBySelect: document.getElementById('sort-by'),
  totalCountBadge: document.getElementById('total-count-badge'),
  statTotal: document.getElementById('stat-total'),
  statZeroFriction: document.getElementById('stat-zero-friction'),
  statLowBlast: document.getElementById('stat-low-blast'),
  statAvgTurnaround: document.getElementById('stat-avg-turnaround'),
  toast: document.getElementById('toast'),
};

// Data Loading
async function loadIssues() {
  try {
    const candidatePaths = ['data/issues.json', './data/issues.json', '../data/issues.json'];
    let response;

    for (const path of candidatePaths) {
      try {
        const res = await fetch(path);
        if (res.ok) {
          response = res;
          break;
        }
      } catch {
        // try next candidate
      }
    }

    if (!response) {
      throw new Error('Failed to load issues dataset');
    }

    allIssues = await response.json();
    populateLanguageFilter();
    updateDashboardStats();
    applyFiltersAndRender();
  } catch (err) {
    console.error('Error loading issues:', err);
    elements.loadingState.classList.add('hidden');
    elements.emptyState.classList.remove('hidden');
    elements.emptyState.querySelector('p').textContent =
      'Could not load issues dataset. Please run the scanner to generate data/issues.json.';
  }
}

function updateDashboardStats() {
  const total = allIssues.length;
  const zeroFriction = allIssues.filter(
    (i) => i.setupFriction === 'Zero-dependency' || i.setupFriction === 'Standard'
  ).length;
  const lowBlast = allIssues.filter((i) => i.blastRadius === 'Low').length;

  const validTurnarounds = allIssues
    .map((i) => i.maintainerTurnaroundDays)
    .filter((d) => typeof d === 'number' && d > 0);
  const avgTurnaround = validTurnarounds.length
    ? (validTurnarounds.reduce((a, b) => a + b, 0) / validTurnarounds.length).toFixed(1)
    : '1.2';

  if (elements.statTotal) elements.statTotal.textContent = total;
  if (elements.statZeroFriction) elements.statZeroFriction.textContent = zeroFriction;
  if (elements.statLowBlast) elements.statLowBlast.textContent = lowBlast;
  if (elements.statAvgTurnaround) elements.statAvgTurnaround.textContent = `~${avgTurnaround}d`;
}

function populateLanguageFilter() {
  const languages = Array.from(
    new Set(allIssues.map((i) => i.language).filter(Boolean))
  ).sort();

  languages.forEach((lang) => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    elements.languageFilter.appendChild(opt);
  });
}

function applyFiltersAndRender() {
  elements.loadingState.classList.add('hidden');

  filteredIssues = allIssues.filter((issue) => {
    // 1. Search Query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchTitle = issue.title.toLowerCase().includes(q);
      const matchRepo = issue.repo.toLowerCase().includes(q);
      const matchSummary = issue.summary.toLowerCase().includes(q);
      const matchFiles = (issue.keyFiles || []).some((f) => f.toLowerCase().includes(q));
      if (!matchTitle && !matchRepo && !matchSummary && !matchFiles) {
        return false;
      }
    }

    // 2. Blast Radius
    if (state.blastRadius !== 'all' && issue.blastRadius !== state.blastRadius) {
      return false;
    }

    // 3. Setup Friction
    if (state.setupFriction !== 'all' && issue.setupFriction !== state.setupFriction) {
      return false;
    }

    // 4. Language
    if (state.language !== 'all' && issue.language !== state.language) {
      return false;
    }

    return true;
  });

  // Sorting
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

  renderCards();
}

function renderCards() {
  elements.issuesGrid.innerHTML = '';
  elements.totalCountBadge.textContent = `${filteredIssues.length} issues available`;

  if (filteredIssues.length === 0) {
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  filteredIssues.forEach((issue) => {
    const card = createIssueCard(issue);
    elements.issuesGrid.appendChild(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function createIssueCard(issue) {
  const card = document.createElement('article');
  card.className = 'issue-card space-y-3';

  const reproBlock = issue.quickReproCommand
    ? `<div class="flex items-center justify-between gap-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-3 py-1.5 text-xs font-mono text-zinc-700 dark:text-zinc-300">
        <span class="truncate"><code>${escapeHtml(issue.quickReproCommand)}</code></span>
        <button class="copy-btn shrink-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors flex items-center gap-1 font-sans text-[11px]" data-copy="${escapeHtml(
          issue.quickReproCommand
        )}">
          <i data-lucide="copy" class="w-3 h-3"></i> Copy
        </button>
      </div>`
    : '';

  const targetFile = (issue.keyFiles && issue.keyFiles.length > 0 && issue.keyFiles[0] !== 'src/index')
    ? `<span class="text-xs text-zinc-500 dark:text-zinc-400 font-mono truncate max-w-[200px]" title="${escapeHtml(issue.keyFiles[0])}">
        ${escapeHtml(issue.keyFiles[0])}
       </span>`
    : '';

  card.innerHTML = `
    <!-- Top Meta -->
    <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <div class="flex items-center gap-2">
        <a href="${issue.repoUrl}" target="_blank" rel="noopener noreferrer" 
           class="font-medium text-zinc-800 dark:text-zinc-200 hover:underline">
          ${escapeHtml(issue.repo)}
        </a>
        <span>&middot;</span>
        <span>★ ${formatNumber(issue.stars)}</span>
        ${issue.language ? `<span>&middot;</span><span>${escapeHtml(issue.language)}</span>` : ''}
        <span>&middot;</span>
        <span>~${issue.maintainerTurnaroundDays}d review</span>
      </div>
      <div class="font-medium text-zinc-700 dark:text-zinc-300">
        Solvability: ${issue.solvabilityScore}/10
      </div>
    </div>

    <!-- Issue Title -->
    <h2 class="text-base font-semibold leading-snug">
      <a href="${issue.url}" target="_blank" rel="noopener noreferrer" 
         class="text-zinc-900 dark:text-zinc-100 hover:underline">
        #${issue.number} ${escapeHtml(issue.title)}
      </a>
    </h2>

    <!-- Summary -->
    <p class="text-sm text-zinc-600 dark:text-zinc-400 leading-normal">
      ${escapeHtml(issue.summary)}
    </p>

    <!-- Repro snippet if present -->
    ${reproBlock}

    <!-- Bottom details & action -->
    <div class="flex items-center justify-between gap-2 pt-1 text-xs">
      <div class="flex flex-wrap items-center gap-1.5">
        <span class="subtle-tag">${escapeHtml(issue.blastRadius)} Blast Radius</span>
        <span class="subtle-tag">${escapeHtml(issue.setupFriction)}</span>
        ${targetFile}
      </div>
      <a href="${issue.url}" target="_blank" rel="noopener noreferrer" 
         class="text-zinc-700 dark:text-zinc-300 hover:underline font-medium shrink-0 flex items-center gap-1">
        <span>View on GitHub</span>
        <span>&rarr;</span>
      </a>
    </div>
  `;

  // Copy listener
  const copyBtn = card.querySelector('.copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const textToCopy = copyBtn.getAttribute('data-copy');
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('Copied repro command');
        });
      }
    });
  }

  return card;
}

// Toast
function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');

  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2000);
}

// Utilities
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatNumber(num) {
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'k';
  }
  return num;
}

// Event Listeners
elements.searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  applyFiltersAndRender();
});

elements.blastRadiusFilter.addEventListener('change', (e) => {
  state.blastRadius = e.target.value;
  applyFiltersAndRender();
});

elements.frictionFilter.addEventListener('change', (e) => {
  state.setupFriction = e.target.value;
  applyFiltersAndRender();
});

elements.languageFilter.addEventListener('change', (e) => {
  state.language = e.target.value;
  applyFiltersAndRender();
});

elements.sortBySelect.addEventListener('change', (e) => {
  state.sortBy = e.target.value;
  applyFiltersAndRender();
});

document.addEventListener('DOMContentLoaded', () => {
  loadIssues();
});
