// Quick Issues — NetNewsWire-style Desktop Layout

let allIssues = [];
let filteredIssues = [];
let selectedIndex = 0;

const state = {
  searchQuery: '',
  blastRadius: 'all',
  setupFriction: 'all',
  language: 'all',
  sortBy: 'solvability',
};

// DOM Elements
const el = {
  searchInput: document.getElementById('search-input'),
  blastRadiusFilter: document.getElementById('blast-radius-filter'),
  frictionFilter: document.getElementById('friction-filter'),
  languageFilter: document.getElementById('language-filter'),
  sortBySelect: document.getElementById('sort-by'),
  statCountBadge: document.getElementById('stat-count-badge'),
  listCountLabel: document.getElementById('list-count-label'),
  issuesList: document.getElementById('issues-list'),
  listPane: document.getElementById('list-pane'),
  detailPane: document.getElementById('detail-pane'),
  detailEmpty: document.getElementById('detail-empty'),
  detailContent: document.getElementById('detail-content'),
  mobileBackBtn: document.getElementById('mobile-back-btn'),
  // Detail Fields
  detailRepo: document.getElementById('detail-repo'),
  detailStars: document.getElementById('detail-stars'),
  detailLang: document.getElementById('detail-lang'),
  detailTurnaround: document.getElementById('detail-turnaround'),
  detailScore: document.getElementById('detail-score'),
  detailTitle: document.getElementById('detail-title'),
  detailBlastBadge: document.getElementById('detail-blast-badge'),
  detailFrictionBadge: document.getElementById('detail-friction-badge'),
  detailTurnaroundBadge: document.getElementById('detail-turnaround-badge'),
  detailSummary: document.getElementById('detail-summary'),
  detailBlastReason: document.getElementById('detail-blast-reason'),
  detailReproContainer: document.getElementById('detail-repro-container'),
  detailReproCmd: document.getElementById('detail-repro-cmd'),
  detailCopyRepro: document.getElementById('detail-copy-repro'),
  detailFilesContainer: document.getElementById('detail-files-container'),
  detailFilesList: document.getElementById('detail-files-list'),
  detailDiscovered: document.getElementById('detail-discovered'),
  detailGithubLink: document.getElementById('detail-github-link'),
  toast: document.getElementById('toast'),
};

// Load issues
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
        // try next
      }
    }

    if (!response) {
      throw new Error('Failed to load issues dataset');
    }

    allIssues = await response.json();
    populateLanguageFilter();
    applyFiltersAndRender();
  } catch (err) {
    console.error('Error loading issues:', err);
    el.issuesList.innerHTML = '<div class="p-6 text-center text-xs text-zinc-500">Could not load issues. Run scanner to generate data/issues.json.</div>';
  }
}

function populateLanguageFilter() {
  const languages = Array.from(
    new Set(allIssues.map((i) => i.language).filter(Boolean))
  ).sort();

  languages.forEach((lang) => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    el.languageFilter.appendChild(opt);
  });
}

