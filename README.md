# Distributed Log Monitoring System

A production-grade, distributed log monitoring and analysis system designed for reliability, high throughput, and zero data loss. Built with **Node.js, Express, MongoDB (Mongoose), WebSockets, and Vanilla HTML/CSS/JS**.

---

## 1. Project Overview

In real-world microservice architectures (like Netflix, Uber, or Amazon), applications run across dozens or hundreds of independent servers, containers, and virtual machines. When a failure happens, inspecting log files by logging into individual machines via SSH is slow, unreliable, and prone to data loss.

This project implements a **Distributed Log Monitoring System** where:
1. Lightweight, zero-dependency **Agents** run on distributed nodes to tail local log files.
2. Agents buffer and batch logs, transmitting them securely over HTTP to a central **Ingestion API** protected by API keys.
3. If the central server experiences temporary downtime, agents retain unsent logs in memory and retry with exponential backoff (**Zero Log Loss Guarantee**).
4. A central **Express + MongoDB** server stores logs with compound indexes and automatic time-to-live (TTL) data retention.
5. Ingested logs are broadcast **in real time via WebSockets** to an engineering dashboard (inspired by Grafana and Papertrail) without polling or replica set change streams.
6. A background **Alert Engine** evaluates custom threshold rules using MongoDB `countDocuments` queries and broadcasts live alerts and optional webhooks with cooldown periods.
7. Logs can be searched with case-insensitive regular expressions, filtered across nodes, services, levels, and timeframes, and **streamed as CSV exports** with minimal memory usage.

---

## 2. Architecture & How It Works

### Architectural Diagram

```text
+-----------------------------------------------------------------------------------+
|                              DISTRIBUTED NODES                                    |
|                                                                                   |
|  [Node 1: node-alpha]           [Node 2: node-beta]           [Node 3: node-gamma]|
|  logs/auth-service.log          logs/payment-service.log      logs/api-gateway.log|
|           |                              |                             |          |
|    [agent/agent.js]               [agent/agent.js]              [agent/agent.js]  |
|    (tail + queue + retry)         (tail + queue + retry)        (tail + queue)    |
+-----------|------------------------------|-----------------------------|----------+
            |                              |                             |
            +------------------------------+-----------------------------+
                                           | HTTP POST /api/logs (Batched + API Key)
                                           v
+-----------------------------------------------------------------------------------+
|                           CENTRAL MONITORING SERVER                               |
|                                                                                   |
|  [Express Ingestion API]  --->  [Validation & Parser]                             |
|          |                                   |                                    |
|          | (Immediate WS Broadcast)          v                                    |
|          |                           [MongoDB Storage]                            |
|          |                           - Logs Collection (TTL Index)                |
|          |                           - Nodes Cluster State (Heartbeats)           |
|          |                                   ^                                    |
|          v                                   | (Periodic countDocuments queries)  |
|  [WebSocket Server (ws)]             [Alert Engine]                               |
|  path: /ws                                   |                                    |
|          |                                   v                                    |
|          | (Live logs & alerts)      [Alert Rules & History]                      |
|          v                           - Cooldowns & Optional Webhooks              |
+----------|-----------------------------------|------------------------------------+
           |                                   |
           +-----------------+-----------------+
                             |
                             v
+-----------------------------------------------------------------------------------+
|                        FRONTEND WEB DASHBOARD (Vanilla JS)                        |
|                                                                                   |
|   1. System Overview    : Aggregations, real ingestion throughput & level charts  |
|   2. Live Tail Stream   : Real-time logs, pause/resume, auto-scroll, filters      |
|   3. Search & Explore   : Keyword regex, time windows, highlight, CSV export     |
|   4. Cluster Nodes      : Live online/offline heartbeat status & volume count     |
|   5. Alert Manager      : Create threshold rules, audit log, real-time toasts     |
+-----------------------------------------------------------------------------------+
```

---

## 3. Technology Stack

- **Backend**: Node.js & Express.js
- **Database**: MongoDB using Mongoose ODM
- **Live Streaming**: WebSocket (`ws` library) broadcasting from ingestion route
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+), Chart.js (vendored locally for 100% offline usage)
- **Zero Build Step**: No Webpack, Vite, or React needed; clean, readable, and easy to explain.

---

## 4. Prerequisites & Database Setup

### Option A: Local MongoDB (Recommended)
1. Ensure MongoDB Community Server is installed on your machine.
2. Verify it is running:
   - **Windows**: Open PowerShell as Administrator and run `net start MongoDB` or check `Services.msc`.
   - **macOS**: Run `brew services start mongodb/brew/mongodb-community`.
   - **Linux**: Run `sudo systemctl start mongod`.
3. Default connection URI: `mongodb://127.0.0.1:27017/logmonitor`.

### Option B: Free Cloud MongoDB Atlas
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0 Sandbox** cluster.
3. Under **Database Access**, create a database user (e.g., `admin` / `password123`).
4. Under **Network Access**, add IP `0.0.0.0/0` (Allow Access from Anywhere).
5. Click **Connect** -> **Drivers** -> Copy the connection string.
6. Paste the connection string into `.env`:
   ```env
   MONGODB_URI=mongodb+srv://admin:password123@cluster0.mongodb.net/logmonitor?retryWrites=true&w=majority
   ```

