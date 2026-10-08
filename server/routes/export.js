/**
 * Streaming CSV Export Route
 * Streams query results directly to the client row-by-row using MongoDB cursors.
 * Memory footprint stays minimal regardless of the result size.
 */
const express = require('express');
const router = express.Router();
const Log = require('../models/Log');

const VALID_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
}

/**
 * Escapes a single CSV cell value according to RFC 4180
 */
function escapeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  const str = String(value);
  // If the cell contains quotes, commas, or newlines, wrap in quotes and escape internal quotes
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return `"${str}"`;
}

/**
 * GET /api/export/csv
 * Stream filtered logs as a downloadable CSV file.
 */
router.get('/csv', async (req, res) => {
  try {
    const { query, keyword, level, service, node, from, to } = req.query;

    const filter = {};

    // Search term
    const searchTerm = query || keyword;
    if (searchTerm && typeof searchTerm === 'string' && searchTerm.trim() !== '') {
      filter.message = { $regex: escapeRegex(searchTerm.trim()), $options: 'i' };
    }

    // Level filter
    if (level && typeof level === 'string' && level !== 'ALL') {
      const levels = level.split(',').map((l) => l.trim().toUpperCase()).filter((l) => VALID_LEVELS.includes(l));
      if (levels.length === 1) {
        filter.level = levels[0];
      } else if (levels.length > 1) {
        filter.level = { $in: levels };
      }
    }

    // Service filter
    if (service && typeof service === 'string' && service !== 'ALL') {
      const services = service.split(',').map((s) => s.trim()).filter(Boolean);
      if (services.length === 1) {
        filter.service = services[0];
      } else if (services.length > 1) {
        filter.service = { $in: services };
      }
    }

    // Node filter
    if (node && typeof node === 'string' && node !== 'ALL') {
      const nodes = node.split(',').map((n) => n.trim()).filter(Boolean);
      if (nodes.length === 1) {
        filter.node = nodes[0];
      } else if (nodes.length > 1) {
        filter.node = { $in: nodes };
      }
    }

    // Time window
    if (from || to) {
      filter.timestamp = {};
      if (from) {
        const fromDate = new Date(from);
        if (!isNaN(fromDate.getTime())) filter.timestamp.$gte = fromDate;
      }
      if (to) {
        const toDate = new Date(to);
        if (!isNaN(toDate.getTime())) filter.timestamp.$lte = toDate;
      }
      if (Object.keys(filter.timestamp).length === 0) delete filter.timestamp;
    }

    const filename = `logs-export-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

    // Set streaming headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering on reverse proxies if any

    // Write CSV header
    res.write('timestamp,level,node,service,message\r\n');

    // Create MongoDB cursor for constant-memory streaming
    const cursor = Log.find(filter).sort({ timestamp: -1 }).cursor();

    // Clean up if the client disconnects mid-stream
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      cursor.close().catch(() => {});
    });

    for await (const doc of cursor) {
      if (clientDisconnected) break;

      const row = [
        escapeCsvCell(doc.timestamp ? doc.timestamp.toISOString() : ''),
        escapeCsvCell(doc.level),
        escapeCsvCell(doc.node),
        escapeCsvCell(doc.service),
        escapeCsvCell(doc.message),
      ].join(',') + '\r\n';

      // Write row and handle backpressure if needed
      const canContinue = res.write(row);
      if (!canContinue) {
        await new Promise((resolve) => res.once('drain', resolve));
      }
    }

    res.end();
  } catch (error) {
    console.error('[EXPORT ERROR]', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream CSV export', details: error.message });
    } else {
      res.end();
    }
  }
});

module.exports = router;
