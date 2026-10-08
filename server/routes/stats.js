/**
 * Statistics and Metrics Aggregations
 * Computes real statistics using MongoDB aggregation pipelines ($group, $match, $sort).
 */
const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const Node = require('../models/Node');
const AlertHistory = require('../models/AlertHistory');

/**
 * GET /api/stats/overview
 * Returns aggregated metrics for the overview dashboard.
 */
router.get('/overview', async (req, res) => {
  try {
    const { range = '30m' } = req.query;

    // Determine timeline duration
    let windowMs = 30 * 60 * 1000; // 30 minutes default
    if (range === '1h') windowMs = 60 * 60 * 1000;
    if (range === '6h') windowMs = 6 * 60 * 60 * 1000;
    if (range === '24h') windowMs = 24 * 60 * 60 * 1000;

    const timelineStart = new Date(Date.now() - windowMs);
    const onlineThreshold = new Date(Date.now() - 60 * 1000); // seen within 60s is online

    // Parallel execution of aggregation pipelines
    const [
      totalLogs,
      levelCounts,
      topServices,
      timeline,
      totalNodes,
      onlineNodes,
      recentAlerts,
    ] = await Promise.all([
      Log.countDocuments(),

      // Count by level
      Log.aggregate([
        {
          $group: {
            _id: '$level',
            count: { $sum: 1 },
          },
        },
      ]),

      // Top 7 most active services
      Log.aggregate([
        {
          $group: {
            _id: '$service',
            totalLogs: { $sum: 1 },
            errorLogs: {
              $sum: {
                $cond: [{ $in: ['$level', ['ERROR', 'FATAL']] }, 1, 0],
              },
            },
          },
        },
        { $sort: { totalLogs: -1 } },
        { $limit: 7 },
      ]),

      // Ingestion rate over time grouped by minute (or hour for 24h)
      Log.aggregate([
        { $match: { timestamp: { $gte: timelineStart } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: range === '24h' ? '%Y-%m-%d %H:00' : '%H:%M',
                date: '$timestamp',
              },
            },
            total: { $sum: 1 },
            errors: {
              $sum: {
                $cond: [{ $in: ['$level', ['ERROR', 'FATAL']] }, 1, 0],
              },
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Node counts
      Node.countDocuments(),
      Node.countDocuments({ lastSeen: { $gte: onlineThreshold } }),

      // Recent triggered alerts
      AlertHistory.find().sort({ triggeredAt: -1 }).limit(5).lean(),
    ]);

    // Format level distribution with all standard levels present
    const levels = { DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
    levelCounts.forEach((item) => {
      if (item._id && levels[item._id] !== undefined) {
        levels[item._id] = item.count;
      }
    });

    const errorCount = (levels.ERROR || 0) + (levels.FATAL || 0);
    const errorRate = totalLogs > 0 ? ((errorCount / totalLogs) * 100).toFixed(2) : '0.00';

    return res.json({
      totalLogs,
      errorCount,
      errorRate: `${errorRate}%`,
      levels,
      topServices: topServices.map((s) => ({
        service: s._id || 'unknown',
        totalLogs: s.totalLogs,
        errorLogs: s.errorLogs,
      })),
      timeline: timeline.map((t) => ({
        time: t._id,
        total: t.total,
        errors: t.errors,
      })),
      nodes: {
        total: totalNodes,
        online: onlineNodes,
        offline: Math.max(0, totalNodes - onlineNodes),
      },
      recentAlerts,
    });
  } catch (error) {
    console.error('[STATS ERROR]', error);
    return res.status(500).json({ error: 'Failed to aggregate system metrics', details: error.message });
  }
});

module.exports = router;