---

## 5. Step-by-Step Quickstart

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Environment Configuration
Check `.env` (a ready-to-run `.env` is included, or copy from `.env.example`):
```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/logmonitor
API_KEY=log-monitor-secret-key-2026
LOG_RETENTION_DAYS=7
ALERT_CHECK_INTERVAL_SECONDS=15
```

### Step 3: Start the Central Server
```bash
npm start
```
You will see:
```text
[DB] Connected to MongoDB at: 127.0.0.1:27017/logmonitor
[WS] WebSocket server initialized on path /ws
[ALERT ENGINE] Starting rule evaluator (interval: 15s)...
[SERVER] Distributed Log Monitoring System active!
[SERVER] Web Dashboard: http://localhost:5000
```
Open your browser at **`http://localhost:5000`**.

---

## 6. Running Distributed Agents

You can run multiple agents on a single laptop or across different machines on your local network.

### Running 3 Agents on One Laptop (Separate Terminals)

Open three separate terminal windows:

**Terminal 1 (Node Alpha - Auth Service):**
```bash
npm run agent:node1
# or: node agent/agent.js --node node-alpha --service auth-service --file logs/auth-service.log --server http://localhost:5000
```

**Terminal 2 (Node Beta - Payment Service):**
```bash
npm run agent:node2
# or: node agent/agent.js --node node-beta --service payment-service --file logs/payment-service.log --server http://localhost:5000
```

**Terminal 3 (Node Gamma - API Gateway):**
```bash
npm run agent:node3
# or: node agent/agent.js --node node-gamma --service api-gateway --file logs/api-gateway.log --server http://localhost:5000
```

### Running on Another Laptop / Remote Machine
1. Copy `agent/agent.js` and `agent/parser.js` to the other laptop.
2. Find the IP of your server machine (e.g., `192.168.1.50`).
3. Run the agent pointing to the server's IP:
   ```bash
   node agent/agent.js --node remote-laptop-1 --service payment-service --file /var/log/app.log --server http://192.168.1.50:5000 --apiKey log-monitor-secret-key-2026
   ```

---

## 7. Generating Realistic Logs & Testing Features

We provide `tools/generate-logs.js` to simulate realistic microservice traffic.

### 1. Continuous Live Streaming
To see logs stream continuously in the **Live Tail** and watch the **Overview Throughput Chart** update in real time:
```bash
npm run generate:continuous
# Generates a realistic log every 600ms across auth, payment, and gateway files
```

### 2. Burst Generation
```bash
node tools/generate-logs.js --burst 50
```

### 3. Testing Alerts with an Error Spike
1. Open the **Alerts** page in the UI (`http://localhost:5000`).
2. Verify or create a rule:
   - Name: `Payment Service Error Spike`
   - Service: `payment-service`
   - Level: `ERROR`
   - Threshold: `5`
   - Window: `5` minutes
   - Cooldown: `5` minutes
3. Run the error spike generator:
   ```bash
   npm run generate:spike
   ```
4. Within 15 seconds, the background Alert Engine will evaluate the rule, trigger an alert, and a live toast alert banner will appear in the UI:
   ```text
   🚨 ALERT FIRED: "Payment Service Error Spike" (15 logs exceeded threshold)
   ```
5. View the audit trail on the **Alerts** tab.

### 4. Testing Zero-Log-Loss Resilience (Agent Queue & Retry)
1. Stop the central server (`Ctrl+C` in the server terminal).
2. Generate logs: `node tools/generate-logs.js --burst 10`.
3. Observe the running agents: they print `[RETRY] Server unreachable. Retaining logs in queue. Retrying...`.
4. Restart the server (`npm start`).
5. Agents immediately reconnect, flush the queue, and every log is stored without loss!

### 5. Testing Streaming CSV Export
1. Go to the **Search** tab.
2. Filter by level `ERROR` or keyword `failed`.
3. Click **Export CSV**.
4. The server streams the rows directly using MongoDB cursors (`Transfer-Encoding: chunked`), preventing memory spikes.

---

## 8. Viva Questions and Answers (Oral Exam Prep)

### Q1: How does the distributed part work, and why not send logs directly from apps?
**Answer:**
Applications write logs directly to local disk files (`stdout` or rotating `.log` files). This is standard practice in Twelve-Factor applications because logging synchronously over HTTP from an application thread can block request handling or crash the app if the log collector is slow.
The distributed **Agent** (`agent/agent.js`) runs as a lightweight, independent process on each host. It tails local log files, buffers new lines, parses them, and batches them to the central server. If the network drops or the server restarts, the application is completely unaffected, and the agent holds the logs in its queue until connectivity is restored.

