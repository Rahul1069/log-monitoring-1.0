/**
 * Application Entry & Navigation Router
 */

// Global Utility Functions
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

function formatLogTimestamp(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);

  const pad = (n, s = 2) => String(n).padStart(s, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  const ms = pad(d.getMilliseconds(), 3);

  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}.${ms}`;
}

function formatTime(dateStr) {
  if (!dateStr) return 'never';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString();
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'alert' ? 'toast-alert' : ''}`;
  toast.innerHTML = `
    <div style="flex: 1;">${escapeHtml(message)}</div>
    <button style="background: none; border: none; color: inherit; cursor: pointer; font-size: 14px;">&times;</button>
  `;

  toast.querySelector('button').addEventListener('click', () => toast.remove());

  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 6000);
}

// Populate filter dropdowns across Live Tail and Search pages
async function syncFilterMetadata() {
  try {
    const meta = await API.getFilterMetadata();
    const liveService = document.getElementById('live-filter-service');
    const liveNode = document.getElementById('live-filter-node');
    const searchService = document.getElementById('search-service');
    const searchNode = document.getElementById('search-node');

    function updateSelect(selectEl, items) {
      if (!selectEl) return;
      const current = selectEl.value;
      const prefix = selectEl.options[0] ? selectEl.options[0].outerHTML : '<option value="ALL">All</option>';
      selectEl.innerHTML = prefix + items.map((i) => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join('');
      selectEl.value = current;
    }

    updateSelect(liveService, meta.services || []);
    updateSelect(liveNode, meta.nodes || []);
    updateSelect(searchService, meta.services || []);
    updateSelect(searchNode, meta.nodes || []);
  } catch (err) {
    console.error('Failed syncing metadata:', err);
  }
}

// Navigation between views
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const viewPanes = document.querySelectorAll('.view-pane');
  const viewTitle = document.getElementById('current-view-title');

  const titles = {
    overview: 'SYSTEM OVERVIEW',
    live: 'LIVE LOG TAIL STREAM',
    search: 'SEARCH & EXPLORE LOGS',
    nodes: 'DISTRIBUTED AGENT CLUSTER',
    alerts: 'AUTOMATED ALERT ENGINE',
  };

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const targetView = item.dataset.view;

      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');

      viewPanes.forEach((pane) => {
        pane.classList.remove('active');
        if (pane.id === `view-${targetView}`) {
          pane.classList.add('active');
        }
      });

      viewTitle.textContent = titles[targetView] || 'DASHBOARD';

      // View-specific trigger actions
      if (targetView === 'overview') {
        loadOverviewData();
      } else if (targetView === 'nodes') {
        loadNodesData();
      } else if (targetView === 'alerts') {
        loadAlertRules();
        loadAlertHistory();
      } else if (targetView === 'search') {
        searchManager.executeSearch();
      }

      syncFilterMetadata();
    });
  });
}

// Theme Switcher (Dark / Light)
function initThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  const label = document.getElementById('theme-label');
  const root = document.documentElement;

  const savedTheme = localStorage.getItem('logmon-theme') || 'dark';
  root.setAttribute('data-theme', savedTheme);
  label.textContent = savedTheme === 'dark' ? 'Dark' : 'Light';

  btn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    label.textContent = next === 'dark' ? 'Dark' : 'Light';
    localStorage.setItem('logmon-theme', next);

    // Refresh charts colors
    if (typeof loadOverviewData === 'function') {
      loadOverviewData();
    }
  });
}

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  initNavigation();
  initLiveTail();
  initSearch();
  initNodes();
  initAlerts();

  // Connect WebSocket
  wsClient.connect();

  // Load initial view data
  loadOverviewData();
  syncFilterMetadata();

  // Background refresh for overview & nodes every 15 seconds
  setInterval(() => {
    const activeView = document.querySelector('.nav-item.active')?.dataset.view;
    if (activeView === 'overview') {
      loadOverviewData();
    } else if (activeView === 'nodes') {
      loadNodesData();
    }
    syncFilterMetadata();
  }, 15000);
});
