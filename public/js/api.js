/**
 * REST API Client Helpers
 */
const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async put(url, data = {}) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  async delete(url) {
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || err.message || `HTTP ${res.status}`);
    }
    return res.json();
  },

  // Specialized endpoints
  getStats: (range = '30m') => API.get(`/api/stats/overview?range=${range}`),
  searchLogs: (params) => {
    const qs = new URLSearchParams(params).toString();
    return API.get(`/api/logs?${qs}`);
  },
  getFilterMetadata: () => API.get('/api/logs/metadata'),
  getNodes: () => API.get('/api/nodes'),
  getAlertRules: () => API.get('/api/alerts/rules'),
  createAlertRule: (rule) => API.post('/api/alerts/rules', rule),
  toggleAlertRule: (id) => API.put(`/api/alerts/rules/${id}/toggle`),
  deleteAlertRule: (id) => API.delete(`/api/alerts/rules/${id}`),
  getAlertHistory: () => API.get('/api/alerts/history'),
  triggerAlertCheck: () => API.post('/api/alerts/check', {}),
};
