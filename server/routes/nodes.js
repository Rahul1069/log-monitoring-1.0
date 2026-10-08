/**
 * Distributed Nodes Management Routes
 * Reports node status, heartbeat, and per-node metrics.
 */
const express = require('express');
const router = express.Router();
const Node = require('../models/Node');

const ONLINE_THRESHOLD_MS = 60 * 1000; // 60 seconds

/**
 * GET /api/nodes
 * Returns all registered nodes with dynamic online/offline health status.
 */
router.get('/', async (req, res) => {
  try {
    const rawNodes = await Node.find().sort({ lastSeen: -1 }).lean();
    const now = Date.now();

    const nodes = rawNodes.map((node) => {
      const lastSeenTime = node.lastSeen ? new Date(node.lastSeen).getTime() : 0;
      const diffMs = now - lastSeenTime;
      const isOnline = diffMs <= ONLINE_THRESHOLD_MS;

      return {
        ...node,
        isOnline,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
        secondsSinceLastSeen: Math.floor(diffMs / 1000),
      };
    });

    return res.json({
      nodes,
      total: nodes.length,
      onlineCount: nodes.filter((n) => n.isOnline).length,
      offlineCount: nodes.filter((n) => !n.isOnline).length,
    });
  } catch (error) {
    console.error('[NODES ERROR]', error);
    return res.status(500).json({ error: 'Failed to retrieve node statuses' });
  }
});

/**
 * POST /api/nodes/heartbeat
 * Heartbeat ping from distributed agent even when no new logs are produced.
 */
router.post('/heartbeat', async (req, res) => {
  try {
    const { nodeId, hostname } = req.body;
    if (!nodeId) {
      return res.status(400).json({ error: 'nodeId is required for heartbeat' });
    }

    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';

    const node = await Node.findOneAndUpdate(
      { nodeId: nodeId.trim() },
      {
        $set: {
          lastSeen: new Date(),
          ipAddress,
          hostname: hostname || 'agent-host',
        },
        $setOnInsert: {
          firstSeen: new Date(),
          totalLogs: 0,
          services: [],
        },
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, node });
  } catch (error) {
    console.error('[HEARTBEAT ERROR]', error);
    return res.status(500).json({ error: 'Failed to record heartbeat' });
  }
});

module.exports = router;
