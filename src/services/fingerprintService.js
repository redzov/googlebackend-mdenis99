/**
 * Fingerprint Service - интеграция с GoLogin API
 *
 * Создает уникальные браузерные профили с fingerprint и прокси
 */

import { ProxyService } from './proxyService.js';

export class FingerprintService {
  constructor(apiKey, apiUrl) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://api.gologin.com';
  }

  /**
   * Создать новый браузерный профиль
   * @param {string} proxy - Прокси в формате http://user:pass@ip:port
   * @param {object} options - Дополнительные опции
   * @returns {Promise<string>} - ID созданного профиля
   */
  async createProfile(proxy, options = {}) {
    const {
      name = `account_${Date.now()}`,
      os = 'win',
      language = 'en-US'
    } = options;

    try {
      // Парсим прокси
      const proxyConfig = ProxyService.parseProxy(proxy);

      const profileConfig = {
        name,
        os,
        navigator: {
          language,
          platform: os === 'win' ? 'Win32' : os === 'mac' ? 'MacIntel' : 'Linux x86_64',
          userAgent: 'random'
        },
        proxy: {
          mode: proxyConfig.protocol || 'http',
          host: proxyConfig.host,
          port: proxyConfig.port,
          username: proxyConfig.username,
          password: proxyConfig.password
        },
        webRTC: {
          mode: 'alerted',
          enabled: true
        },
        canvas: {
          mode: 'noise'
        },
        webGL: {
          mode: 'noise'
        },
        timezone: {
          enabled: true,
          fillBasedOnIp: true
        },
        geolocation: {
          mode: 'prompt',
          enabled: true,
          fillBasedOnIp: true
        },
        fonts: {
          enableMasking: true,
          enableDomRect: true
        },
        audioContext: {
          mode: 'noise'
        },
        mediaDevices: {
          enableMasking: true
        }
      };

      const response = await fetch(`${this.apiUrl}/browser`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profileConfig)
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `GoLogin API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.id) {
        throw new Error('Profile ID not returned from API');
      }

      return data.id;

    } catch (error) {
      console.error('Failed to create browser profile:', error.message);
      throw new Error(`Failed to create browser profile: ${error.message}`);
    }
  }

  /**
   * Запустить браузерный профиль
   * @param {string} profileId - ID профиля
   * @returns {Promise<object>} - { wsEndpoint, profileId }
   */
  async startProfile(profileId) {
    try {
      const response = await fetch(`${this.apiUrl}/browser/${profileId}/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `GoLogin API error: ${response.status}`);
      }

      const data = await response.json();

      if (!data.wsEndpoint) {
        throw new Error('WebSocket endpoint not returned');
      }

      return {
        wsEndpoint: data.wsEndpoint,
        profileId
      };

    } catch (error) {
      console.error('Failed to start browser profile:', error.message);
      throw new Error(`Failed to start browser profile: ${error.message}`);
    }
  }

  /**
   * Остановить браузерный профиль
   * @param {string} profileId - ID профиля
   */
  async stopProfile(profileId) {
    try {
      const response = await fetch(`${this.apiUrl}/browser/${profileId}/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.warn(`Failed to stop profile ${profileId}:`, error.message);
      }

    } catch (error) {
      console.warn('Failed to stop browser profile:', error.message);
    }
  }

  /**
   * Удалить браузерный профиль
   * @param {string} profileId - ID профиля
   */
  async deleteProfile(profileId) {
    try {
      const response = await fetch(`${this.apiUrl}/browser/${profileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.warn(`Failed to delete profile ${profileId}:`, error.message);
      }

    } catch (error) {
      console.warn('Failed to delete browser profile:', error.message);
    }
  }

  /**
   * Получить информацию о профиле
   * @param {string} profileId - ID профиля
   * @returns {Promise<object>} - Информация о профиле
   */
  async getProfile(profileId) {
    try {
      const response = await fetch(`${this.apiUrl}/browser/${profileId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `GoLogin API error: ${response.status}`);
      }

      return response.json();

    } catch (error) {
      console.error('Failed to get profile:', error.message);
      throw new Error(`Failed to get profile: ${error.message}`);
    }
  }

  /**
   * Получить список всех профилей
   * @returns {Promise<array>} - Список профилей
   */
  async listProfiles() {
    try {
      const response = await fetch(`${this.apiUrl}/browser`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `GoLogin API error: ${response.status}`);
      }

      const data = await response.json();
      return data.profiles || data || [];

    } catch (error) {
      console.error('Failed to list profiles:', error.message);
      throw new Error(`Failed to list profiles: ${error.message}`);
    }
  }
}

// Singleton factory
let fingerprintServiceInstance = null;

export function getFingerprintService(settings) {
  if (!settings.fingerprintApiKey || !settings.fingerprintApiUrl) {
    throw new Error('Fingerprint API not configured. Set fingerprintApiKey and fingerprintApiUrl in settings.');
  }

  if (!fingerprintServiceInstance ||
      fingerprintServiceInstance.apiKey !== settings.fingerprintApiKey ||
      fingerprintServiceInstance.apiUrl !== settings.fingerprintApiUrl) {
    fingerprintServiceInstance = new FingerprintService(settings.fingerprintApiKey, settings.fingerprintApiUrl);
  }

  return fingerprintServiceInstance;
}

export default FingerprintService;
