/**
 * GoLogin Service - Headless Browser Automation
 *
 * Supports two modes:
 * 1. SDK Mode (recommended for Docker/production) - uses official gologin package
 * 2. API Mode (fallback) - direct HTTP calls when SDK unavailable
 *
 * SDK automatically downloads and manages Orbita browser in headless mode.
 */

const GOLOGIN_API = 'https://api.gologin.com';

// Try to load SDK, fallback to API mode if unavailable
let GoLoginSDK = null;
let sdkAvailable = false;

try {
  // Dynamic import to handle compatibility issues
  const module = await import('gologin');
  GoLoginSDK = module.default || module.GoLogin || module;
  sdkAvailable = true;
  console.log('GoLogin SDK loaded successfully');
} catch (error) {
  console.warn('GoLogin SDK not available, using API mode:', error.message);
  sdkAvailable = false;
}

export class GoLoginService {
  constructor(settings) {
    this.apiToken = settings.goLoginApiKey;
    this.useHeadless = process.env.GOLOGIN_HEADLESS === 'true' || settings.goLoginHeadless;

    if (!this.apiToken) {
      throw new Error('GoLogin API token not configured. Set goLoginApiKey in settings.');
    }
  }

  /**
   * Check if SDK mode is available
   */
  isSDKAvailable() {
    return sdkAvailable && GoLoginSDK;
  }

  /**
   * Make API request to GoLogin (fallback mode)
   */
  async apiRequest(endpoint, options = {}) {
    const url = `${GOLOGIN_API}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // Handle various error formats from GoLogin API
      let errorMessage = `GoLogin API error: ${response.status}`;

      if (errorData.message) {
        errorMessage = errorData.message;
      } else if (errorData.error) {
        errorMessage = typeof errorData.error === 'string'
          ? errorData.error
          : JSON.stringify(errorData.error);
      } else if (Array.isArray(errorData)) {
        errorMessage = errorData.map(e => e.message || JSON.stringify(e)).join('; ');
      } else if (typeof errorData === 'object' && Object.keys(errorData).length > 0) {
        errorMessage = JSON.stringify(errorData);
      }

      console.error('GoLogin API Error:', errorMessage, errorData);
      throw new Error(errorMessage);
    }

    // Handle empty responses (e.g., DELETE returns 204 No Content or empty body)
    const contentType = response.headers.get('content-type');
    if (response.status === 204 || !contentType || !contentType.includes('application/json')) {
      return {};
    }

    const text = await response.text();
    if (!text || text.trim() === '') {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      console.warn('Failed to parse response as JSON:', text.substring(0, 100));
      return {};
    }
  }

  /**
   * Create a new browser profile with proxy
   * @param {object} proxy - Proxy config { mode, host, port, username, password }
   * @param {string} name - Profile name
   * @returns {Promise<string>} - Profile ID
   */
  async createProfile(proxy, name = `account_${Date.now()}`) {
    // Minimal profile config - GoLogin API is strict about field formats
    const profileConfig = {
      name,
      browserType: 'chrome',
      os: 'lin',
      navigator: {
        language: 'en-US',
        platform: 'Linux x86_64',
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        resolution: '1920x1080'
      },
      proxy: {
        mode: proxy.mode || 'socks5',
        host: proxy.host,
        port: parseInt(proxy.port) || 80,
        username: proxy.username || '',
        password: proxy.password || ''
      }
    };

    try {
      const profile = await this.apiRequest('/browser', {
        method: 'POST',
        body: JSON.stringify(profileConfig)
      });

      console.log(`GoLogin profile created: ${profile.id}`);
      return profile.id;

    } catch (error) {
      console.error('Failed to create GoLogin profile:', error.message);
      throw new Error(`Failed to create GoLogin profile: ${error.message}`);
    }
  }

  /**
   * Start a browser profile and get browser instance
   * Priority depends on environment:
   * - Local (GOLOGIN_HEADLESS=false): SDK first (uses GoLogin Desktop)
   * - Server/Docker (GOLOGIN_HEADLESS=true): Cloud Browser first
   * @param {string} profileId - Profile ID
   * @returns {Promise<object>} - { browser, wsUrl, GL, profileId }
   */
  async startProfile(profileId) {
    // Check if running in local mode (with GoLogin Desktop)
    const isLocalMode = process.env.GOLOGIN_HEADLESS === 'false' || !this.useHeadless;

    if (isLocalMode) {
      // LOCAL MODE: Try SDK first (GoLogin Desktop provides Orbita)
      console.log('Running in local mode - trying SDK with GoLogin Desktop...');

      if (this.isSDKAvailable()) {
        try {
          return await this.startProfileSDK(profileId);
        } catch (error) {
          console.warn('SDK mode failed:', error.message);
        }
      }

      // Fallback to Cloud Browser
      try {
        return await this.startProfileCloud(profileId);
      } catch (error) {
        console.warn('Cloud Browser mode failed:', error.message);
      }
    } else {
      // SERVER MODE: Try Cloud Browser first (no local Orbita available)
      console.log('Running in server mode - trying Cloud Browser...');

      try {
        return await this.startProfileCloud(profileId);
      } catch (error) {
        console.warn('Cloud Browser mode failed:', error.message);
      }

      // Fallback to SDK (if Orbita somehow available)
      if (this.isSDKAvailable()) {
        try {
          return await this.startProfileSDK(profileId);
        } catch (error) {
          console.warn('SDK mode failed:', error.message);
        }
      }
    }

    // Last resort: API mode (requires GoLogin Desktop running)
    return await this.startProfileAPI(profileId);
  }

  /**
   * Start profile using GoLogin Cloud Browser
   * This runs the browser in GoLogin's cloud - works in Docker!
   */
  async startProfileCloud(profileId) {
    console.log(`Starting GoLogin profile (Cloud Browser mode): ${profileId}`);

    // First, start the cloud browser session via API
    try {
      const startResult = await this.apiRequest(`/browser/${profileId}/web`, {
        method: 'POST',
        body: JSON.stringify({})
      });
      console.log(`Cloud browser session started:`, startResult.status || 'OK');
    } catch (error) {
      // Some accounts don't support /web endpoint, try direct connection
      console.log(`Cloud browser API start failed (${error.message}), trying direct WebSocket...`);
    }

    // GoLogin Cloud Browser WebSocket endpoint
    const wsUrl = `wss://cloudbrowser.gologin.com/connect?token=${this.apiToken}&profile=${profileId}`;

    console.log(`GoLogin Cloud Browser URL generated for profile: ${profileId}`);

    return {
      wsUrl,
      GL: null,
      profileId,
      mode: 'cloud'
    };
  }

