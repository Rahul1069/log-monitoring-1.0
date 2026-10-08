/**
 * Alerts API Routes
 * CRUD operations for alert rules and retrieval of triggered alert history.
 */
const express = require('express');
const router = express.Router();
const AlertRule = require('../models/AlertRule');
const AlertHistory = require('../models/AlertHistory');
const { runAlertCheckCycle } = require('../alerts/engine');

const VALID_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * GET /api/alerts/rules
 * List all configured alert rules
 */
router.get('/rules', async (req, res) => {
  try {
    const rules = await AlertRule.find().sort({ createdAt: -1 }).lean();
    return res.json({ rules });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch alert rules' });
  }
});

/**
 * POST /api/alerts/rules
 * Create a new alert rule
 */
router.post('/rules', async (req, res) => {
  try {
    const { name, service, level, threshold, windowMinutes, cooldownMinutes, webhookUrl } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Rule name is required' });
    }

    const normLevel = (level || 'ERROR').toUpperCase();
    if (!VALID_LEVELS.includes(normLevel)) {
      return res.status(400).json({ error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}` });
    }

    const numThreshold = parseInt(threshold, 10);
    if (isNaN(numThreshold) || numThreshold < 1) {
      return res.status(400).json({ error: 'Threshold must be a positive integer' });
    }

    const numWindow = parseInt(windowMinutes, 10) || 5;
    const numCooldown = parseInt(cooldownMinutes, 10) || 10;

    const newRule = await AlertRule.create({
      name: name.trim(),
      service: (service || 'ALL').trim(),
      level: normLevel,
      threshold: numThreshold,
      windowMinutes: numWindow,
      cooldownMinutes: numCooldown,
      webhookUrl: (webhookUrl || '').trim(),
      enabled: true,
    });

    return res.status(201).json({ success: true, rule: newRule });
  } catch (error) {
    console.error('[CREATE RULE ERROR]', error);
    return res.status(500).json({ error: 'Failed to create alert rule', details: error.message });
  }
});

/**
 * PUT /api/alerts/rules/:id/toggle
 * Toggle enabled status of an alert rule
 */
router.put('/rules/:id/toggle', async (req, res) => {
  try {
    const rule = await AlertRule.findById(req.params.id);
    if (!rule) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }
    rule.enabled = !rule.enabled;
    await rule.save();
    return res.json({ success: true, enabled: rule.enabled });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to toggle alert rule' });
  }
});

/**
 * DELETE /api/alerts/rules/:id
 * Delete an alert rule
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const deleted = await AlertRule.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }
    return res.json({ success: true, message: 'Rule deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete alert rule' });
  }
});

/**
 * GET /api/alerts/history
 * List historical alert trigger events
 */
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
    const history = await AlertHistory.find().sort({ triggeredAt: -1 }).limit(limit).lean();
    return res.json({ history });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch alert history' });
  }
});

/**
 * POST /api/alerts/check
 * Trigger an immediate manual check of all active alert rules
 */
router.post('/check', async (req, res) => {
  try {
    await runAlertCheckCycle();
    return res.json({ success: true, message: 'Alert evaluation check triggered' });
  } catch (error) {
    return res.status(500).json({ error: 'Error during alert check cycle' });
  }
});

module.exports = router;
