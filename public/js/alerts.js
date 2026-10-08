/**
 * Alert Engine UI Management
 * Handles Rule creation/toggling/deletion, alert audit history, and real-time live alert popups.
 */

async function loadAlertRules() {
  const tbody = document.getElementById('alert-rules-tbody');
  if (!tbody) return;

  try {
    const res = await API.getAlertRules();
    const rules = res.rules || [];

    if (rules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 20px;">No alert rules defined yet. Click "+ Create Alert Rule" to add one.</td></tr>';
      return;
    }

    tbody.innerHTML = rules
      .map((r) => {
        const lastFiredStr = r.lastTriggered ? formatTime(r.lastTriggered) : '<span style="color: var(--text-dim);">never</span>';
        const webhookLabel = r.webhookUrl ? `<span title="${escapeHtml(r.webhookUrl)}" style="font-family: var(--font-mono); font-size: 10px; color: #38bdf8;">configured</span>` : '<span style="color: var(--text-dim);">none</span>';
        const enabledClass = r.enabled ? 'btn-primary' : '';

        return `
          <tr>
            <td><strong>${escapeHtml(r.name)}</strong></td>
            <td>
              <span class="rule-condition-badge">
                &gt; ${r.threshold} [${r.level}] in ${r.windowMinutes}m (svc: ${escapeHtml(r.service)})
              </span>
            </td>
            <td style="font-family: var(--font-mono); font-size: 11px;">${r.cooldownMinutes}m cooldown</td>
            <td>${webhookLabel}</td>
            <td style="font-family: var(--font-mono); font-size: 11px;">${lastFiredStr}</td>
            <td>
              <button class="btn btn-sm ${enabledClass}" data-action="toggle-rule" data-id="${r._id}">
                ${r.enabled ? 'Enabled' : 'Disabled'}
              </button>
            </td>
            <td>
              <button class="btn btn-sm btn-danger" data-action="delete-rule" data-id="${r._id}">
                Delete
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    console.error('[ALERTS] Failed to load rules:', err);
  }
}

async function loadAlertHistory() {
  const tbody = document.getElementById('alert-history-tbody');
  if (!tbody) return;

  try {
    const res = await API.getAlertHistory();
    const history = res.history || [];

    document.getElementById('nav-alerts-badge').textContent = history.length;

    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-dim); padding: 20px;">No alerts triggered yet.</td></tr>';
      return;
    }

    tbody.innerHTML = history
      .map((h) => {
        const webhookBadge = h.webhookStatus === 'SENT'
          ? '<span style="color: var(--lvl-info-fg); font-weight: 600;">SENT</span>'
          : h.webhookStatus === 'FAILED'
          ? `<span style="color: var(--lvl-error-fg); font-weight: 600;" title="${escapeHtml(h.webhookError || '')}">FAILED</span>`
          : '<span style="color: var(--text-dim);">N/A</span>';

        return `
          <tr>
            <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${formatTime(h.triggeredAt)}</td>
            <td><strong>${escapeHtml(h.ruleName)}</strong></td>
            <td><span style="color: #a78bfa; font-family: var(--font-mono);">${escapeHtml(h.service)}</span></td>
            <td><span class="level-badge ${h.level}">${h.level}</span></td>
            <td style="font-family: var(--font-mono); color: var(--lvl-error-fg); font-weight: 700;">
              ${h.count} / ${h.threshold}
            </td>
            <td style="font-family: var(--font-mono); font-size: 11px;">${h.windowMinutes}m</td>
            <td style="font-size: 11px;">${webhookBadge}</td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    console.error('[ALERTS] Failed to load history:', err);
  }
}

function initAlerts() {
  const modal = document.getElementById('modal-create-rule');
  const btnOpenModal = document.getElementById('btn-open-create-rule');
  const btnCloseModal = document.getElementById('btn-close-rule-modal');
  const btnCancelModal = document.getElementById('btn-cancel-rule-modal');
  const form = document.getElementById('form-create-rule');
  const serviceSelect = document.getElementById('rule-service');

  // Open modal
  btnOpenModal.addEventListener('click', async () => {
    // Populate dynamic services list
    try {
      const meta = await API.getFilterMetadata();
      const currentVal = serviceSelect.value;
      serviceSelect.innerHTML = '<option value="ALL">ALL Services</option>' +
        (meta.services || []).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      serviceSelect.value = currentVal;
    } catch {}

    modal.classList.add('active');
  });

  // Close modal
  const closeModal = () => modal.classList.remove('active');
  btnCloseModal.addEventListener('click', closeModal);
  btnCancelModal.addEventListener('click', closeModal);

  // Submit new rule form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: document.getElementById('rule-name').value.trim(),
        service: document.getElementById('rule-service').value,
        level: document.getElementById('rule-level').value,
        threshold: parseInt(document.getElementById('rule-threshold').value, 10),
        windowMinutes: parseInt(document.getElementById('rule-window').value, 10),
        cooldownMinutes: parseInt(document.getElementById('rule-cooldown').value, 10),
        webhookUrl: document.getElementById('rule-webhook').value.trim(),
      };

      await API.createAlertRule(payload);
      showToast(`Alert rule "${payload.name}" created successfully!`);
      closeModal();
      form.reset();
      loadAlertRules();
    } catch (err) {
      alert(`Error creating rule: ${err.message}`);
    }
  });

  // Table action buttons (Toggle / Delete)
  document.getElementById('alert-rules-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const action = btn.dataset.action;
    const ruleId = btn.dataset.id;

    if (action === 'toggle-rule') {
      try {
        await API.toggleAlertRule(ruleId);
        loadAlertRules();
      } catch (err) {
        showToast(`Failed toggling rule: ${err.message}`, 'error');
      }
    } else if (action === 'delete-rule') {
      if (confirm('Are you sure you want to delete this alert rule?')) {
        try {
          await API.deleteAlertRule(ruleId);
          showToast('Alert rule deleted');
          loadAlertRules();
        } catch (err) {
          showToast(`Failed deleting rule: ${err.message}`, 'error');
        }
      }
    }
  });

  // Manual Trigger Check Button
  document.getElementById('btn-trigger-check').addEventListener('click', async () => {
    try {
      await API.triggerAlertCheck();
      showToast('Alert rule check cycle triggered.');
      setTimeout(() => {
        loadAlertHistory();
        loadAlertRules();
      }, 1000);
    } catch (err) {
      showToast(`Trigger failed: ${err.message}`, 'error');
    }
  });

  // Listen for real-time WebSocket Alert broadcast!
  wsClient.onAlert((alertData) => {
    showToast(`🚨 ALERT FIRED: "${alertData.ruleName}" (${alertData.count} logs exceeded threshold)`, 'alert');
    loadAlertHistory();
    loadAlertRules();
    loadOverviewData();
  });
}