  /**
   * Start profile using SDK (headless Orbita)
   */
  async startProfileSDK(profileId) {
    console.log(`Starting GoLogin profile (SDK mode): ${profileId}`);

    const extraParams = this.useHeadless ? ['--headless=new'] : [];

    const GL = new GoLoginSDK({
      token: this.apiToken,
      profile_id: profileId,
      extra_params: extraParams
    });

    const { status, wsUrl } = await GL.start();

    if (!wsUrl) {
      throw new Error(`Failed to start profile: ${status || 'no wsUrl returned'}`);
    }

    console.log(`GoLogin profile started (SDK): ${profileId}`);

    return {
      wsUrl,
      GL,
      profileId,
      mode: 'sdk'
    };
  }

  /**
   * Start profile using API (requires GoLogin Desktop)
   */
  async startProfileAPI(profileId) {
    console.log(`Starting GoLogin profile (API mode): ${profileId}`);

    const startResult = await this.apiRequest(`/browser/${profileId}/start`, {
      method: 'POST'
    });

    const wsUrl = startResult.wsUrl || startResult.ws;

    if (!wsUrl) {
      throw new Error('WebSocket URL not returned. In API mode, GoLogin Desktop must be running.');
    }

    console.log(`GoLogin profile started (API): ${profileId}`);

    return {
      wsUrl,
      GL: null,
      profileId,
      mode: 'api'
    };
  }

  /**
   * Stop a running profile
   * @param {object} GL - GoLogin SDK instance (or null for API/Cloud mode)
   * @param {string} profileId - Profile ID
   * @param {string} mode - Profile mode ('sdk', 'cloud', 'api')
   */
  async stopProfile(GL, profileId, mode = 'api') {
    try {
      if (GL && typeof GL.stop === 'function') {
        // SDK mode - stop local Orbita
        await GL.stop();
        console.log(`GoLogin profile stopped (SDK): ${profileId}`);
      } else if (mode === 'cloud') {
        // Cloud mode - browser session ends when puppeteer disconnects
        // No explicit stop needed, but we log it
        console.log(`GoLogin Cloud Browser session ended: ${profileId}`);
      } else if (profileId) {
        // API mode - try to stop via API (may fail if desktop not running)
        try {
          await this.apiRequest(`/browser/${profileId}/stop`, {
            method: 'POST'
          });
          console.log(`GoLogin profile stopped (API): ${profileId}`);
        } catch (apiError) {
          // API stop may fail for cloud profiles - that's OK
          console.log(`Profile stop via API skipped (normal for cloud mode): ${profileId}`);
        }
      }
    } catch (error) {
      console.warn('Failed to stop GoLogin profile:', error.message);
    }
  }

