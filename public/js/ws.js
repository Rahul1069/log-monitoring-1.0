/**
 * Real-time WebSocket Client Manager
 * Handles auto-reconnect, status indicators, and event routing.
 */
class WebSocketManager {
  constructor() {
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectDelay = 1000;
    this.listeners = {
      logs: [],
      alert: [],
    };

    this.dotEl = document.getElementById('ws-status-dot');
    this.textEl = document.getElementById('ws-status-text');
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.setStatus('reconnecting', 'Connecting...');

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setStatus('online', 'Connected');
        this.reconnectDelay = 1000;
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleMessage(payload);
        } catch (e) {
          console.error('[WS Client] Failed parsing JSON:', e);
        }
      };

      this.ws.onclose = () => {
        this.setStatus('offline', 'Disconnected');
        this.scheduleReconnect();
      };

      this.ws.onerror = () => {
        this.setStatus('reconnecting', 'Reconnecting...');
        this.ws.close();
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.setStatus('reconnecting', `Reconnecting (${(this.reconnectDelay / 1000).toFixed(0)}s)...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(10000, this.reconnectDelay * 1.5);
      this.connect();
    }, this.reconnectDelay);
  }

  setStatus(state, text) {
    if (this.dotEl) {
      this.dotEl.className = `status-dot ${state}`;
    }
    if (this.textEl) {
      this.textEl.textContent = text;
    }
  }

  onLogs(callback) {
    this.listeners.logs.push(callback);
  }

  onAlert(callback) {
    this.listeners.alert.push(callback);
  }

  handleMessage(msg) {
    if (msg.type === 'LOGS' && Array.isArray(msg.data)) {
      this.listeners.logs.forEach((cb) => cb(msg.data));
    } else if (msg.type === 'ALERT' && msg.data) {
      this.listeners.alert.forEach((cb) => cb(msg.data));
    }
  }
}

const wsClient = new WebSocketManager();
