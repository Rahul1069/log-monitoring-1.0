/**
 * AlertHistory Model
 * Audit log of every fired alert event with match count and webhook dispatch status.
 */
const mongoose = require('mongoose');

const alertHistorySchema = new mongoose.Schema(
  {
    ruleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AlertRule',
      required: true,
    },
    ruleName: {
      type: String,
      required: true,
    },
    service: {
      type: String,
      required: true,
    },
    level: {
      type: String,
      required: true,
    },
    count: {
      type: Number,
      required: true,
    },
    threshold: {
      type: Number,
      required: true,
    },
    windowMinutes: {
      type: Number,
      required: true,
    },
    triggeredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    details: {
      type: String,
      default: '',
    },
    webhookStatus: {
      type: String,
      enum: ['SENT', 'FAILED', 'NONE'],
      default: 'NONE',
    },
    webhookError: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const AlertHistory = mongoose.model('AlertHistory', alertHistorySchema);

module.exports = AlertHistory;