  /**
   * Delete a browser profile
   * @param {string} profileId - Profile ID
   */
  async deleteProfile(profileId) {
    try {
      await this.apiRequest(`/browser/${profileId}`, {
        method: 'DELETE'
      });
      console.log(`GoLogin profile deleted: ${profileId}`);
    } catch (error) {
      console.warn('Failed to delete GoLogin profile:', error.message);
    }
  }

  /**
   * List all browser profiles
   * @returns {Promise<Array>} - List of profiles
   */
  async listProfiles() {
    try {
      const result = await this.apiRequest('/browser/v2');
      return result.profiles || [];
    } catch (error) {
      console.warn('Failed to list profiles:', error.message);
      return [];
    }
  }

  /**
   * Get active cloud browser sessions
   * @returns {Promise<Array>} - List of active sessions
   */
  async getActiveCloudSessions() {
    try {
      const result = await this.apiRequest('/browser/web');
      return result.sessions || result || [];
    } catch (error) {
      console.warn('Failed to get active sessions:', error.message);
      return [];
    }
  }

  /**
   * Stop a cloud browser session by profile ID
   * @param {string} profileId - Profile ID
   */
  async stopCloudSession(profileId) {
    try {
      await this.apiRequest(`/browser/${profileId}/web`, {
        method: 'DELETE'
      });
      console.log(`Cloud session stopped: ${profileId}`);
      return true;
    } catch (error) {
      console.warn(`Failed to stop cloud session ${profileId}:`, error.message);
      return false;
    }
  }

  /**
   * Cleanup all orphaned cloud sessions and temporary profiles
   * @returns {Promise<object>} - Cleanup results
   */
  async cleanupOrphanedSessions() {
    console.log('Cleaning up orphaned GoLogin sessions...');
    const results = { sessionsStoped: 0, profilesDeleted: 0, errors: [] };

    // 1. Stop any active cloud sessions
    try {
      const profiles = await this.listProfiles();
      for (const profile of profiles) {
        // Try to stop cloud session (in case it's running)
        if (profile.name && profile.name.startsWith('account_')) {
          try {
            await this.stopCloudSession(profile.id);
            results.sessionsStoped++;
          } catch (e) {
            // Session might not be running
          }

          // Delete temporary profiles
          try {
            await this.deleteProfile(profile.id);
            results.profilesDeleted++;
          } catch (e) {
            results.errors.push(`Failed to delete ${profile.id}: ${e.message}`);
          }
        }
      }
    } catch (error) {
      results.errors.push(`Cleanup error: ${error.message}`);
    }

    console.log(`Cleanup complete: ${results.sessionsStoped} sessions stopped, ${results.profilesDeleted} profiles deleted`);
    return results;
  }

  /**
   * Get profile info
   */
  async getProfile(profileId) {
    return this.apiRequest(`/browser/${profileId}`);
  }

  /**
   * List all profiles
   */
  async listProfiles() {
    try {
      const data = await this.apiRequest('/browser/v2');
      return data.profiles || data || [];
    } catch (error) {
      console.error('Failed to list profiles:', error.message);
      throw new Error(`Failed to list profiles: ${error.message}`);
    }
  }

  /**
   * Delete all profiles (cleanup utility)
   * @returns {Promise<{deleted: number, failed: number}>}
   */
  async deleteAllProfiles() {
    const profiles = await this.listProfiles();
    let deleted = 0;
    let failed = 0;

    console.log(`Found ${profiles.length} profiles to delete...`);

    for (const profile of profiles) {
      try {
        await this.deleteProfile(profile.id);
        deleted++;
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch (error) {
        console.warn(`Failed to delete profile ${profile.id}: ${error.message}`);
        failed++;
      }
    }

    console.log(`Cleanup complete: ${deleted} deleted, ${failed} failed`);
    return { deleted, failed };
  }

  /**
   * Test API connection
   */
  async testConnection() {
    try {
      const profiles = await this.listProfiles();
      return {
        success: true,
        message: `GoLogin API connected (${this.isSDKAvailable() ? 'SDK' : 'API'} mode)`,
        profileCount: profiles.length,
        sdkAvailable: this.isSDKAvailable(),
        headless: this.useHeadless
      };
    } catch (error) {
      return {
        success: false,
        message: error.message,
        sdkAvailable: this.isSDKAvailable()
      };
    }
  }
}

// Singleton factory
let goLoginServiceInstance = null;

export function getGoLoginService(settings) {
  if (!settings.goLoginApiKey) {
    throw new Error('GoLogin API not configured. Set goLoginApiKey in settings.');
  }

  if (!goLoginServiceInstance || goLoginServiceInstance.apiToken !== settings.goLoginApiKey) {
    goLoginServiceInstance = new GoLoginService(settings);
  }

  return goLoginServiceInstance;
}

export default GoLoginService;