function applyFiltersAndRender() {
  filteredIssues = allIssues.filter((issue) => {
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

    if (state.blastRadius !== 'all' && issue.blastRadius !== state.blastRadius) {
      return false;
    }

    if (state.setupFriction !== 'all' && issue.setupFriction !== state.setupFriction) {
      return false;
    }

    if (state.language !== 'all' && issue.language !== state.language) {
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

  el.statCountBadge.textContent = `${allIssues.length} issues`;
  el.listCountLabel.textContent = `${filteredIssues.length} matching`;

  renderList();

  // Reset or maintain selection
  if (filteredIssues.length > 0) {
    if (selectedIndex >= filteredIssues.length) {
      selectedIndex = 0;
    }
    selectIssue(selectedIndex, false);
  } else {
    showEmptyDetail();
  }
}

function renderList() {
  el.issuesList.innerHTML = '';

  if (filteredIssues.length === 0) {
    el.issuesList.innerHTML = '<div class="p-8 text-center text-xs text-zinc-500">No matching issues found</div>';
    return;
  }

  filteredIssues.forEach((issue, idx) => {
    const row = document.createElement('div');
    row.className = `issue-row ${idx === selectedIndex ? 'active' : ''}`;
    row.dataset.index = idx;

    row.innerHTML = `
      <div class="flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400 mb-1">
        <span class="font-medium text-zinc-700 dark:text-zinc-300 truncate max-w-[200px]">${escapeHtml(issue.repo)}</span>
        <span class="font-mono text-[10px] shrink-0">${issue.solvabilityScore}/10</span>
      </div>
      <div class="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug mb-1">
        #${issue.number} ${escapeHtml(issue.title)}
      </div>
      <div class="flex items-center gap-2 text-[10px] text-zinc-500 dark:text-zinc-400">
        <span>${escapeHtml(issue.blastRadius)} Blast</span>
        <span>&middot;</span>
        <span>${escapeHtml(issue.setupFriction)}</span>
        <span>&middot;</span>
        <span>~${issue.maintainerTurnaroundDays}d review</span>
      </div>
    `;

    row.addEventListener('click', () => {
      selectIssue(idx, true);
    });

    el.issuesList.appendChild(row);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function selectIssue(index, isUserClick = true) {
  if (index < 0 || index >= filteredIssues.length) return;

  selectedIndex = index;
  const issue = filteredIssues[index];

  // Update active row classes
  const rows = el.issuesList.querySelectorAll('.issue-row');
  rows.forEach((r, idx) => {
    if (idx === index) {
      r.classList.add('active');
      r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      r.classList.remove('active');
    }
  });

  populateDetail(issue);

  // Mobile layout switch
  if (window.innerWidth < 768 && isUserClick) {
    el.listPane.classList.add('hidden');
    el.detailPane.classList.remove('hidden');
    el.detailPane.classList.add('flex');
  }
}

function populateDetail(issue) {
  el.detailEmpty.classList.add('hidden');
  el.detailContent.classList.remove('hidden');

  // Breadcrumbs & Header
  el.detailRepo.textContent = issue.repo;
  el.detailRepo.href = issue.repoUrl;
  el.detailStars.textContent = `★ ${formatNumber(issue.stars)}`;
  el.detailLang.textContent = issue.language || 'Multi-language';
  el.detailTurnaround.textContent = `~${issue.maintainerTurnaroundDays}d review turnaround`;
  el.detailScore.textContent = `Solvability: ${issue.solvabilityScore}/10`;

  // Title
  el.detailTitle.textContent = `#${issue.number} ${issue.title}`;

  // Meta Cards
  el.detailBlastBadge.textContent = `${issue.blastRadius} Blast Radius`;
  el.detailFrictionBadge.textContent = issue.setupFriction;
  el.detailTurnaroundBadge.textContent = `~${issue.maintainerTurnaroundDays} days`;

  // Summary & Blast Reason
  el.detailSummary.textContent = issue.summary;
  el.detailBlastReason.textContent = `"${issue.blastRadiusReason}"`;

  // Repro Command
  if (issue.quickReproCommand) {
    el.detailReproContainer.classList.remove('hidden');
    el.detailReproCmd.textContent = issue.quickReproCommand;
  } else {
    el.detailReproContainer.classList.add('hidden');
  }

  // Target Files
  const validFiles = (issue.keyFiles || []).filter((f) => f && f !== 'src/index');
  if (validFiles.length > 0) {
    el.detailFilesContainer.classList.remove('hidden');
    el.detailFilesList.innerHTML = validFiles
      .map(
        (f) =>
          `<span class="font-mono text-xs px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">${escapeHtml(
            f
          )}</span>`
      )
      .join('');
  } else {
    el.detailFilesContainer.classList.add('hidden');
  }

  // Footer & Action
  el.detailDiscovered.textContent = formatRelativeTime(issue.createdAt);
  el.detailGithubLink.href = issue.url;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showEmptyDetail() {
  el.detailContent.classList.add('hidden');
  el.detailEmpty.classList.remove('hidden');
}

// Toast helper
function showToast(message) {
  if (!el.toast) return;
  el.toast.textContent = message;
  el.toast.classList.remove('hidden');

  setTimeout(() => {
    el.toast.classList.add('hidden');
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
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
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
el.searchInput.addEventListener('input', (e) => {
  state.searchQuery = e.target.value;
  applyFiltersAndRender();
});

el.blastRadiusFilter.addEventListener('change', (e) => {
  state.blastRadius = e.target.value;
  applyFiltersAndRender();
});

el.frictionFilter.addEventListener('change', (e) => {
  state.setupFriction = e.target.value;
  applyFiltersAndRender();
});

el.languageFilter.addEventListener('change', (e) => {
  state.language = e.target.value;
  applyFiltersAndRender();
});

el.sortBySelect.addEventListener('change', (e) => {
  state.sortBy = e.target.value;
  applyFiltersAndRender();
});

// Copy Repro Command
el.detailCopyRepro.addEventListener('click', (e) => {
  e.preventDefault();
  const issue = filteredIssues[selectedIndex];
  if (issue && issue.quickReproCommand) {
    navigator.clipboard.writeText(issue.quickReproCommand).then(() => {
      showToast('Copied reproduction command');
    });
  }
});

// Mobile Back Button
el.mobileBackBtn.addEventListener('click', () => {
  el.detailPane.classList.add('hidden');
  el.detailPane.classList.remove('flex');
  el.listPane.classList.remove('hidden');
});

// Keyboard Navigation (NetNewsWire style)
document.addEventListener('keydown', (e) => {
  // Ignore if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
    if (e.key === 'Escape') {
      e.target.blur();
    }
    return;
  }

  if (e.key === 'j' || e.key === 'ArrowDown') {
    e.preventDefault();
    if (selectedIndex < filteredIssues.length - 1) {
      selectIssue(selectedIndex + 1, false);
    }
  } else if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (selectedIndex > 0) {
      selectIssue(selectedIndex - 1, false);
    }
  } else if (e.key === 'o' || e.key === 'Enter') {
    const issue = filteredIssues[selectedIndex];
    if (issue && issue.url) {
      window.open(issue.url, '_blank', 'noopener,noreferrer');
    }
  } else if (e.key === 'c') {
    const issue = filteredIssues[selectedIndex];
    if (issue && issue.quickReproCommand) {
      navigator.clipboard.writeText(issue.quickReproCommand).then(() => {
        showToast('Copied reproduction command');
      });
    }
  } else if (e.key === '/') {
    e.preventDefault();
    el.searchInput.focus();
  }
});

document.addEventListener('DOMContentLoaded', () => {
  loadIssues();
});