### Q2: Why was MongoDB chosen instead of relational databases like MySQL or PostgreSQL?
**Answer:**
1. **Schema Flexibility**: Different microservices produce different log metadata (e.g., user IDs, HTTP status codes, stack traces, custom JSON payloads). MongoDB stores BSON documents natively without requiring database migrations for every new service or field.
2. **High Ingestion Write Throughput**: MongoDB's `insertMany` with unordered writes enables fast batch writes ideal for log streams.
3. **Built-in TTL (Time-To-Live) Indexing**: MongoDB has native background TTL threads (`expireAfterSeconds`). Old logs are pruned automatically without cron jobs or complex `DELETE` queries that lock tables.
4. **Rich Aggregation Pipelines**: Computing stats like throughput per minute (`$group` with `$dateToString`), top noisy services, and level distribution is executed natively on the database server.

### Q3: Why use WebSockets directly from the ingest route instead of MongoDB Change Streams?
**Answer:**
MongoDB Change Streams require a **Replica Set** (multiple nodes with oplog replication enabled). Many student setups and local development environments run standalone single-node MongoDB instances (`mongod`), where Change Streams fail with an error.
By broadcasting directly from the Express ingestion route via the `ws` library, the architecture works on **any** standard MongoDB instance (local standalone or free-tier MongoDB Atlas) with lower latency and zero replica set requirements.

### Q4: How does the system prevent Out-Of-Memory (OOM) errors during CSV export?
**Answer:**
Instead of loading thousands or millions of documents into a Node.js array in memory (`Log.find().then(...)`), the export route uses Mongoose cursors:
```javascript
const cursor = Log.find(filter).sort({ timestamp: -1 }).cursor();
for await (const doc of cursor) {
  res.write(formatCsvRow(doc));
}
res.end();
```
This streams results row-by-row with backpressure handling, keeping the server's memory footprint constant ($O(1)$) regardless of whether the exported dataset contains 100 rows or 1,000,000 rows.

### Q5: How do compound indexes optimize alert evaluation?
**Answer:**
The Alert Engine runs queries like:
```javascript
Log.countDocuments({ service: 'payment-service', level: 'ERROR', timestamp: { $gte: windowStart } });
```
Without indexes, MongoDB performs a collection scan (`COLLSCAN`), checking every log document on disk.
We defined a compound index:
```javascript
logSchema.index({ service: 1, level: 1, timestamp: -1 });
```
MongoDB uses index scan (`IXSCAN`) to jump directly to the matching service, level, and time range in $O(\log N)$ time, making periodic alert checks fast even with millions of logs.

### Q6: How does the agent track log files across restarts or log rotation?
**Answer:**
The agent tracks byte offsets (`currentOffset`). When new bytes are appended, it reads starting from the last offset. If the file size drops below `currentOffset`, the agent detects that the log file was truncated or rotated by the operating system, resets its offset to 0, and continues reading the new file cleanly without duplicate reads or crashes.

---

## 9. Folder Structure

```text
├── server/
│   ├── server.js               # Main HTTP & WebSocket server entry point
│   ├── db/
│   │   └── connection.js       # MongoDB Mongoose connection with error instructions
│   ├── models/
│   │   ├── Log.js              # Log schema, compound indexes & TTL expiration
│   │   ├── Node.js             # Distributed node cluster state & heartbeat schema
│   │   ├── AlertRule.js        # User-configured alert thresholds & conditions
│   │   └── AlertHistory.js     # Audit trail for fired alert incidents
│   ├── routes/
│   │   ├── logs.js             # POST /api/logs ingest & GET /api/logs search
│   │   ├── stats.js            # GET /api/stats/overview aggregation pipelines
│   │   ├── nodes.js            # GET /api/nodes cluster status & POST /heartbeat
│   │   ├── alerts.js           # CRUD for alert rules and audit history
│   │   └── export.js           # GET /api/export/csv streamed cursor export
│   ├── websocket/
│   │   └── ws.js               # WebSocket manager & real-time broadcasting
│   └── alerts/
│       └── engine.js           # Background worker evaluating threshold rules
├── agent/
│   ├── agent.js                # Distributed file-tailing agent with queue & retry
│   ├── parser.js               # JSON and plaintext log parser with fallbacks
│   └── config.json             # Agent default configuration
├── public/
│   ├── index.html              # Utilitarian engineering dashboard
│   ├── css/
│   │   └── style.css           # Dense terminal/Grafana aesthetics (Dark/Light)
│   └── js/
│       ├── vendor/
│       │   └── chart.umd.min.js# Vendored Chart.js for 100% offline operation
│       ├── api.js              # REST client wrapper
│       ├── ws.js               # WebSocket client with auto-reconnection
│       ├── overview.js         # KPIs, throughput chart, level distribution
│       ├── live-tail.js        # Streaming tail, pause/resume, auto-scroll
│       ├── search.js           # Keyword search with highlighting & pagination
│       ├── nodes.js            # Cluster nodes live health monitor
│       ├── alerts.js           # Rule builder modal & live notifications
│       └── app.js              # Router, theme toggle, and initialization
├── tools/
│   └── generate-logs.js        # Realistic microservice log generator
├── logs/                       # Sample log files tailed by agents
├── .env.example                # Template for environment variables
├── .env                        # Active environment variables
├── package.json                # Project dependencies and startup scripts
└── README.md                   # Complete documentation and viva guide
```

---

## 10. License
MIT License. Built for Distributed Systems academic project and portfolio presentation.
