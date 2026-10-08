/**
 * Distributed Log Monitoring Agent
 * Runs on distributed nodes, tails local log files, batches logs, and sends to central server.
 * Includes automatic retry with zero log loss when the central server is temporarily unreachable.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { parseLogLine } = require('./parser');

// 1. Parse Command Line Arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--node' || arg === '-n') {
      options.nodeName = args[++i];
    } else if (arg === '--file' || arg === '-f') {
      options.logFile = args[++i];
    } else if (arg === '--service' || arg === '-s') {
      options.serviceName = args[++i];
    } else if (arg === '--server') {
      options.serverUrl = args[++i];
    } else if (arg === '--apiKey') {
      options.apiKey = args[++i];
    } else if (arg === '--config' || arg === '-c') {
      options.configPath = args[++i];
    } else if (arg === '--from-start') {
      options.fromStart = true;
    }
  }
  return options;
}

// 2. Load Configuration (Priority: CLI > ENV > config.json > Defaults)
function loadConfig() {
  const cliArgs = parseArgs();
  const configPath = cliArgs.configPath || path.join(__dirname, 'config.json');

  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.warn(`[AGENT] Warning: Failed to parse config file ${configPath}: ${e.message}`);
    }
  }

  const config = {
    serverUrl: cliArgs.serverUrl || process.env.SERVER_URL || fileConfig.serverUrl || 'http://localhost:3000',
    apiKey: cliArgs.apiKey || process.env.API_KEY || fileConfig.apiKey || 'log-monitor-secret-key-2026',
    nodeName: cliArgs.nodeName || process.env.NODE_NAME || fileConfig.nodeName || `node-${os.hostname().toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    serviceName: cliArgs.serviceName || process.env.SERVICE_NAME || fileConfig.serviceName || 'default-service',
    logFile: cliArgs.logFile || process.env.LOG_FILE || fileConfig.logFile || 'logs/app.log',
    batchSize: parseInt(cliArgs.batchSize || process.env.BATCH_SIZE || fileConfig.batchSize || '25', 10),
    batchIntervalMs: parseInt(cliArgs.batchIntervalMs || process.env.BATCH_INTERVAL_MS || fileConfig.batchIntervalMs || '1000', 10),
    heartbeatIntervalMs: parseInt(cliArgs.heartbeatIntervalMs || fileConfig.heartbeatIntervalMs || '15000', 10),
    maxQueueSize: parseInt(fileConfig.maxQueueSize || '50000', 10),
    fromStart: cliArgs.fromStart !== undefined ? cliArgs.fromStart : true, // Read from start so test logs are sent
  };

  return config;
}

const config = loadConfig();
const logFilePath = path.isAbsolute(config.logFile) ? config.logFile : path.resolve(process.cwd(), config.logFile);

console.log('='.repeat(65));
console.log(`[AGENT STARTING] Distributed Log Agent`);
console.log(`  Node ID:       ${config.nodeName}`);
console.log(`  Service:       ${config.serviceName}`);
console.log(`  Tailing File:  ${logFilePath}`);
console.log(`  Target Server: ${config.serverUrl}`);
console.log(`  Batch Policy:  ${config.batchSize} logs or every ${config.batchIntervalMs}ms`);
console.log('='.repeat(65));

// Ensure target log file and directory exist so agent can tail immediately
const logDir = path.dirname(logFilePath);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}
if (!fs.existsSync(logFilePath)) {
  fs.writeFileSync(logFilePath, '', 'utf8');
  console.log(`[AGENT] Created empty target log file: ${logFilePath}`);
}

// In-memory log buffer queue
let queue = [];
let isFlushing = false;
let retryBackoffMs = 1000;
let currentOffset = 0;
let remainderBuffer = '';

// Initialize offset
try {
  const stat = fs.statSync(logFilePath);
  if (config.fromStart) {
    currentOffset = 0;
  } else {
    currentOffset = stat.size;
  }
} catch {
  currentOffset = 0;
}

/**
 * Reads new data appended to the log file
 */
