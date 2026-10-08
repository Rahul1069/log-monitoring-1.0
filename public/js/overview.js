/**
 * Overview Dashboard Logic & Real Chart Rendering
 */
let throughputChart = null;
let levelsChart = null;

async function loadOverviewData() {
  try {
    const stats = await API.getStats('30m');

    // Update KPI cards
    document.getElementById('metric-total-logs').textContent = Number(stats.totalLogs).toLocaleString();
    document.getElementById('topbar-total-logs').textContent = Number(stats.totalLogs).toLocaleString();
    document.getElementById('metric-error-rate').textContent = stats.errorRate;
    document.getElementById('metric-error-count').textContent = Number(stats.errorCount).toLocaleString();
    document.getElementById('metric-online-nodes').textContent = `${stats.nodes.online} / ${stats.nodes.total}`;
    document.getElementById('metric-alert-count').textContent = (stats.recentAlerts || []).length;
    document.getElementById('nav-alerts-badge').textContent = (stats.recentAlerts || []).length;
    document.getElementById('nav-nodes-count').textContent = stats.nodes.online;

    // Render Throughput Chart
    renderThroughputChart(stats.timeline || []);

    // Render Levels Chart
    renderLevelsChart(stats.levels || {});

    // Render Top Services Table
    renderTopServices(stats.topServices || []);

    // Render Recent Alerts Table
    renderRecentAlerts(stats.recentAlerts || []);
  } catch (err) {
    console.error('[OVERVIEW] Failed loading stats:', err);
  }
}

function renderThroughputChart(timeline) {
  const ctx = document.getElementById('chart-throughput');
  if (!ctx || typeof Chart === 'undefined') return;

  const labels = timeline.map((t) => t.time);
  const dataTotal = timeline.map((t) => t.total);
  const dataErrors = timeline.map((t) => t.errors);

  // If no data points yet, supply current time 0
  if (labels.length === 0) {
    const now = new Date();
    labels.push(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    dataTotal.push(0);
    dataErrors.push(0);
  }

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? '#242c3b' : '#e2e8f0';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  if (throughputChart) {
    throughputChart.data.labels = labels;
    throughputChart.data.datasets[0].data = dataTotal;
    throughputChart.data.datasets[1].data = dataErrors;
    throughputChart.options.scales.x.grid.color = gridColor;
    throughputChart.options.scales.y.grid.color = gridColor;
    throughputChart.update();
    return;
  }

  throughputChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Logs',
          data: dataTotal,
          backgroundColor: 'rgba(59, 130, 246, 0.7)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 2,
        },
        {
          label: 'Errors / Fatal',
          data: dataErrors,
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          borderColor: '#ef4444',
          borderWidth: 1,
          borderRadius: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: textColor, boxWidth: 10, font: { size: 11, family: 'var(--font-sans)' } },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, font: { family: 'var(--font-mono)', size: 10 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, precision: 0, font: { family: 'var(--font-mono)', size: 10 } },
        },
      },
    },
  });
}

function renderLevelsChart(levels) {
  const ctx = document.getElementById('chart-levels');
  if (!ctx || typeof Chart === 'undefined') return;

  const labels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
  const data = labels.map((lvl) => levels[lvl] || 0);

  const colors = [
    '#64748b', // DEBUG
    '#10b981', // INFO
    '#f59e0b', // WARN
    '#ef4444', // ERROR
    '#ec4899', // FATAL
  ];

  if (levelsChart) {
    levelsChart.data.datasets[0].data = data;
    levelsChart.update();
    return;
  }

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const textColor = isDark ? '#94a3b8' : '#64748b';

  levelsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: isDark ? '#161b24' : '#ffffff',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      cutout: '65%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textColor, boxWidth: 10, font: { size: 11 } },
        },
      },
    },
  });
}

function renderTopServices(services) {
  const tbody = document.getElementById('overview-services-tbody');
  if (!tbody) return;

  if (services.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 15px;">No logs ingested yet</td></tr>';
    return;
  }

  tbody.innerHTML = services
    .map((s) => {
      const errRate = s.totalLogs > 0 ? ((s.errorLogs / s.totalLogs) * 100).toFixed(1) : '0';
      const statusColor = s.errorLogs > 0 ? 'var(--lvl-error-fg)' : 'var(--lvl-info-fg)';
      const statusText = s.errorLogs > 0 ? `${errRate}% err` : 'Healthy';

      return `
        <tr>
          <td><strong style="color: #a78bfa; font-family: var(--font-mono);">${escapeHtml(s.service)}</strong></td>
          <td style="font-family: var(--font-mono);">${Number(s.totalLogs).toLocaleString()}</td>
          <td style="font-family: var(--font-mono); color: ${s.errorLogs > 0 ? 'var(--lvl-error-fg)' : 'inherit'};">${Number(s.errorLogs).toLocaleString()}</td>
          <td><span style="font-size: 11px; color: ${statusColor}; font-weight: 600;">${statusText}</span></td>
        </tr>
      `;
    })
    .join('');
}

function renderRecentAlerts(alerts) {
  const tbody = document.getElementById('overview-alerts-tbody');
  if (!tbody) return;

  if (alerts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 15px;">No alert incidents fired</td></tr>';
    return;
  }

  tbody.innerHTML = alerts
    .map((a) => {
      const dateStr = formatTime(a.triggeredAt);
      return `
        <tr>
          <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);">${dateStr}</td>
          <td><strong>${escapeHtml(a.ruleName)}</strong></td>
          <td><span class="level-badge ${a.level}">${a.level}</span></td>
          <td style="font-family: var(--font-mono); color: var(--lvl-error-fg); font-weight: 600;">${a.count}</td>
        </tr>
      `;
    })
    .join('');
}

// Quick jump from overview button to alerts view
document.addEventListener('DOMContentLoaded', () => {
  const btnGoto = document.getElementById('btn-goto-alerts');
  if (btnGoto) {
    btnGoto.addEventListener('click', () => {
      document.querySelector('.nav-item[data-view="alerts"]')?.click();
    });
  }
});
