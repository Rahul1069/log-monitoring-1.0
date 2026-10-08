/**
 * Log Model
 * Stores individual log entries with indexes for high-speed queries and TTL retention.
 */
const mongoose = require('mongoose');

// Calculate retention TTL in seconds (default 7 days)
const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '7', 10);
const expireAfterSeconds = Math.max(1, retentionDays) * 86400;

const logSchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
    },
    node: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    level: {
      type: String,
      required: true,
      enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
      default: 'INFO',
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    // Omit __v to save storage in high-volume logging
    versionKey: false,
  }
);

// Compound index for alert queries: count documents by service + level within a time window
logSchema.index({ service: 1, level: 1, timestamp: -1 });

// Compound index for search filters (node + service + timestamp)
logSchema.index({ node: 1, service: 1, timestamp: -1 });

// TTL index: MongoDB background thread will automatically clean up logs older than retention period
logSchema.index({ timestamp: 1 }, { expireAfterSeconds });

const Log = mongoose.model('Log', logSchema);

module.exports = Log;
