/**
 * Alert Engine Background Worker
 * Periodically evaluates active alert rules against real log counts using countDocuments queries.
 * Enforces cooldown periods and broadcasts triggered alerts over WebSocket and optional webhooks.
 */
const AlertRule = require('../models/AlertRule');
const AlertHistory = require('../models/AlertHistory');
const Log = require('../models/Log');
const { broadcastAlert } = require('../websocket/ws');

let intervalId = null;

async function checkRule(rule) {
  try {
    const now = Date.now();

    // 1. Check cooldown period
    if (rule.lastTriggered) {
      const cooldownMs = (rule.cooldownMinutes || 10) * 60 * 1000;
      const elapsedSinceLast = now - new Date(rule.lastTriggered).getTime();
      if (elapsedSinceLast < cooldownMs) {
        // Still in cooldown period; do not re-fire
        return;
      }
    }

    // 2. Build time window query
    const windowMs = (rule.windowMinutes || 5) * 60 * 1000;
    const windowStart = new Date(now - windowMs);

    const filter = {
      timestamp: { $gte: windowStart },
      level: rule.level || 'ERROR',
    };

    if (rule.service && rule.service !== 'ALL') {
      filter.service = rule.service;
    }

    // 3. Count documents matching condition
    const count = await Log.countDocuments(filter);

    // 4. Evaluate threshold
    if (count >= rule.threshold) {
      const details = `Detected ${count} [${rule.level}] log(s) for service "${rule.service}" in past ${rule.windowMinutes} minute(s). Exceeded threshold of ${rule.threshold}.`;

      console.warn(`[ALERT FIRED] Rule "${rule.name}": ${details}`);

      // 5. Update lastTriggered on rule
      rule.lastTriggered = new Date(now);
      await rule.save();

      // 6. Optional Webhook dispatch
      let webhookStatus = 'NONE';
      let webhookError = '';

      if (rule.webhookUrl && rule.webhookUrl.startsWith('http')) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 5000);

          const resp = await fetch(rule.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              alert: rule.name,
              service: rule.service,
              level: rule.level,
              count,
              threshold: rule.threshold,
              windowMinutes: rule.windowMinutes,
              triggeredAt: new Date(now).toISOString(),
              details,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (resp.ok) {
            webhookStatus = 'SENT';
          } else {
            webhookStatus = 'FAILED';
            webhookError = `HTTP ${resp.status}: ${resp.statusText}`;
          }
        } catch (err) {
          webhookStatus = 'FAILED';
          webhookError = err.message;
        }
      }

      // 7. Store in AlertHistory collection
      const alertHistoryDoc = await AlertHistory.create({
        ruleId: rule._id,
        ruleName: rule.name,
        service: rule.service,
        level: rule.level,
        count,
        threshold: rule.threshold,
        windowMinutes: rule.windowMinutes,
        triggeredAt: new Date(now),
        details,
        webhookStatus,
        webhookError,
      });

      // 8. Broadcast live alert over WebSocket to all connected browser dashboards
      broadcastAlert(alertHistoryDoc);
    }
  } catch (error) {
    console.error(`[ALERT ENGINE ERROR] Failed evaluating rule "${rule.name}":`, error.message);
  }
}

async function runAlertCheckCycle() {
  try {
    const activeRules = await AlertRule.find({ enabled: true });
    for (const rule of activeRules) {
      await checkRule(rule);
    }
  } catch (error) {
    console.error('[ALERT ENGINE CYCLE ERROR]', error.message);
  }
}

function startAlertEngine() {
  const intervalSeconds = parseInt(process.env.ALERT_CHECK_INTERVAL_SECONDS || '15', 10);
  const intervalMs = Math.max(5, intervalSeconds) * 1000;

  console.log(`[ALERT ENGINE] Starting rule evaluator (interval: ${intervalSeconds}s)...`);

  // Run first check after 3 seconds
  setTimeout(() => {
    runAlertCheckCycle();
  }, 3000);

  // Periodic recurring check
  intervalId = setInterval(runAlertCheckCycle, intervalMs);
}

function stopAlertEngine() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

module.exports = {
  startAlertEngine,
  stopAlertEngine,
  runAlertCheckCycle,
};
