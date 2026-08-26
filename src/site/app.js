// OSS Issues Radar Client Application

let allIssues = [];
let filteredIssues = [];

const state = {
  searchQuery: '',
  blastRadius: 'all',
  setupFriction: 'all',
  language: 'all',
  minSolvability: 1,
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
  solvabilitySlider: document.getElementById('solvability-slider'),
  solvabilityValue: document.getElementById('solvability-value'),
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
    // Try multiple possible relative paths for local dev and GitHub Pages
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
        // try next path
      }
    }

    if (!response) {
      throw new Error('Failed to load issues dataset from any endpoint');
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
    : '1.5';

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

    // 5. Min Solvability
    if (issue.solvabilityScore < state.minSolvability) {
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
  elements.totalCountBadge.textContent = `${filteredIssues.length} issues`;

  if (filteredIssues.length === 0) {
    elements.emptyState.classList.remove('hidden');
    return;
  }

  elements.emptyState.classList.add('hidden');

  filteredIssues.forEach((issue) => {
    const card = createIssueCard(issue);
    elements.issuesGrid.appendChild(card);
  });

  // Re-initialize lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function createIssueCard(issue) {
  const card = document.createElement('div');
  card.className =
    'glass-card rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group';

  // Blast Radius Colors
  const blastColor =
    issue.blastRadius === 'Low'
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
      : issue.blastRadius === 'Medium'
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/20';

  // Friction Colors
  const frictionColor =
    issue.setupFriction === 'Zero-dependency'
      ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20'
      : issue.setupFriction === 'Standard'
      ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
      : 'text-orange-400 bg-orange-500/10 border-orange-500/20';

  // Solvability Badge Color
  const score = issue.solvabilityScore;
  const scoreColor =
    score >= 8
      ? 'from-emerald-500 to-teal-400 text-slate-950 font-extrabold'
      : score >= 5
      ? 'from-amber-400 to-yellow-500 text-slate-950 font-extrabold'
      : 'from-orange-500 to-red-500 text-white font-bold';

  const filesHtml = (issue.keyFiles || [])
    .slice(0, 2)
    .map(
      (f) =>
        `<span class="inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/50 truncate max-w-[220px]">
          <i data-lucide="file-code" class="w-3 h-3 text-indigo-400 shrink-0"></i>
          <span class="truncate">${escapeHtml(f)}</span>
        </span>`
    )
    .join('');

  const reproSnippet = issue.quickReproCommand
    ? `<div class="mt-4 pt-3 border-t border-slate-800/80">
        <div class="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span class="flex items-center gap-1 font-medium text-slate-300">
            <i data-lucide="terminal" class="w-3.5 h-3.5 text-emerald-400"></i> Repro Command
          </span>
          <button class="copy-btn hover:text-white transition-colors text-slate-400 flex items-center gap-1" data-copy="${escapeHtml(
            issue.quickReproCommand
          )}">
            <i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy
          </button>
        </div>
        <div class="font-mono text-xs bg-slate-950/80 text-emerald-300 p-2.5 rounded-lg border border-slate-800 overflow-x-auto select-all">
          ${escapeHtml(issue.quickReproCommand)}
        </div>
      </div>`
    : '';

  card.innerHTML = `
    <div>
      <!-- Header: Repo, Stars, Turnaround -->
      <div class="flex items-start justify-between gap-3 mb-3">
        <div class="flex flex-wrap items-center gap-2">
          <a href="${issue.repoUrl}" target="_blank" rel="noopener noreferrer" 
             class="text-sm font-semibold text-slate-300 hover:text-indigo-400 transition-colors flex items-center gap-1.5">
            <i data-lucide="github" class="w-4 h-4 text-slate-400"></i>
            ${escapeHtml(issue.repo)}
          </a>
          <span class="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700/60 flex items-center gap-1 font-medium">
            <i data-lucide="star" class="w-3 h-3 fill-amber-300"></i>
            ${formatNumber(issue.stars)}
          </span>
          ${
            issue.language
              ? `<span class="text-xs px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/60 font-medium">
                  ${escapeHtml(issue.language)}
                </span>`
              : ''
          }
        </div>

        <!-- Solvability Pill -->
        <div class="shrink-0 flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-gradient-to-r ${scoreColor} shadow-sm">
          <i data-lucide="zap" class="w-3 h-3"></i>
          <span>${issue.solvabilityScore}/10</span>
        </div>
      </div>

      <!-- Title & Link -->
      <h3 class="text-base font-bold text-slate-100 hover:text-indigo-300 transition-colors mb-2.5 line-clamp-2 leading-snug">
        <a href="${issue.url}" target="_blank" rel="noopener noreferrer">
          #${issue.number} ${escapeHtml(issue.title)}
        </a>
      </h3>

      <!-- AI Scoped Summary -->
      <p class="text-sm text-slate-300 leading-relaxed mb-4">
        ${escapeHtml(issue.summary)}
      </p>

      <!-- Key Badges -->
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <span class="text-xs font-medium px-2.5 py-1 rounded-lg border ${blastColor} flex items-center gap-1.5">
          <i data-lucide="shield-alert" class="w-3.5 h-3.5"></i>
          ${issue.blastRadius} Blast Radius
        </span>
        <span class="text-xs font-medium px-2.5 py-1 rounded-lg border ${frictionColor} flex items-center gap-1.5">
          <i data-lucide="layers" class="w-3.5 h-3.5"></i>
          ${issue.setupFriction}
        </span>
        <span class="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-300 flex items-center gap-1.5">
          <i data-lucide="clock" class="w-3.5 h-3.5 text-blue-400"></i>
          ~${issue.maintainerTurnaroundDays}d review turnaround
        </span>
      </div>

      <!-- Key Files -->
      ${
        filesHtml
          ? `<div class="flex items-center gap-1.5 mb-2">
              <span class="text-xs text-slate-400 font-medium">Target:</span>
              <div class="flex flex-wrap items-center gap-1.5">${filesHtml}</div>
            </div>`
          : ''
      }

      <!-- Blast Radius Rationale -->
      <p class="text-xs text-slate-400 italic mb-2">
        &ldquo;${escapeHtml(issue.blastRadiusReason)}&rdquo;
      </p>

      <!-- Repro Snippet -->
      ${reproSnippet}
    </div>

    <!-- Footer Action -->
    <div class="mt-5 pt-4 border-t border-slate-800 flex items-center justify-between">
      <span class="text-xs text-slate-400">
        Discovered ${formatRelativeTime(issue.createdAt)}
      </span>
      <a href="${issue.url}" target="_blank" rel="noopener noreferrer"
         class="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-sm hover:shadow-indigo-500/25">
        <span>Claim on GitHub</span>
        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
      </a>
    </div>
  `;

  // Attach copy event listener
  const copyBtn = card.querySelector('.copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const textToCopy = copyBtn.getAttribute('data-copy');
      if (textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(() => {
          showToast('Repro command copied to clipboard!');
        });
      }
    });
  }

  return card;
}

// Utilities
function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.remove('hidden');
  elements.toast.classList.add('animate-toast');

  setTimeout(() => {
    elements.toast.classList.add('hidden');
  }, 2500);
}

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

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
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

elements.solvabilitySlider.addEventListener('input', (e) => {
  state.minSolvability = parseInt(e.target.value, 10);
  elements.solvabilityValue.textContent = `${state.minSolvability}+`;
  applyFiltersAndRender();
});

elements.sortBySelect.addEventListener('change', (e) => {
  state.sortBy = e.target.value;
  applyFiltersAndRender();
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  loadIssues();
});