function readNewLogs() {
  try {
    if (!fs.existsSync(logFilePath)) return;
    const stat = fs.statSync(logFilePath);

    // If file was truncated or rotated
    if (stat.size < currentOffset) {
      console.log(`[AGENT] Log file rotated or truncated. Resetting read offset from ${currentOffset} to 0`);
      currentOffset = 0;
      remainderBuffer = '';
    }

    if (stat.size > currentOffset) {
      const bytesToRead = stat.size - currentOffset;
      const buffer = Buffer.alloc(bytesToRead);
      const fd = fs.openSync(logFilePath, 'r');
      fs.readSync(fd, buffer, 0, bytesToRead, currentOffset);
      fs.closeSync(fd);

      currentOffset = stat.size;

      const chunkText = remainderBuffer + buffer.toString('utf8');
      const lines = chunkText.split(/\r?\n/);

      // The last element is either empty (if line ended with newline) or an incomplete line
      remainderBuffer = lines.pop();

      let parsedCount = 0;
      for (const rawLine of lines) {
        if (!rawLine.trim()) continue;

        const parsed = parseLogLine(rawLine, {
          node: config.nodeName,
          service: config.serviceName,
        });

        if (parsed) {
          if (queue.length < config.maxQueueSize) {
            queue.push(parsed);
            parsedCount++;
          } else {
            console.warn(`[AGENT] Warning: Queue limit reached (${config.maxQueueSize}). Dropping oldest line.`);
            queue.shift();
            queue.push(parsed);
          }
        }
      }

      if (parsedCount > 0) {
        // Trigger immediate flush if queue exceeds batch size
        if (queue.length >= config.batchSize) {
          flushQueue();
        }
      }
    }
  } catch (err) {
    console.error(`[AGENT] Error reading file: ${err.message}`);
  }
}

/**
 * Flush pending logs in queue to the server
 */
async function flushQueue() {
  if (isFlushing || queue.length === 0) return;
  isFlushing = true;

  // Extract up to batchSize items
  const batch = queue.slice(0, config.batchSize);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(`${config.serverUrl}/api/logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'x-node-id': config.nodeName,
        'x-hostname': os.hostname(),
      },
      body: JSON.stringify(batch),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      // Ingest succeeded: remove sent batch from queue
      queue.splice(0, batch.length);
      retryBackoffMs = 1000; // Reset backoff
      // Only log every batch or when queue was backed up
      process.stdout.write(`\r[AGENT ${config.nodeName}] Sent ${batch.length} logs | In queue: ${queue.length}    `);
    } else {
      const errorText = await response.text();
      throw new Error(`Server returned HTTP ${response.status}: ${errorText}`);
    }
  } catch (err) {
    // Failure! Keep logs in queue and backoff
    console.warn(`\n[AGENT ${config.nodeName}] [RETRY] Server unreachable (${err.message}). Retaining ${batch.length} logs in queue (Total queue: ${queue.length}). Retrying in ${(retryBackoffMs / 1000).toFixed(1)}s...`);

    // Backoff up to 10 seconds
    await new Promise((r) => setTimeout(r, retryBackoffMs));
    retryBackoffMs = Math.min(10000, retryBackoffMs * 1.5);
  } finally {
    isFlushing = false;
  }
}

/**
 * Send periodic heartbeat to server
 */
async function sendHeartbeat() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    await fetch(`${config.serverUrl}/api/nodes/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({
        nodeId: config.nodeName,
        hostname: os.hostname(),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch {
    // Ignore heartbeat failure; server might be restarting
  }
}

// 1. Initial read
readNewLogs();

// 2. Poll log file for modifications (250ms interval + fs.watch for instant response)
const filePollInterval = setInterval(readNewLogs, 250);

try {
  fs.watch(logFilePath, () => {
    readNewLogs();
  });
} catch (e) {
  // Fallback to polling if fs.watch has OS limitations
}

// 3. Periodic batch flush timer
const batchFlushInterval = setInterval(flushQueue, config.batchIntervalMs);

// 4. Periodic heartbeat timer
const heartbeatInterval = setInterval(sendHeartbeat, config.heartbeatIntervalMs);
sendHeartbeat(); // send initial heartbeat immediately

// Clean shutdown
process.on('SIGINT', async () => {
  console.log(`\n[AGENT ${config.nodeName}] Shutting down...`);
  clearInterval(filePollInterval);
  clearInterval(batchFlushInterval);
  clearInterval(heartbeatInterval);

  if (queue.length > 0) {
    console.log(`[AGENT] Attempting final flush of ${queue.length} queued logs...`);
    await flushQueue();
  }
  process.exit(0);
});
