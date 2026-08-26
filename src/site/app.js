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

// Safe DOM accessor
function getEl(id) {
  return document.getElementById(id);
}

// Load issues
async function loadIssues() {
  const issuesList = getEl('issues-list');
  try {
    const candidatePaths = ['data/issues.json', './data/issues.json', '../data/issues.json'];
    let response;

    for (const path of candidatePaths) {
      try {
        const res = await fetch(path);
        if (res && res.ok) {
          response = res;
          break;
        }
      } catch {
        // try next
      }
    }

    if (!response) {
      throw new Error('Failed to load issues dataset from endpoint');
    }

    allIssues = await response.json();
    populateLanguageFilter();
    applyFiltersAndRender();
  } catch (err) {
    console.error('Error loading issues:', err);
    if (issuesList) {
      issuesList.innerHTML = '<div class="p-6 text-center text-xs text-zinc-500">Could not load issues. Please run the scanner to generate data/issues.json.</div>';
    }
  }
}

function populateLanguageFilter() {
  const langFilter = getEl('language-filter');
  if (!langFilter) return;

  const languages = Array.from(
    new Set(allIssues.map((i) => i.language).filter(Boolean))
  ).sort();

  langFilter.innerHTML = '<option value="all">All Languages</option>';
  languages.forEach((lang) => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    langFilter.appendChild(opt);
  });
}

function applyFiltersAndRender() {
  filteredIssues = allIssues.filter((issue) => {
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

  const statBadge = getEl('stat-count-badge');
  if (statBadge) statBadge.textContent = `${allIssues.length} issues`;

  const countLabel = getEl('list-count-label');
  if (countLabel) countLabel.textContent = `${filteredIssues.length} matching`;

  renderList();

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
  const issuesList = getEl('issues-list');
  if (!issuesList) return;

  issuesList.innerHTML = '';

  if (filteredIssues.length === 0) {
    issuesList.innerHTML = '<div class="p-8 text-center text-xs text-zinc-500">No matching issues found</div>';
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

    issuesList.appendChild(row);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function selectIssue(index, isUserClick = true) {
  if (index < 0 || index >= filteredIssues.length) return;

  selectedIndex = index;
  const issue = filteredIssues[index];

  const issuesList = getEl('issues-list');
  if (issuesList) {
    const rows = issuesList.querySelectorAll('.issue-row');
    rows.forEach((r, idx) => {
      if (idx === index) {
        r.classList.add('active');
        r.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        r.classList.remove('active');
      }
    });
  }

  populateDetail(issue);

  // Mobile layout switch
  if (window.innerWidth < 768 && isUserClick) {
    const listPane = getEl('list-pane');
    const detailPane = getEl('detail-pane');
    if (listPane) listPane.classList.add('hidden');
    if (detailPane) {
      detailPane.classList.remove('hidden');
      detailPane.classList.add('flex');
    }
  }
}

function populateDetail(issue) {
  const detailEmpty = getEl('detail-empty');
  const detailContent = getEl('detail-content');
  if (detailEmpty) detailEmpty.classList.add('hidden');
  if (detailContent) detailContent.classList.remove('hidden');

  // Breadcrumbs & Header
  const repoEl = getEl('detail-repo');
  if (repoEl) {
    repoEl.textContent = issue.repo;
    repoEl.href = issue.repoUrl;
  }

  const starsEl = getEl('detail-stars');
  if (starsEl) starsEl.textContent = `★ ${formatNumber(issue.stars)}`;

  const langEl = getEl('detail-lang');
  if (langEl) langEl.textContent = issue.language || 'Multi-language';

  const turnaroundEl = getEl('detail-turnaround');
  if (turnaroundEl) turnaroundEl.textContent = `~${issue.maintainerTurnaroundDays}d review turnaround`;

  const scoreEl = getEl('detail-score');
  if (scoreEl) scoreEl.textContent = `Solvability: ${issue.solvabilityScore}/10`;

  // Title
  const titleEl = getEl('detail-title');
  if (titleEl) titleEl.textContent = `#${issue.number} ${issue.title}`;

  // Meta Cards
  const blastBadge = getEl('detail-blast-badge');
  if (blastBadge) blastBadge.textContent = `${issue.blastRadius} Blast Radius`;

  const frictionBadge = getEl('detail-friction-badge');
  if (frictionBadge) frictionBadge.textContent = issue.setupFriction;

  const turnaroundBadge = getEl('detail-turnaround-badge');
  if (turnaroundBadge) turnaroundBadge.textContent = `~${issue.maintainerTurnaroundDays} days`;

  // Summary & Blast Reason
  const summaryEl = getEl('detail-summary');
  if (summaryEl) summaryEl.textContent = issue.summary;

  const blastReasonEl = getEl('detail-blast-reason');
  if (blastReasonEl) blastReasonEl.textContent = `"${issue.blastRadiusReason}"`;

  // Repro Command
  const reproContainer = getEl('detail-repro-container');
  const reproCmd = getEl('detail-repro-cmd');
  if (issue.quickReproCommand) {
    if (reproContainer) reproContainer.classList.remove('hidden');
    if (reproCmd) reproCmd.textContent = issue.quickReproCommand;
  } else {
    if (reproContainer) reproContainer.classList.add('hidden');
  }

  // Target Files
  const filesContainer = getEl('detail-files-container');
  const filesList = getEl('detail-files-list');
  const validFiles = (issue.keyFiles || []).filter((f) => f && f !== 'src/index');
  if (validFiles.length > 0) {
    if (filesContainer) filesContainer.classList.remove('hidden');
    if (filesList) {
      filesList.innerHTML = validFiles
        .map(
          (f) =>
            `<span class="font-mono text-xs px-2.5 py-1 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300">${escapeHtml(
              f
            )}</span>`
        )
        .join('');
    }
  } else {
    if (filesContainer) filesContainer.classList.add('hidden');
  }

  // Footer & Action
  const discoveredEl = getEl('detail-discovered');
  if (discoveredEl) discoveredEl.textContent = formatRelativeTime(issue.createdAt);

  const githubLink = getEl('detail-github-link');
  if (githubLink) githubLink.href = issue.url;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function showEmptyDetail() {
  const detailContent = getEl('detail-content');
  const detailEmpty = getEl('detail-empty');
  if (detailContent) detailContent.classList.add('hidden');
  if (detailEmpty) detailEmpty.classList.remove('hidden');
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

// Attach listeners
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

  const frictionFilter = getEl('friction-filter');
  if (frictionFilter) {
    frictionFilter.addEventListener('change', (e) => {
      state.setupFriction = e.target.value;
      applyFiltersAndRender();
    });
  }

  const langFilter = getEl('language-filter');
  if (langFilter) {
    langFilter.addEventListener('change', (e) => {
      state.language = e.target.value;
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

  const copyReproBtn = getEl('detail-copy-repro');
  if (copyReproBtn) {
    copyReproBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const issue = filteredIssues[selectedIndex];
      if (issue && issue.quickReproCommand) {
        navigator.clipboard.writeText(issue.quickReproCommand).then(() => {
          showToast('Copied reproduction command');
        });
      }
    });
  }

  const mobileBackBtn = getEl('mobile-back-btn');
  if (mobileBackBtn) {
    mobileBackBtn.addEventListener('click', () => {
      const detailPane = getEl('detail-pane');
      const listPane = getEl('list-pane');
      if (detailPane) {
        detailPane.classList.add('hidden');
        detailPane.classList.remove('flex');
      }
      if (listPane) listPane.classList.remove('hidden');
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
      const s = getEl('search-input');
      if (s) s.focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  loadIssues();
});
