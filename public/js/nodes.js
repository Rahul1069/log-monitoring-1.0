/**
 * Distributed Nodes Cluster Management Logic
 */
async function loadNodesData() {
  const tbody = document.getElementById('nodes-tbody');
  if (!tbody) return;

  try {
    const res = await API.getNodes();
    const nodes = res.nodes || [];

    document.getElementById('nav-nodes-count').textContent = res.onlineCount || 0;

    if (nodes.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; color: var(--text-dim); padding: 35px;">
            No distributed nodes registered yet.<br>
            Start an agent on any machine: <code>npm run agent:node1</code>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = nodes
      .map((node) => {
        const isOnline = node.isOnline;
        const statusClass = isOnline ? 'online' : 'offline';
        const statusLabel = isOnline ? 'ONLINE' : 'OFFLINE';

        const lastSeenAgo = node.secondsSinceLastSeen < 60
          ? `${node.secondsSinceLastSeen}s ago`
          : `${Math.floor(node.secondsSinceLastSeen / 60)}m ago`;

        const servicesBadges = (node.services || [])
          .map((s) => `<span style="font-family: var(--font-mono); font-size: 10px; background-color: var(--bg-badge); padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); color: #cbd5e1;">${escapeHtml(s)}</span>`)
          .join(' ') || '<span style="color: var(--text-dim);">none</span>';

        return `
          <tr>
            <td>
              <span class="stat-chip">
                <span class="status-dot ${statusClass}"></span>
                <strong style="color: ${isOnline ? 'var(--status-online)' : 'var(--status-offline)'}; font-size: 11px;">${statusLabel}</strong>
              </span>
            </td>
            <td><strong style="font-family: var(--font-mono); color: #38bdf8;">${escapeHtml(node.nodeId)}</strong></td>
            <td style="font-family: var(--font-mono); font-size: 11px;">${escapeHtml(node.hostname || 'unknown')}</td>
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${escapeHtml(node.ipAddress || '127.0.0.1')}</td>
            <td style="font-size: 11px; color: var(--text-dim);">${formatTime(node.firstSeen)}</td>
            <td style="font-family: var(--font-mono); font-size: 11.5px;">
              <span>${lastSeenAgo}</span>
              <span style="font-size: 10.5px; color: var(--text-dim); display: block;">${formatTime(node.lastSeen)}</span>
            </td>
            <td style="font-family: var(--font-mono); font-weight: 600;">${Number(node.totalLogs).toLocaleString()}</td>
            <td>${servicesBadges}</td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    console.error('[NODES] Failed to load nodes:', err);
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--lvl-error-fg); padding: 20px;">Failed to load node statuses: ${escapeHtml(err.message)}</td></tr>`;
  }
}

function initNodes() {
  document.getElementById('btn-refresh-nodes').addEventListener('click', loadNodesData);
}
