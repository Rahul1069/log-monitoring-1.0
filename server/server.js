/**
 * Distributed Log Monitoring System - Main Server
 * Initializes Express, WebSocket Server, MongoDB connection, and Alert Evaluator.
 */
require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');

const { connectDB } = require('./db/connection');
const { initWebSocket } = require('./websocket/ws');
const { startAlertEngine, stopAlertEngine } = require('./alerts/engine');

// Route handlers
const logsRouter = require('./routes/logs');
const statsRouter = require('./routes/stats');
const nodesRouter = require('./routes/nodes');
const alertsRouter = require('./routes/alerts');
const exportRouter = require('./routes/export');

async function bootstrap() {
  // 1. Connect to MongoDB
  await connectDB();

  // 2. Initialize Express application
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Middlewares
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Serve static UI assets from public directory
  const publicPath = path.join(__dirname, '..', 'public');
  app.use(express.static(publicPath));

  // Mount API endpoints
  app.use('/api/logs', logsRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/nodes', nodesRouter);
  app.use('/api/alerts', alertsRouter);
  app.use('/api/export', exportRouter);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      node: process.version,
    });
  });

  // Fallback to index.html for SPA client-side routing
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // 3. Create HTTP server and bind WebSocket
  const server = http.createServer(app);
  initWebSocket(server);

  // 4. Start background alert engine
  startAlertEngine();

  // Handle port in use or server errors
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[SERVER ERROR] Port ${PORT} is already in use by another process!`);
      console.error(`Please update PORT in your .env file (e.g. PORT=5001) and restart.\n`);
    } else {
      console.error('[SERVER ERROR]', err.message);
    }
    process.exit(1);
  });

  // 5. Start listening
  server.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log(`[SERVER] Distributed Log Monitoring System active!`);
    console.log(`[SERVER] Web Dashboard:    http://localhost:${PORT}`);
    console.log(`[SERVER] Ingestion API:     http://localhost:${PORT}/api/logs`);
    console.log(`[SERVER] WebSocket Stream:  ws://localhost:${PORT}/ws`);
    console.log(`[SERVER] Environment:       ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(60) + '\n');
  });

  // Handle graceful process termination
  const shutdown = async () => {
    console.log('\n[SERVER] Shutting down gracefully...');
    stopAlertEngine();
    server.close(() => {
      console.log('[SERVER] HTTP & WebSocket servers closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[FATAL STARTUP ERROR]', err);
  process.exit(1);
});
