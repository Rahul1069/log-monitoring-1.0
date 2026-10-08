/**
 * AlertRule Model
 * User-configurable rules for automated anomaly and error detection.
 */
const mongoose = require('mongoose');

const alertRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    service: {
      type: String,
      required: true,
      default: 'ALL',
      trim: true,
    },
    level: {
      type: String,
      required: true,
      enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
      default: 'ERROR',
    },
    threshold: {
      type: Number,
      required: true,
      min: 1,
      default: 10,
    },
    windowMinutes: {
      type: Number,
      required: true,
      min: 1,
      default: 5,
    },
    cooldownMinutes: {
      type: Number,
      required: true,
      min: 1,
      default: 10,
    },
    webhookUrl: {
      type: String,
      default: '',
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    lastTriggered: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

const AlertRule = mongoose.model('AlertRule', alertRuleSchema);

module.exports = AlertRule;
