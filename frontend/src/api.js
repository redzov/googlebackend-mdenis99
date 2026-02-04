// API Client for Google Workspace Admin
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('auth_token', token);
    } else {
      localStorage.removeItem('auth_token');
    }
  }

  getToken() {
    return this.token || localStorage.getItem('auth_token');
  }

  async request(endpoint, options = {}) {
    // All admin routes have /api prefix
    const url = `${API_BASE}/api${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.getToken()) {
      headers['Authorization'] = `Bearer ${this.getToken()}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    // Handle 401 - redirect to login
    if (response.status === 401) {
      this.setToken(null);
      window.dispatchEvent(new CustomEvent('auth:logout'));
      throw new Error('Unauthorized');
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP ${response.status}`);
    }

    return data;
  }

  // ==================== AUTH ====================
  async login(username, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async verify() {
    return this.request('/auth/verify');
  }

  async changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  logout() {
    this.setToken(null);
  }

  // ==================== KEYS ====================
  async getKeys(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/keys${query ? `?${query}` : ''}`);
  }

  async getKey(id) {
    return this.request(`/keys/${id}`);
  }

  async createKey(data) {
    return this.request('/keys', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateKey(id, data) {
    return this.request(`/keys/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteKey(id) {
    return this.request(`/keys/${id}`, {
      method: 'DELETE',
    });
  }

  async downloadKeyAccounts(id) {
    const url = `${API_BASE}/api/keys/${id}/download`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.getToken()}` },
    });
    if (!response.ok) throw new Error('Download failed');
    return response.text();
  }

  // ==================== ACCOUNTS ====================
  async getAccounts(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/accounts${query ? `?${query}` : ''}`);
  }

  async getAccount(id) {
    return this.request(`/accounts/${id}`);
  }

  async updateAccountStatus(id, status) {
    return this.request(`/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  async deleteAccount(id) {
    return this.request(`/accounts/${id}`, {
      method: 'DELETE',
    });
  }

  async downloadAccounts(params = {}) {
    const query = new URLSearchParams({ ...params, format: 'txt' }).toString();
    const url = `${API_BASE}/api/accounts/download?${query}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.getToken()}` },
    });
    if (!response.ok) throw new Error('Download failed');
    return response.text();
  }

  async getAccountStats() {
    return this.request('/accounts/stats');
  }

  // ==================== WORKSPACES ====================
  async getWorkspaces(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/workspaces${query ? `?${query}` : ''}`);
  }

  async getWorkspacesSimple() {
    return this.request('/workspaces/list/simple');
  }

  async getWorkspace(id) {
    return this.request(`/workspaces/${id}`);
  }

  async createWorkspace(data) {
    return this.request('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWorkspace(id, data) {
    return this.request(`/workspaces/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteWorkspace(id) {
    return this.request(`/workspaces/${id}`, {
      method: 'DELETE',
    });
  }

  // ==================== RECOVERY EMAILS ====================
  async getRecoveryEmails(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/recovery-emails${query ? `?${query}` : ''}`);
  }

  async getRecoveryEmailsSimple() {
    return this.request('/recovery-emails/list/simple');
  }

  async createRecoveryEmail(data) {
    return this.request('/recovery-emails', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRecoveryEmail(id, data) {
    return this.request(`/recovery-emails/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteRecoveryEmail(id) {
    return this.request(`/recovery-emails/${id}`, {
      method: 'DELETE',
    });
  }

  async testRecoveryEmail(id) {
    return this.request(`/recovery-emails/${id}/test`, {
      method: 'POST',
    });
  }

  // ==================== SETTINGS ====================
  async getSettings() {
    return this.request('/settings');
  }

  async updateSettings(data) {
    return this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async testGoLogin() {
    return this.request('/settings/test-gologin', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async testProxy() {
    return this.request('/settings/test-proxy', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // ==================== API LOGS ====================
  async getApiLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/logs${query ? `?${query}` : ''}`);
  }

  async downloadApiLogs(params = {}) {
    const query = new URLSearchParams({ ...params, format: 'json' }).toString();
    const url = `${API_BASE}/api/logs/download?${query}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.getToken()}` },
    });
    if (!response.ok) throw new Error('Download failed');
    return response.text();
  }

  async getApiLogEndpoints() {
    return this.request('/logs/endpoints');
  }

  async getApiLogStatuses() {
    return this.request('/logs/statuses');
  }

  // ==================== STATS ====================
  async getStats() {
    return this.request('/stats');
  }

  // ==================== MANUAL CREATION ====================
  async manualCreate(workspaceId, count) {
    return this.request('/manual/create', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, count }),
    });
  }

  async manualProgress() {
    return this.request('/manual/progress');
  }

  async manualStop() {
    return this.request('/manual/stop', {
      method: 'POST',
    });
  }

  async manualRecent(limit = 100) {
    return this.request(`/manual/recent?limit=${limit}`);
  }

  async manualDownload(limit = 1000, workspaceId = null) {
    const params = { limit };
    if (workspaceId) params.workspaceId = workspaceId;
    const query = new URLSearchParams(params).toString();
    const url = `${API_BASE}/api/manual/download?${query}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.getToken()}` },
    });
    if (!response.ok) throw new Error('Download failed');
    return response.text();
  }

  async manualDemo(workspaceId, count) {
    return this.request('/manual/demo', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, count }),
    });
  }

  // ==================== CREATION LOGS ====================
  async getCreationLogs(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/creation-logs${query ? `?${query}` : ''}`);
  }

  async getCreationLog(id) {
    return this.request(`/creation-logs/${id}`);
  }

  async getCreationLogStats() {
    return this.request('/creation-logs/stats/summary');
  }

  async getCreationLogStatuses() {
    return this.request('/creation-logs/statuses');
  }

  async cleanupCreationLogs() {
    return this.request('/creation-logs/cleanup', {
      method: 'DELETE',
    });
  }

  // ==================== MANUAL STATUS ====================
  async getManualStatus() {
    return this.request('/manual/status');
  }

  // ==================== WORKSPACE PING ====================
  async pingWorkspace(id) {
    const url = `${API_BASE}/api/workspaces/${id}/ping`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.getToken()}`,
      },
    });
    return response.json();
  }
}

export const api = new ApiClient();
export default api;
