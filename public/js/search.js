/**
 * Search & Explore Module
 * Keyword search with regex highlighting, time-window presets, pagination, and CSV export.
 */
class SearchManager {
  constructor() {
    this.currentPage = 1;
    this.totalPages = 1;
    this.timePreset = 'all';

    this.keywordInput = document.getElementById('search-keyword');
    this.levelSelect = document.getElementById('search-level');
    this.serviceSelect = document.getElementById('search-service');
    this.nodeSelect = document.getElementById('search-node');
    this.fromInput = document.getElementById('search-from');
    this.toInput = document.getElementById('search-to');
    this.limitSelect = document.getElementById('search-limit');

    this.tbody = document.getElementById('search-tbody');
    this.countLabel = document.getElementById('search-count-label');
    this.timingLabel = document.getElementById('search-timing-label');
    this.currPageEl = document.getElementById('search-curr-page');
    this.totalPagesEl = document.getElementById('search-total-pages');

    this.btnPrev = document.getElementById('btn-search-prev');
    this.btnNext = document.getElementById('btn-search-next');

    this.initEvents();
  }

  initEvents() {
    // Run search on button click and Enter key
    document.getElementById('btn-search-run').addEventListener('click', () => {
      this.currentPage = 1;
      this.executeSearch();
    });

    this.keywordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.currentPage = 1;
        this.executeSearch();
      }
    });

    // Reset filters
    document.getElementById('btn-search-reset').addEventListener('click', () => {
      this.keywordInput.value = '';
      this.levelSelect.value = 'ALL';
      this.serviceSelect.value = 'ALL';
      this.nodeSelect.value = 'ALL';
      this.fromInput.value = '';
      this.toInput.value = '';
      this.setTimePreset('all');
      this.currentPage = 1;
      this.executeSearch();
    });

    // Time presets
    document.querySelectorAll('.time-preset-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const range = e.target.dataset.range;
        this.setTimePreset(range);
        this.currentPage = 1;
        this.executeSearch();
      });
    });

    // Page limit change
    this.limitSelect.addEventListener('change', () => {
      this.currentPage = 1;
      this.executeSearch();
    });

    // Pagination buttons
    this.btnPrev.addEventListener('click', () => {
      if (this.currentPage > 1) {
        this.currentPage--;
        this.executeSearch();
      }
    });

    this.btnNext.addEventListener('click', () => {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
        this.executeSearch();
      }
    });

    // CSV Streaming Export
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      const params = this.buildQueryParams(false);
      const qs = new URLSearchParams(params).toString();
      window.location.href = `/api/export/csv?${qs}`;
    });

    // Row detail expansion
    this.tbody.addEventListener('click', (e) => {
      const row = e.target.closest('tr');
      if (!row || !row.dataset.doc) return;

      const existingDrawer = row.nextElementSibling;
      if (existingDrawer && existingDrawer.classList.contains('log-search-drawer')) {
        existingDrawer.remove();
        return;
      }

      try {
        const doc = JSON.parse(decodeURIComponent(row.dataset.doc));
        const tr = document.createElement('tr');
        tr.className = 'log-search-drawer';
        tr.innerHTML = `
          <td colspan="5" style="background-color: var(--bg-surface-hover); padding: 10px 14px; font-family: var(--font-mono); font-size: 11px;">
            <div style="font-weight: 600; margin-bottom: 4px; color: #94a3b8;">Detailed Document:</div>
            <pre style="margin: 0; white-space: pre-wrap;">${escapeHtml(JSON.stringify(doc, null, 2))}</pre>
          </td>
        `;
        row.after(tr);
      } catch (err) {
        console.error('Failed parsing row document:', err);
      }
    });
  }

  setTimePreset(range) {
    this.timePreset = range;
    document.querySelectorAll('.time-preset-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.range === range);
    });

    // Clear custom date inputs if preset selected
    if (range !== 'custom') {
      this.fromInput.value = '';
      this.toInput.value = '';
    }
  }

  buildQueryParams(includePagination = true) {
    const params = {};

    const keyword = this.keywordInput.value.trim();
    if (keyword) params.query = keyword;

    if (this.levelSelect.value !== 'ALL') params.level = this.levelSelect.value;
    if (this.serviceSelect.value !== 'ALL') params.service = this.serviceSelect.value;
    if (this.nodeSelect.value !== 'ALL') params.node = this.nodeSelect.value;

    // Time calculations
    if (this.fromInput.value) {
      params.from = new Date(this.fromInput.value).toISOString();
    } else if (this.timePreset !== 'all') {
      const now = Date.now();
      let diff = 0;
      if (this.timePreset === '15m') diff = 15 * 60 * 1000;
      if (this.timePreset === '1h') diff = 60 * 60 * 1000;
      if (this.timePreset === '6h') diff = 6 * 60 * 60 * 1000;
      if (this.timePreset === '24h') diff = 24 * 60 * 60 * 1000;
      if (this.timePreset === '7d') diff = 7 * 24 * 60 * 60 * 1000;
      if (diff > 0) {
        params.from = new Date(now - diff).toISOString();
      }
    }

    if (this.toInput.value) {
      params.to = new Date(this.toInput.value).toISOString();
    }

    if (includePagination) {
      params.page = this.currentPage;
      params.limit = parseInt(this.limitSelect.value, 10) || 50;
    }

    return params;
  }

  async executeSearch() {
    const startTime = performance.now();
    this.tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 25px;">Executing query in MongoDB...</td></tr>';

    try {
      const params = this.buildQueryParams(true);
      const res = await API.searchLogs(params);
      const duration = (performance.now() - startTime).toFixed(0);

      this.totalPages = res.pages || 1;
      this.currPageEl.textContent = res.page;
      this.totalPagesEl.textContent = this.totalPages;
      this.countLabel.textContent = `Found ${Number(res.total).toLocaleString()} matching logs`;
      this.timingLabel.textContent = `(${duration}ms)`;

      this.btnPrev.disabled = this.currentPage <= 1;
      this.btnNext.disabled = this.currentPage >= this.totalPages;

      this.renderRows(res.logs || [], params.query);
    } catch (err) {
      this.tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--lvl-error-fg); padding: 20px;">Error executing search: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  renderRows(logs, query) {
    if (logs.length === 0) {
      this.tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-dim); padding: 30px;">No logs matched the selected criteria. Try adjusting your query or time window.</td></tr>';
      return;
    }

    const highlightRegex = query ? new RegExp(`(${escapeRegex(query)})`, 'gi') : null;

    this.tbody.innerHTML = logs
      .map((log) => {
        const timeStr = formatLogTimestamp(log.timestamp);
        let msgHtml = escapeHtml(log.message);

        if (highlightRegex) {
          msgHtml = msgHtml.replace(highlightRegex, '<mark class="highlight-match">$1</mark>');
        }

        const encodedDoc = encodeURIComponent(JSON.stringify(log));

        return `
          <tr data-doc="${encodedDoc}" style="cursor: pointer;">
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${timeStr}</td>
            <td><span class="level-badge ${log.level}">${log.level}</span></td>
            <td style="color: #38bdf8; font-family: var(--font-mono);">${escapeHtml(log.node)}</td>
            <td style="color: #a78bfa; font-family: var(--font-mono);">${escapeHtml(log.service)}</td>
            <td style="font-family: var(--font-mono); font-size: 11.5px; white-space: pre-wrap; word-break: break-word;">${msgHtml}</td>
          </tr>
        `;
      })
      .join('');
  }
}

let searchManager = null;

function initSearch() {
  searchManager = new SearchManager();
}
