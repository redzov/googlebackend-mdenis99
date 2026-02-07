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
    // Environment variable takes precedence over settings
    // GOLOGIN_HEADLESS=false disables headless even if settings.goLoginHeadless is true
    if (process.env.GOLOGIN_HEADLESS !== undefined) {
      this.useHeadless = process.env.GOLOGIN_HEADLESS === 'true';
    } else {
      this.useHeadless = settings.goLoginHeadless ?? true;
    }

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
   * @param {object} proxy - Proxy config { mode, host, port, username, password, countryCode }
   * @param {string} name - Profile name
   * @returns {Promise<string>} - Profile ID
   */
  async createProfile(proxy, name = `account_${Date.now()}`) {
    // Common resolutions for residential users
    const resolutions = ['1920x1080', '1366x768', '1536x864', '1440x900', '1600x900'];
    const resolution = resolutions[Math.floor(Math.random() * resolutions.length)];

    // IMPORTANT: fillBasedOnIp is INCOMPATIBLE with rotating proxy!
    // Each proxy request gets a different IP, so GoLogin's IP check during startup
    // may get Italian IP → sets lang=it-IT, then browser actually uses US IP → MISMATCH.
    // Solution: set ALL values explicitly for US English speaker (45/100 IPs are US).
    const browserLanguage = 'en-US,en;q=0.9';

    // Random US timezone from common ones
    const usTimezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
    const timezone = usTimezones[Math.floor(Math.random() * usTimezones.length)];

    const profileConfig = {
      name,
      browserType: 'chrome',
      // Windows — residential proxy users are home users, not Linux servers
      os: 'win',
      // Prevent SDK from overriding language based on proxy IP during startup
      autoLang: false,
      navigator: {
        language: browserLanguage,
        platform: 'Win32',
        // Updated: 2026-02 — review quarterly. Use version 1-2 behind latest stable.
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        resolution
      },
      proxy: {
        mode: proxy.mode || 'socks5',
        host: proxy.host,
        port: parseInt(proxy.port) || 80,
        username: proxy.username || '',
        password: proxy.password || ''
      },
      // WebRTC: mask real IP. fillBasedOnIp MUST be false with rotating proxy —
      // otherwise SDK checks IP, gets random IP-A, but browser uses IP-B → mismatch
      webRTC: {
        mode: 'alerted',
        enabled: true,
        customize: true,
        fillBasedOnIp: false
      },
      // Timezone: explicit US timezone (fillBasedOnIp broken with rotating proxy)
      timezone: {
        enabled: true,
        fillBasedOnIp: false,
        timezone: timezone
      },
      // Geolocation: disabled — don't share location (avoids mismatch with rotating IP)
      geolocation: {
        mode: 'block',
        enabled: true,
        customize: false,
        fillBasedOnIp: false
      },
      // Canvas: use noise to make fingerprint unique but consistent
      canvas: {
        mode: 'noise'
      },
      // WebGL: noise-based fingerprint
      webGL: {
        mode: 'noise'
      },
      // WebGL metadata: mask real GPU info
      webGLMetadata: {
        mode: 'mask',
        vendor: 'Google Inc. (Intel)',
        renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)'
      },
      // Audio context fingerprint
      audioContext: {
        mode: 'noise'
      },
      // Media devices: realistic device count
      mediaDevices: {
        enableMasking: true,
        uid: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
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
   * Priority: SDK (with local Orbita) > Cloud Browser > API
   * SDK is preferred because it provides better fingerprinting control
   * @param {string} profileId - Profile ID
   * @returns {Promise<object>} - { browser, wsUrl, GL, profileId }
   */
  async startProfile(profileId) {
    const errors = [];

    // 1. Always try SDK first (best fingerprinting, works in Docker with Orbita)
    if (this.isSDKAvailable()) {
      console.log('Trying SDK mode (local Orbita browser)...');
      try {
        const result = await this.startProfileSDK(profileId);
        console.log('SDK mode started successfully!');
        return result;
      } catch (error) {
        console.warn('SDK mode failed:', error.message);
        errors.push(`SDK: ${error.message}`);
      }
    } else {
      console.log('SDK not available, skipping...');
      errors.push('SDK: not available');
    }

    // 2. Try Cloud Browser (runs browser on GoLogin servers)
    console.log('Trying Cloud Browser mode...');
    try {
      const result = await this.startProfileCloud(profileId);
      console.log('Cloud Browser mode started successfully!');
      return result;
    } catch (error) {
      console.warn('Cloud Browser mode failed:', error.message);
      errors.push(`Cloud: ${error.message}`);
    }

    // 3. Last resort: API mode (requires GoLogin Desktop running locally)
    console.log('Trying API mode (requires GoLogin Desktop)...');
    try {
      const result = await this.startProfileAPI(profileId);
      console.log('API mode started successfully!');
      return result;
    } catch (error) {
      console.warn('API mode failed:', error.message);
      errors.push(`API: ${error.message}`);
    }

    // All modes failed
    throw new Error(`All GoLogin modes failed: ${errors.join('; ')}`);
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
    console.log(`  Headless mode: ${this.useHeadless}`);
    console.log(`  GOLOGIN_DATA_PATH: ${process.env.GOLOGIN_DATA_PATH || 'not set'}`);
    console.log(`  GOLOGIN_BROWSER_PATH: ${process.env.GOLOGIN_BROWSER_PATH || 'not set'}`);

    // --no-sandbox is REQUIRED when running as root in Docker (even without headless)
    // extra_params override SDK's Chrome flags (--lang, --tz)
    const usTimezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
    const tz = usTimezones[Math.floor(Math.random() * usTimezones.length)];
    const extraParams = [
      '--no-sandbox', '--disable-setuid-sandbox',
      `--lang=en-US`,
      `--tz=${tz}`,
      `--accept-lang=en-US,en;q=0.9`
    ];
    if (this.useHeadless) {
      extraParams.unshift('--headless=new');
    }
    console.log(`  Extra params: ${extraParams.join(', ')}`);

    try {
      // CRITICAL: Pass `timezone` object to SDK constructor.
      // When options.timezone is set, SDK's getTimeZone() returns immediately
      // WITHOUT making HTTP request to geo.myip.link through the rotating proxy.
      // This prevents the SDK from detecting wrong country/language from random proxy IP.
      const GL = new GoLoginSDK({
        token: this.apiToken,
        profile_id: profileId,
        extra_params: extraParams,
        skipOrbitaHashRecalculation: true,
        autoUpdateBrowser: true,
        timezone: {
          timezone: tz,
          country: 'US',
          languages: 'en',
          ip: '0.0.0.0',
          ll: [40.7128, -74.0060],
          accuracy: 100
        }
      });

      console.log('  GoLogin SDK instance created, calling start()...');
      const startResult = await GL.start();
      console.log('  GoLogin SDK start() result:', JSON.stringify(startResult));

      const { status, wsUrl } = startResult;

      if (!wsUrl) {
        throw new Error(`Failed to start profile: ${status || 'no wsUrl returned'}`);
      }

      console.log(`GoLogin profile started (SDK): ${profileId}`);
      console.log(`  WebSocket URL: ${wsUrl.substring(0, 50)}...`);

      return {
        wsUrl,
        GL,
        profileId,
        mode: 'sdk'
      };
    } catch (error) {
      console.error(`SDK start failed: ${error.message}`);
      console.error(`SDK error stack: ${error.stack}`);
      throw error;
    }
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
