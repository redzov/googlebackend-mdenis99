/**
 * Proxy Service - интеграция с Webshare Rotating Proxy
 *
 * Использует статический rotating proxy - каждый запрос автоматически получает новый IP
 */

import proxyChain from 'proxy-chain';

export class ProxyService {
  constructor(settings) {
    // Webshare Rotating Proxy settings
    this.host = settings.proxyHost || 'p.webshare.io';
    this.port = settings.proxyPort || 80;
    this.username = settings.proxyUsername;
    this.password = settings.proxyPassword;
    this.protocol = settings.proxyProtocol || 'socks5';

    // Legacy API settings (for backwards compatibility)
    this.apiKey = settings.proxyApiKey;
    this.apiUrl = settings.proxyApiUrl || 'https://api.proxy-seller.com';

    // Track local proxy servers for cleanup
    this._localProxyUrls = [];
  }

  /**
   * Check if Webshare proxy is configured
   * @returns {boolean}
   */
  isWebshareConfigured() {
    return !!(this.host && this.username && this.password);
  }

  /**
   * Get Webshare rotating proxy config for GoLogin
   * @returns {object} - Proxy config in GoLogin format { mode, host, port, username, password }
   */
  getRotatingProxy() {
    if (!this.isWebshareConfigured()) {
      throw new Error('Webshare proxy not configured. Set proxyHost, proxyUsername, proxyPassword in settings.');
    }

    return {
      mode: this.protocol,
      host: this.host,
      port: this.port,
      username: this.username,
      password: this.password
    };
  }

  /**
   * Get Webshare proxy as URL string
   * @returns {string} - Proxy URL like socks5://user:pass@host:port
   */
  getRotatingProxyUrl() {
    if (!this.isWebshareConfigured()) {
      throw new Error('Webshare proxy not configured');
    }

    return `${this.protocol}://${this.username}:${this.password}@${this.host}:${this.port}`;
  }

  /**
   * Get Webshare proxy with sticky session (same IP for all requests with same session ID)
   * Webshare sticky sessions: append -sessid-XXX to username
   * @param {string} [sessionId] - Session ID. Auto-generated if not provided.
   * @returns {object} - GoLogin format { mode, host, port, username, password, sessionId }
   */
  getStickyProxy(sessionId = null) {
    if (!this.isWebshareConfigured()) {
      throw new Error('Webshare proxy not configured');
    }

    const sid = sessionId || Math.random().toString(36).substring(2, 10);
    const stickyUsername = `${this.username}-sessid-${sid}`;

    return {
      mode: this.protocol,
      host: this.host,
      port: this.port,
      username: stickyUsername,
      password: this.password,
      sessionId: sid
    };
  }

  /**
   * Get Webshare sticky proxy as URL string
   * @param {string} [sessionId] - Session ID. Auto-generated if not provided.
   * @returns {{ url: string, sessionId: string }}
   */
  getStickyProxyUrl(sessionId = null) {
    const config = this.getStickyProxy(sessionId);
    return {
      url: `${config.mode}://${config.username}:${config.password}@${config.host}:${config.port}`,
      sessionId: config.sessionId
    };
  }

  /**
   * Create a local anonymous proxy that forwards through authenticated upstream proxy.
   * Use this for browsers (Puppeteer/Chrome) that can't handle proxy authentication
   * with extended usernames (e.g. sticky sessions).
   *
   * @param {string} upstreamProxyUrl - Upstream proxy URL with auth (e.g., http://user:pass@host:port)
   * @returns {Promise<string>} - Local proxy URL (e.g., http://127.0.0.1:54321) - no auth needed
   */
  async createAnonymizedProxy(upstreamProxyUrl) {
    const localUrl = await proxyChain.anonymizeProxy(upstreamProxyUrl);
    this._localProxyUrls.push(localUrl);
    console.log(`Local proxy forwarder started: ${localUrl} -> ${upstreamProxyUrl.split('@')[1] || upstreamProxyUrl}`);
    return localUrl;
  }

