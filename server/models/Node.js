/**
 * Node Model
 * Tracks registered distributed agents/nodes, their health status, and ingest volume.
 */
const mongoose = require('mongoose');

const nodeSchema = new mongoose.Schema(
  {
    nodeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    hostname: {
      type: String,
      default: 'unknown-host',
    },
    ipAddress: {
      type: String,
      default: '127.0.0.1',
    },
    firstSeen: {
      type: Date,
      default: Date.now,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
      index: true,
    },
    totalLogs: {
      type: Number,
      default: 0,
    },
    services: {
      type: [String],
      default: [],
    },
    lastLevel: {
      type: String,
      default: 'INFO',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const Node = mongoose.model('Node', nodeSchema);

module.exports = Node;
