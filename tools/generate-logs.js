/**
 * Realistic Log Generator Tool
 * Appends simulated server logs to real files in the `logs/` directory.
 * Used for testing agents, live tailing, filtering, and alert engine triggers.
 */
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const FILES = {
  auth: path.join(LOGS_DIR, 'auth-service.log'),
  payment: path.join(LOGS_DIR, 'payment-service.log'),
  gateway: path.join(LOGS_DIR, 'api-gateway.log'),
};

const USERS = ['alice_99', 'bob_smith', 'charlie_k', 'diana_prince', 'admin_root', 'guest_104'];
const IPS = ['192.168.1.15', '10.0.4.88', '172.16.0.42', '203.0.113.195', '198.51.100.2'];

const TEMPLATES = {
  auth: [
    { level: 'INFO', msg: (u, ip) => `User authentication succeeded for user: "${u}" from ${ip}`, json: false },
    { level: 'INFO', msg: (u, ip) => `Issued JWT token for user: "${u}", expires in 3600s`, json: true },
    { level: 'WARN', msg: (u, ip) => `Password retry attempt 2/5 for user: "${u}" from ${ip}`, json: false },
    { level: 'WARN', msg: (u, ip) => `Session expired for user: "${u}" during token refresh`, json: true },
    { level: 'ERROR', msg: (u, ip) => `Authentication failed: Invalid credentials provided for "${u}"`, json: true },
    { level: 'ERROR', msg: (u, ip) => `Blocked suspected brute force attempt on "${u}" from ${ip}`, json: false },
    { level: 'DEBUG', msg: (u) => `Bcrypt hashing completed in 68ms for user "${u}"`, json: true },
  ],
  payment: [
    { level: 'INFO', msg: (u) => `Initiated payment checkout for order #ORD-${Math.floor(Math.random() * 90000 + 10000)} by "${u}"`, json: true },
    { level: 'INFO', msg: () => `Stripe charge completed successfully: $${(Math.random() * 150 + 10).toFixed(2)} USD`, json: false },
    { level: 'WARN', msg: (u) => `Payment declined by bank: Insufficient funds for account "${u}"`, json: false },
    { level: 'WARN', msg: () => `Stripe API response slow: latency 2450ms exceeds SLA target`, json: true },
    { level: 'ERROR', msg: () => `Payment gateway connection timed out after 5000ms`, json: true },
    { level: 'ERROR', msg: (u) => `Failed to process webhook for transaction tx_${Math.random().toString(36).substring(7)}`, json: false },
    { level: 'FATAL', msg: () => `Critical error: Payment database connection pool exhausted!`, json: true },
  ],
  gateway: [
    { level: 'INFO', msg: (u, ip) => `GET /api/v1/products - 200 OK - 14ms - client=${ip}`, json: false },
    { level: 'INFO', msg: (u, ip) => `POST /api/v1/orders - 201 Created - 82ms - user=${u}`, json: true },
    { level: 'DEBUG', msg: () => `Cache hit for redis key 'catalog:items:popular'`, json: false },
    { level: 'WARN', msg: (u, ip) => `Rate limit threshold reached (95/100 req/min) for IP ${ip}`, json: true },
    { level: 'ERROR', msg: (u, ip) => `502 Bad Gateway: Upstream microservice auth-service not responding`, json: false },
    { level: 'ERROR', msg: (u, ip) => `500 Internal Server Error in route /api/v1/checkout: Unhandled exception`, json: true },
    { level: 'FATAL', msg: () => `Out of memory: Reverse proxy worker process terminated abnormally`, json: true },
  ],
};

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function writeSingleLog(serviceKey, forceLevel = null) {
  const filePath = FILES[serviceKey];
  const list = TEMPLATES[serviceKey];
  const template = forceLevel
    ? list.find((t) => t.level === forceLevel) || { level: forceLevel, msg: () => `Simulated ${forceLevel} condition`, json: false }
    : getRandomItem(list);

  const user = getRandomItem(USERS);
  const ip = getRandomItem(IPS);
  const message = template.msg(user, ip);
  const level = forceLevel || template.level;
  const now = new Date().toISOString();

  let line = '';
  if (template.json) {
    line = JSON.stringify({
      timestamp: now,
      level,
      service: `${serviceKey}-service`,
      message,
      user,
      ip,
    }) + '\n';
  } else {
    line = `${now} [${level}] [${serviceKey}-service] ${message}\n`;
  }

  fs.appendFileSync(filePath, line, 'utf8');
  return { service: `${serviceKey}-service`, level, message, line };
}

// Parse CLI flags
const args = process.argv.slice(2);
const isContinuous = args.includes('--continuous') || args.includes('-c');
const isSpike = args.includes('--error-spike') || args.includes('-e');
const burstIdx = args.indexOf('--burst');
const burstCount = burstIdx !== -1 ? parseInt(args[burstIdx + 1], 10) : 0;

if (isSpike) {
  console.log('[LOG GENERATOR] Generating ERROR SPIKE for alert testing (15 ERROR logs into payment-service.log)...');
  for (let i = 0; i < 15; i++) {
    writeSingleLog('payment', 'ERROR');
  }
  console.log('[LOG GENERATOR] Done! If alert rule is active, an alert will trigger on next engine cycle.');
  process.exit(0);
}

if (burstCount > 0) {
  console.log(`[LOG GENERATOR] Generating burst of ${burstCount} logs across all services...`);
  const keys = Object.keys(FILES);
  for (let i = 0; i < burstCount; i++) {
    const key = keys[i % keys.length];
    writeSingleLog(key);
  }
  console.log(`[LOG GENERATOR] Wrote ${burstCount} logs successfully.`);
  process.exit(0);
}

if (isContinuous) {
  console.log('='.repeat(65));
  console.log('[LOG GENERATOR] Continuous Mode Active');
  console.log('Writing realistic logs every ~600ms across 3 service files:');
  console.log(' - ' + FILES.auth);
  console.log(' - ' + FILES.payment);
  console.log(' - ' + FILES.gateway);
  console.log('Press Ctrl+C to terminate.');
  console.log('='.repeat(65));

  const keys = Object.keys(FILES);
  setInterval(() => {
    const randomKey = getRandomItem(keys);
    const result = writeSingleLog(randomKey);
    process.stdout.write(`\r[WROTE] [${result.service}] [${result.level}] ${result.message.slice(0, 50)}...`);
  }, 600);
} else {
  // Default: write 15 starter logs
  console.log('[LOG GENERATOR] Writing 15 starter logs across services...');
  const keys = Object.keys(FILES);
  for (let i = 0; i < 15; i++) {
    const key = keys[i % keys.length];
    writeSingleLog(key);
  }
  console.log('[LOG GENERATOR] Sample logs created in logs/ folder.');
  console.log('Tips:');
  console.log('  Run "node tools/generate-logs.js --continuous" to stream live logs continually');
  console.log('  Run "node tools/generate-logs.js --error-spike" to simulate an alert trigger');
}