  /**
   * Close all local proxy forwarders
   */
  async closeAnonymizedProxies() {
    for (const url of this._localProxyUrls) {
      try {
        await proxyChain.closeAnonymizedProxy(url, true);
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
    this._localProxyUrls = [];
  }

  /**
   * Получить новый прокси
   * @param {object} options - Опции запроса
   * @param {string} options.country - Страна (US, UK, DE и т.д.)
   * @param {string} options.type - Тип прокси (residential, datacenter)
   * @returns {Promise<string>} - Прокси в формате http://user:pass@ip:port
   */
  async getProxy(options = {}) {
    const {
      country = 'US',
      type = 'residential',
      session = 'new'
    } = options;

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/proxy/get`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          country,
          type,
          session
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Proxy API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.proxy) {
        throw new Error('Proxy not returned from API');
      }

      return data.proxy;

    } catch (error) {
      console.error('Failed to get proxy:', error.message);
      throw new Error(`Failed to get proxy: ${error.message}`);
    }
  }

  /**
   * Проверить баланс прокси-сервиса
   * @returns {Promise<object>} - Информация о балансе
   */
  async getBalance() {
    try {
      const response = await fetch(`${this.apiUrl}/api/v1/balance`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `Proxy API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        balance: data.balance || 0,
        currency: data.currency || 'USD',
        trafficRemaining: data.traffic_remaining_gb || data.trafficRemaining || 0
      };

    } catch (error) {
      console.error('Failed to get proxy balance:', error.message);
      throw new Error(`Failed to get proxy balance: ${error.message}`);
    }
  }

  /**
   * Проверить работоспособность прокси
   * @param {string} proxy - Прокси в формате http://user:pass@ip:port
   * @returns {Promise<boolean>} - true если прокси работает
   */
  async testProxy(proxy) {
    try {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      const proxyAgent = new HttpsProxyAgent(proxy);

      const response = await fetch('https://api.ipify.org?format=json', {
        agent: proxyAgent,
        timeout: 10000
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return !!data.ip;

    } catch (error) {
      console.error('Proxy test failed:', error.message);
      return false;
    }
  }

  /**
   * Парсить прокси строку в компоненты
   * @param {string} proxy - Прокси строка
   * @returns {object} - { host, port, username, password }
   */
  static parseProxy(proxy) {
    try {
      const url = new URL(proxy);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 8080,
        username: url.username || '',
        password: url.password || '',
        protocol: url.protocol.replace(':', '')
      };
    } catch (error) {
      // Попробуем парсить как host:port:user:pass
      const parts = proxy.split(':');
      if (parts.length >= 2) {
        return {
          host: parts[0],
          port: parseInt(parts[1]) || 8080,
          username: parts[2] || '',
          password: parts[3] || '',
          protocol: 'http'
        };
      }
      throw new Error('Invalid proxy format');
    }
  }
}

// Singleton factory
let proxyServiceInstance = null;

export function getProxyService(settings) {
  // Check for Webshare config first (new method)
  const hasWebshare = settings.proxyHost && settings.proxyUsername && settings.proxyPassword;
  // Fallback to legacy API config
  const hasLegacyApi = settings.proxyApiKey && settings.proxyApiUrl;

  if (!hasWebshare && !hasLegacyApi) {
    throw new Error('Proxy not configured. Set Webshare credentials (proxyHost, proxyUsername, proxyPassword) or legacy API (proxyApiKey, proxyApiUrl) in settings.');
  }

  // Create new instance if settings changed
  const settingsKey = `${settings.proxyHost}:${settings.proxyUsername}:${settings.proxyApiKey}`;
  if (!proxyServiceInstance || proxyServiceInstance._settingsKey !== settingsKey) {
    proxyServiceInstance = new ProxyService(settings);
    proxyServiceInstance._settingsKey = settingsKey;
  }

  return proxyServiceInstance;
}

export default ProxyService;
