/**
 * Log Parser Module
 * Accurately parses JSON lines and plain-text log lines into normalized log records.
 * Provides fallback to INFO level and current timestamp if not detectable.
 */

const VALID_LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);

const LEVEL_MAP = {
  WARNING: 'WARN',
  CRITICAL: 'FATAL',
  ERR: 'ERROR',
  TRACE: 'DEBUG',
  VERBOSE: 'DEBUG',
};

/**
 * Normalizes log level string to standard enum
 */
function normalizeLevel(raw) {
  if (!raw) return 'INFO';
  const upper = String(raw).toUpperCase().trim();
  if (VALID_LEVELS.has(upper)) return upper;
  if (LEVEL_MAP[upper]) return LEVEL_MAP[upper];
  return 'INFO';
}

/**
 * Parses a single log line (JSON or plaintext)
 * @param {string} line - Raw log line
 * @param {object} defaults - { node: string, service: string }
 * @returns {object} Normalized log object
 */
function parseLogLine(line, defaults = {}) {
  const defaultNode = defaults.node || 'default-node';
  const defaultService = defaults.service || 'default-service';
  const trimmed = (line || '').trim();

  if (!trimmed) return null;

  // 1. Try parsing as JSON line
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const obj = JSON.parse(trimmed);

      // Extract timestamp
      let timestamp = new Date();
      const rawTs = obj.timestamp || obj.time || obj['@timestamp'] || obj.ts || obj.datetime;
      if (rawTs) {
        const parsed = new Date(rawTs);
        if (!isNaN(parsed.getTime())) timestamp = parsed;
      }

      // Extract level
      const rawLevel = obj.level || obj.lvl || obj.severity || obj.logLevel || obj.status;
      const level = normalizeLevel(rawLevel);

      // Extract service and node
      const service = obj.service || obj.app || obj.appName || obj.component || defaultService;
      const node = obj.node || obj.host || obj.hostname || defaultNode;

      // Extract message
      const message = obj.message || obj.msg || obj.text || JSON.stringify(obj);

      // Extract extra metadata
      const {
        timestamp: _1,
        time: _2,
        '@timestamp': _3,
        ts: _4,
        datetime: _5,
        level: _6,
        lvl: _7,
        severity: _8,
        logLevel: _9,
        status: _10,
        service: _11,
        app: _12,
        appName: _13,
        component: _14,
        node: _15,
        host: _16,
        hostname: _17,
        message: _18,
        msg: _19,
        text: _20,
        ...rest
      } = obj;

      return {
        timestamp: timestamp.toISOString(),
        node: String(node).trim(),
        service: String(service).trim(),
        level,
        message: String(message),
        metadata: Object.keys(rest).length > 0 ? rest : null,
      };
    } catch {
      // Fall through to plain text parsing if JSON parse failed
    }
  }

  // 2. Parse as Plain Text line
  let detectedTimestamp = new Date();
  let detectedLevel = 'INFO';
  let detectedService = defaultService;
  let remainingMessage = trimmed;

  // Regex A: Standard ISO/DateTime format:
  // e.g. 2026-10-08 12:30:45.123 [ERROR] [auth-service] User login failed
  // or [2026-10-08T12:30:45Z] [WARN] Database slow query
  const isoPattern = /^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{3,6})?(?:Z|[+-]\d{2}:?\d{2})?)\]?\s*(?:\[?([A-Za-z]+)\]?:?)?\s*(?:\[([a-zA-Z0-9_\-]+)\])?\s*(.*)$/;
  const isoMatch = trimmed.match(isoPattern);

  if (isoMatch) {
    const rawTs = isoMatch[1];
    const parsedTs = new Date(rawTs.replace(' ', 'T'));
    if (!isNaN(parsedTs.getTime())) {
      detectedTimestamp = parsedTs;
    }

    if (isoMatch[2]) {
      detectedLevel = normalizeLevel(isoMatch[2]);
    }
    if (isoMatch[3]) {
      detectedService = isoMatch[3];
    }
    if (isoMatch[4]) {
      remainingMessage = isoMatch[4];
    }
  } else {
    // Regex B: Try finding level keyword anywhere in first 80 characters
    const levelMatch = trimmed.slice(0, 80).match(/\b(FATAL|CRITICAL|ERROR|ERR|WARN|WARNING|INFO|DEBUG|TRACE)\b/i);
    if (levelMatch) {
      detectedLevel = normalizeLevel(levelMatch[1]);
    }
  }

  return {
    timestamp: detectedTimestamp.toISOString(),
    node: defaultNode,
    service: detectedService,
    level: detectedLevel,
    message: remainingMessage,
    metadata: null,
  };
}

module.exports = {
  parseLogLine,
  normalizeLevel,
};
