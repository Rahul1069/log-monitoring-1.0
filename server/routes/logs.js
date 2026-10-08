/**
 * Log Ingestion and Search Routes
 * Provides POST /api/logs for real ingestion and GET /api/logs for paginated search.
 */
const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const Node = require('../models/Node');
const { broadcastLogs } = require('../websocket/ws');

const VALID_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * Middleware: Verify API Key from headers or query params
 */
function verifyApiKey(req, res, next) {
  const configuredKey = process.env.API_KEY;
  // If no API_KEY configured in environment, allow requests
  if (!configuredKey) {
    return next();
  }

  const providedKey =
    req.headers['x-api-key'] ||
    (req.headers['authorization'] && req.headers['authorization'].replace(/^Bearer\s+/i, '')) ||
    req.query.api_key;

  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing API key. Provide header x-api-key or Authorization: Bearer <key>',
    });
  }
  next();
}

/**
 * Helper: Escapes special characters for MongoDB regular expressions
 */
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * POST /api/logs
 * Ingest a single log object or an array of log objects.
 */
router.post('/', verifyApiKey, async (req, res) => {
  try {
    const body = req.body;
    if (!body || (typeof body !== 'object')) {
      return res.status(400).json({ error: 'Invalid payload: Request body must be a JSON object or array' });
    }

    const rawLogs = Array.isArray(body) ? body : [body];

    if (rawLogs.length === 0) {
      return res.status(400).json({ error: 'Invalid payload: Array cannot be empty' });
    }

    if (rawLogs.length > 2000) {
      return res.status(400).json({ error: 'Payload too large: Maximum 2000 logs per batch' });
    }

    const validDocs = [];
    const nodeStatsMap = new Map(); // nodeId -> { count, services, lastLevel, hostname }

    for (let i = 0; i < rawLogs.length; i++) {
      const item = rawLogs[i];
      if (!item || typeof item !== 'object') continue;

      const message = typeof item.message === 'string' ? item.message.trim() : String(item.message || '').trim();
      if (!message) {
        // Skip empty messages
        continue;
      }

      const node = (typeof item.node === 'string' && item.node.trim()) ? item.node.trim() : 'unknown-node';
      const service = (typeof item.service === 'string' && item.service.trim()) ? item.service.trim() : 'default';

      // Normalize level
      let level = (typeof item.level === 'string') ? item.level.toUpperCase().trim() : 'INFO';
      if (!VALID_LEVELS.includes(level)) {
        level = 'INFO';
      }

      // Parse timestamp safely
      let timestamp = new Date();
      if (item.timestamp) {
        const parsedTs = new Date(item.timestamp);
        if (!isNaN(parsedTs.getTime())) {
          timestamp = parsedTs;
        }
      }

      const doc = {
        timestamp,
        node,
        service,
        level,
        message,
        metadata: item.metadata || null,
      };

      validDocs.push(doc);

      // Accumulate node stats for batch upsert
      if (!nodeStatsMap.has(node)) {
        nodeStatsMap.set(node, {
          count: 0,
          services: new Set(),
          lastLevel: level,
          hostname: item.hostname || req.headers['x-hostname'] || 'agent-host',
        });
      }
      const nodeStat = nodeStatsMap.get(node);
      nodeStat.count += 1;
      nodeStat.services.add(service);
      nodeStat.lastLevel = level;
    }

    if (validDocs.length === 0) {
      return res.status(400).json({
        error: 'Validation failed: No valid log entries found. Each log requires at least a non-empty message.',
      });
    }

    // Insert into MongoDB using insertMany
    const inserted = await Log.insertMany(validDocs, { ordered: false });

    // Update Node records asynchronously
    const ipAddress = req.ip || req.connection.remoteAddress || '127.0.0.1';
    for (const [nodeId, stat] of nodeStatsMap.entries()) {
      Node.findOneAndUpdate(
        { nodeId },
        {
          $set: {
            lastSeen: new Date(),
            ipAddress,
            hostname: stat.hostname,
            lastLevel: stat.lastLevel,
          },
          $inc: { totalLogs: stat.count },
          $addToSet: { services: { $each: Array.from(stat.services) } },
          $setOnInsert: { firstSeen: new Date() },
        },
        { upsert: true }
      ).catch((err) => {
        console.error(`[NODE TRACK] Failed to update node ${nodeId}:`, err.message);
      });
    }

    // Broadcast new logs via WebSocket to live tail clients
    broadcastLogs(inserted);

    return res.status(201).json({
      success: true,
      count: inserted.length,
      rejected: rawLogs.length - inserted.length,
    });
  } catch (error) {
    console.error('[INGEST ERROR]', error);
    return res.status(500).json({ error: 'Internal Server Error while inserting logs', details: error.message });
  }
});

/**
 * GET /api/logs
 * Search logs with filters, keyword regex matching, and pagination.
 */
router.get('/', async (req, res) => {
  try {
    const {
      query,
      keyword,
      level,
      service,
      node,
      from,
      to,
      page = 1,
      limit = 50,
    } = req.query;

    const filter = {};

    // Keyword search in log message (case-insensitive regex with escaped input)
    const searchTerm = query || keyword;
    if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim() !== '') {
      filter.message = { $regex: escapeRegex(searchTerm.trim()), $options: 'i' };
    }

    // Filter by level (support single or comma-separated list e.g. ERROR,WARN)
    if (level && typeof level === 'string' && level !== 'ALL') {
      const levels = level.split(',').map((l) => l.trim().toUpperCase()).filter((l) => VALID_LEVELS.includes(l));
      if (levels.length === 1) {
        filter.level = levels[0];
      } else if (levels.length > 1) {
        filter.level = { $in: levels };
      }
    }

    // Filter by service
    if (service && typeof service === 'string' && service !== 'ALL') {
      const services = service.split(',').map((s) => s.trim()).filter(Boolean);
      if (services.length === 1) {
        filter.service = services[0];
      } else if (services.length > 1) {
        filter.service = { $in: services };
      }
    }

    // Filter by node
    if (node && typeof node === 'string' && node !== 'ALL') {
      const nodes = node.split(',').map((n) => n.trim()).filter(Boolean);
      if (nodes.length === 1) {
        filter.node = nodes[0];
      } else if (nodes.length > 1) {
        filter.node = { $in: nodes };
      }
    }

    // Time range filter
    if (from || to) {
      filter.timestamp = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) {
          filter.timestamp.$gte = fromDate;
        }
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) {
          filter.timestamp.$lte = toDate;
        }
      }
      if (Object.keys(filter.timestamp).length === 0) {
        delete filter.timestamp;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const skip = (pageNum - 1) * limitNum;

    // Run count and query in parallel
    const [total, logs] = await Promise.all([
      Log.countDocuments(filter),
      Log.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
    ]);

    return res.json({
      logs,
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum) || 1,
    });
  } catch (error) {
    console.error('[SEARCH ERROR]', error);
    return res.status(500).json({ error: 'Failed to search logs', details: error.message });
  }
});

/**
 * GET /api/logs/metadata
 * Return available nodes, services, and levels for dropdown filters
 */
router.get('/metadata', async (req, res) => {
  try {
    const [nodes, services] = await Promise.all([
      Log.distinct('node'),
      Log.distinct('service'),
    ]);

    res.json({
      nodes: nodes.filter(Boolean).sort(),
      services: services.filter(Boolean).sort(),
      levels: VALID_LEVELS,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch filter metadata' });
  }
});

module.exports = router;
