/**
 * WebSocket Server Manager
 * Broadcasts ingested logs and fired alerts to active web dashboard clients in real-time.
 */
const { WebSocketServer, WebSocket } = require('ws');

let wss = null;

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;

    // Standard ping/pong heartbeat
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    // Send initial handshake
    ws.send(
      JSON.stringify({
        type: 'CONNECTION_ACK',
        message: 'Connected to Distributed Log Monitor WebSocket stream',
        timestamp: new Date().toISOString(),
      })
    );

    ws.on('error', (err) => {
      console.error('[WS] Client connection error:', err.message);
    });

    ws.on('close', () => {
      // Cleanly handled by ws set
    });
  });

  // Keep-alive heartbeat interval every 30 seconds
  const heartbeatInterval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  console.log('[WS] WebSocket server initialized on path /ws');
  return wss;
}

/**
 * Broadcast an array or single log entry to all connected clients
 */
function broadcastLogs(logs) {
  if (!wss || wss.clients.size === 0) return;

  const payload = JSON.stringify({
    type: 'LOGS',
    data: Array.isArray(logs) ? logs : [logs],
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('[WS] Failed to send log payload:', err.message);
      }
    }
  });
}

/**
 * Broadcast an alert notification to all connected clients
 */
function broadcastAlert(alert) {
  if (!wss || wss.clients.size === 0) return;

  const payload = JSON.stringify({
    type: 'ALERT',
    data: alert,
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch (err) {
        console.error('[WS] Failed to send alert payload:', err.message);
      }
    }
  });
}

function getConnectedClientsCount() {
  return wss ? wss.clients.size : 0;
}

module.exports = {
  initWebSocket,
  broadcastLogs,
  broadcastAlert,
  getConnectedClientsCount,
};
