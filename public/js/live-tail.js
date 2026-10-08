/**
 * Live Tail Real-Time Log Streaming
 * Handles incoming WebSocket logs, client-side buffer limit, filtering, pause/resume, and auto-scroll.
 */
class LiveTailManager {
  constructor() {
    this.buffer = []; // In-memory ring buffer (max 600 items)
    this.maxBuffer = 600;
    this.isPaused = false;
    this.autoScroll = true;
    this.filterLevel = 'ALL';
    this.filterService = 'ALL';
    this.filterNode = 'ALL';
    this.filterText = '';

    this.container = document.getElementById('live-logs-scroll');
    this.listEl = document.getElementById('live-logs-list');
    this.emptyStateEl = document.getElementById('live-empty-state');
    this.counterEl = document.getElementById('live-buffer-counter');
    this.navCountEl = document.getElementById('nav-live-count');

    this.initControls();
  }

  initControls() {
    // Pause / Resume Button
    const pauseBtn = document.getElementById('btn-live-pause');
    const pauseLabel = document.getElementById('live-pause-label');
    const dot = document.getElementById('live-state-dot');

    pauseBtn.addEventListener('click', () => {
      this.isPaused = !this.isPaused;
      if (this.isPaused) {
        pauseLabel.textContent = 'Resume Stream';
        dot.className = 'status-dot reconnecting';
      } else {
        pauseLabel.textContent = 'Pause Stream';
        dot.className = 'status-dot online';
        this.renderBuffer();
      }
    });

    // Auto-scroll toggle
    const autoscrollCheck = document.getElementById('live-autoscroll');
    autoscrollCheck.addEventListener('change', (e) => {
      this.autoScroll = e.target.checked;
    });

    // Clear Button
    document.getElementById('btn-live-clear').addEventListener('click', () => {
      this.buffer = [];
      this.listEl.innerHTML = '';
      this.updateCounters();
      this.checkEmptyState();
    });

    // Filter dropdowns and inputs
    document.getElementById('live-filter-level').addEventListener('change', (e) => {
      this.filterLevel = e.target.value;
      this.renderBuffer();
    });

    document.getElementById('live-filter-service').addEventListener('change', (e) => {
      this.filterService = e.target.value;
      this.renderBuffer();
    });

    document.getElementById('live-filter-node').addEventListener('change', (e) => {
      this.filterNode = e.target.value;
      this.renderBuffer();
    });

    document.getElementById('live-filter-text').addEventListener('input', (e) => {
      this.filterText = e.target.value.toLowerCase().trim();
      this.renderBuffer();
    });

    // Row click expansion delegation
    this.listEl.addEventListener('click', (e) => {
      const row = e.target.closest('.log-stream-row');
      if (!row) return;

      const logId = row.dataset.id;
      const existingDrawer = row.nextElementSibling;
      if (existingDrawer && existingDrawer.classList.contains('log-detail-drawer')) {
        existingDrawer.remove();
        return;
      }

      // Find item in buffer
      const item = this.buffer.find((l) => (l._id || l.id) === logId);
      if (item) {
        const drawer = document.createElement('div');
        drawer.className = 'log-detail-drawer';
        drawer.innerHTML = `
          <div style="margin-bottom: 4px; font-weight: 600; color: #cbd5e1;">Detailed Record:</div>
          <pre style="margin: 0; white-space: pre-wrap;">${escapeHtml(JSON.stringify(item, null, 2))}</pre>
        `;
        row.after(drawer);
      }
    });
  }

  // Handle incoming batch of logs from WebSocket
  handleIncomingLogs(newLogs) {
    if (!Array.isArray(newLogs) || newLogs.length === 0) return;

    for (const log of newLogs) {
      // Ensure unique identifier
      if (!log._id) log._id = 'gen-' + Math.random().toString(36).substring(2, 9);
      this.buffer.push(log);
      if (this.buffer.length > this.maxBuffer) {
        this.buffer.shift();
      }
    }

    this.updateCounters();
    this.checkEmptyState();

    if (!this.isPaused) {
      // If active, render only matches
      const matchingNew = newLogs.filter((l) => this.matchesFilter(l));
      if (matchingNew.length > 0) {
        const fragment = document.createDocumentFragment();
        matchingNew.forEach((l) => {
          fragment.appendChild(this.createLogRowElement(l));
        });
        this.listEl.appendChild(fragment);

        // Limit DOM rows to maxBuffer
        while (this.listEl.children.length > this.maxBuffer) {
          this.listEl.removeChild(this.listEl.firstChild);
        }

        if (this.autoScroll && this.container) {
          this.container.scrollTop = this.container.scrollHeight;
        }
      }
    }
  }

  matchesFilter(log) {
    if (this.filterLevel !== 'ALL' && log.level !== this.filterLevel) return false;
    if (this.filterService !== 'ALL' && log.service !== this.filterService) return false;
    if (this.filterNode !== 'ALL' && log.node !== this.filterNode) return false;
    if (this.filterText) {
      const msg = (log.message || '').toLowerCase();
      if (!msg.includes(this.filterText)) return false;
    }
    return true;
  }

  createLogRowElement(log) {
    const row = document.createElement('div');
    row.className = 'log-stream-row';
    row.dataset.id = log._id || log.id;

    const timeStr = formatLogTimestamp(log.timestamp);

    row.innerHTML = `
      <div class="log-col-time">${timeStr}</div>
      <div class="log-col-level"><span class="level-badge ${log.level}">${log.level}</span></div>
      <div class="log-col-node" title="${escapeHtml(log.node)}">${escapeHtml(log.node)}</div>
      <div class="log-col-service" title="${escapeHtml(log.service)}">${escapeHtml(log.service)}</div>
      <div class="log-col-msg">${escapeHtml(log.message)}</div>
    `;
    return row;
  }

  renderBuffer() {
    this.listEl.innerHTML = '';
    const filtered = this.buffer.filter((l) => this.matchesFilter(l));
    const fragment = document.createDocumentFragment();
    filtered.forEach((l) => {
      fragment.appendChild(this.createLogRowElement(l));
    });
    this.listEl.appendChild(fragment);

    this.checkEmptyState();
    if (this.autoScroll && this.container) {
      this.container.scrollTop = this.container.scrollHeight;
    }
  }

  checkEmptyState() {
    if (this.buffer.length === 0) {
      this.emptyStateEl.style.display = 'block';
    } else {
      this.emptyStateEl.style.display = 'none';
    }
  }

  updateCounters() {
    this.counterEl.textContent = `${this.buffer.length} / ${this.maxBuffer} buffered`;
    this.navCountEl.textContent = this.buffer.length;
  }
}

let liveTailManager = null;

function initLiveTail() {
  liveTailManager = new LiveTailManager();
  wsClient.onLogs((logs) => {
    liveTailManager.handleIncomingLogs(logs);
  });
}
