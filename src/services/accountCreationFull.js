/**
 * Full Account Creation Service - Полный 7-шаговый процесс создания аккаунта
 *
 * Шаги:
 * 1. Получение прокси
 * 2. Создание аккаунта через Google Admin SDK
 * 3. Создание браузерного профиля с Fingerprint
 * 4. Авторизация в Google аккаунте
 * 5. Добавление Recovery Email
 * 6. Получение OTP кода из почты
 * 7. Подтверждение OTP и сохранение
 */

import { createWorkspaceService } from './googleWorkspace.js';
import { getProxyService } from './proxyService.js';
import { getGoLoginService } from './goLoginService.js';
import { BrowserAutomation } from './browserAutomation.js';
import { ImapService, createImapService } from './imapService.js';
import { generateCreationLogId, generateEmailUsername } from '../utils/generators.js';
import {
  getAccountCreationQueue,
  addBulkAccountCreationJobs,
  registerProcessor,
  isRedisAvailable,
  getQueueStatus
} from './queueService.js';

export class AccountCreationFullService {
  constructor(prisma) {
    this.prisma = prisma;
    this.isRunning = false;
    this.shouldStop = false;
    this.useQueue = false; // Will be set based on Redis availability
    this.progress = {
      total: 0,
      created: 0,
      failed: 0,
      current: null,
      currentStep: null,
      errors: []
    };
  }

  /**
   * Initialize the service
   */
  async initialize() {
    // Check if Redis is available for queue processing
    try {
      this.useQueue = await isRedisAvailable();
      if (this.useQueue) {
        console.log('Redis available - using Bull queue for account creation');
        this.registerQueueProcessor();
      } else {
        console.log('Redis not available - using direct processing');
      }
    } catch (error) {
      console.warn('Redis check failed, using direct processing:', error.message);
      this.useQueue = false;
    }
  }

  /**
   * Register queue processor
   */
  registerQueueProcessor() {
    registerProcessor(async (workspaceId, createdBy, job) => {
      const settings = await this.getSettings();
      const workspace = await this.getWorkspaceWithRecovery(workspaceId);

      // Create log entry
      const creationLog = await this.createLogEntry(workspaceId, createdBy);

      try {
        const account = await this.createSingleAccount(workspace, settings, creationLog, (step, progress) => {
          job.progress(progress);
        });

        return { success: true, account };

      } catch (error) {
        await this.updateLogEntry(creationLog.id, {
          status: 'FAILED',
          error: error.message
        });

        throw error;
      }
    }, this.settings?.threads || 1);
  }

  /**
   * Get settings from database
   */
  async getSettings() {
    return this.prisma.settings.findUnique({
      where: { id: 'main' }
    });
  }

  /**
   * Get workspace with recovery email
   */
  async getWorkspaceWithRecovery(workspaceId) {
    return this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { recoveryEmail: true }
    });
  }

  /**
   * Create log entry
   */
  async createLogEntry(workspaceId, createdBy) {
    return this.prisma.creationLog.create({
      data: {
        logId: generateCreationLogId(),
        workspaceId,
        status: 'PENDING',
        currentStep: 'Инициализация',
        createdBy
      }
    });
  }

  /**
   * Update log entry
   */
  async updateLogEntry(logId, data) {
    return this.prisma.creationLog.update({
      where: { id: logId },
      data: {
        ...data,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Get current progress
   */
  getProgress() {
    return {
      ...this.progress,
      isRunning: this.isRunning
    };
  }

  /**
   * Start creating accounts
   * @param {string} workspaceId - Workspace ID
   * @param {number} count - Number of accounts to create
   * @param {string} createdBy - Creator (Manual or Key ID)
   */
  async createAccounts(workspaceId, count, createdBy = 'Manual') {
    if (this.isRunning) {
      throw new Error('Account creation already in progress');
    }

    // Initialize progress
    this.isRunning = true;
    this.shouldStop = false;
    this.progress = {
      total: count,
      created: 0,
      failed: 0,
      current: null,
      currentStep: null,
      errors: []
    };

    // Get settings and workspace
    const settings = await this.getSettings();
    const workspace = await this.getWorkspaceWithRecovery(workspaceId);

    if (!workspace) {
      this.isRunning = false;
      throw new Error('Workspace not found');
    }

    if (!workspace.recoveryEmail) {
      this.isRunning = false;
      throw new Error('Recovery email not configured for this workspace');
    }

    if (!workspace.serviceAccountJson || !workspace.adminEmail) {
      this.isRunning = false;
      throw new Error('Google API credentials not configured');
    }

    // Check external API configuration
    // NEW: Check for GoLogin API key OR legacy fingerprint config
    const hasGoLogin = settings.goLoginApiKey;
    const hasLegacyFingerprint = settings.fingerprintApiKey && settings.fingerprintApiUrl;
    const useBrowserAutomation = hasGoLogin || hasLegacyFingerprint;

    // NEW: Check for Webshare proxy OR legacy proxy config
    const hasWebshareProxy = settings.proxyHost && settings.proxyUsername && settings.proxyPassword;
    const hasLegacyProxy = settings.proxyApiKey && settings.proxyApiUrl;
    const useProxy = hasWebshareProxy || hasLegacyProxy;

    console.log(`Starting account creation: ${count} accounts`);
    console.log(`Browser automation: ${useBrowserAutomation ? 'enabled' : 'disabled (API keys not configured)'}`);
    console.log(`Proxy: ${useProxy ? 'enabled' : 'disabled (API keys not configured)'}`);

    const results = [];

    // If using queue and Redis is available
    if (this.useQueue) {
      console.log('Adding jobs to queue...');
      const jobs = await addBulkAccountCreationJobs(workspaceId, count, createdBy);

      // Monitor queue progress
      this.monitorQueueProgress(jobs.map(j => j.id));

      return {
        queued: true,
        jobCount: jobs.length,
        message: 'Jobs added to queue'
      };
    }

    // Direct processing (no Redis)
    for (let i = 0; i < count; i++) {
      if (this.shouldStop) {
        console.log('Creation stopped by user');
        break;
      }

      this.progress.current = `Создание аккаунта ${i + 1}/${count}`;

      // Create log entry
      const creationLog = await this.createLogEntry(workspaceId, createdBy);

      try {
        let account;

        if (useBrowserAutomation) {
          // Full 7-step process
          account = await this.createSingleAccount(workspace, settings, creationLog);
        } else {
          // Simple Google Admin SDK only (without browser automation)
          account = await this.createAccountSimple(workspace, settings, creationLog);
        }

        results.push(account);
        this.progress.created++;

      } catch (error) {
        console.error(`Failed to create account ${i + 1}:`, error.message);
        this.progress.failed++;
        this.progress.errors.push({
          index: i + 1,
          error: error.message
        });

        await this.updateLogEntry(creationLog.id, {
          status: 'FAILED',
          error: error.message,
          durationMs: Date.now() - creationLog.createdAt.getTime()
        });
      }

      // Pause between accounts
      if (i < count - 1 && !this.shouldStop) {
        await this.sleep(2000 + Math.random() * 3000);
      }
    }

    this.isRunning = false;
    this.progress.current = 'Завершено';

    return {
      total: count,
      created: this.progress.created,
      failed: this.progress.failed,
      accounts: results,
      errors: this.progress.errors
    };
  }

  /**
   * Simple account creation (Google Admin SDK only, no browser automation)
   */
  async createAccountSimple(workspace, settings, creationLog) {
    const startTime = Date.now();
    const stepDurations = {};

    try {
      // Step: Create via Google Admin SDK
      await this.updateLogEntry(creationLog.id, {
        status: 'CREATING',
        currentStep: 'Создание через Google Admin SDK'
      });
      this.progress.currentStep = 'Создание через Google Admin SDK';

      const stepStart = Date.now();
      const gwService = await createWorkspaceService(workspace);
      const defaultPassword = settings?.defaultPassword || 'ChangeMe123!';

      // Recovery email is NOT added via API per client requirements
      // It should only be added via browser for "natural" account behavior
      const result = await gwService.createUser(
        workspace.domain,
        defaultPassword,
        null // Recovery email добавляется ТОЛЬКО через браузер!
      );
      stepDurations.googleApi = Date.now() - stepStart;

      // Save to database (store recovery email for later browser addition)
      const account = await this.prisma.account.create({
        data: {
          email: result.email,
          password: defaultPassword,
          recovery: workspace.recoveryEmail?.email || null, // Store for browser step
          workspaceId: workspace.id,
          status: 'AVAILABLE',
          issuedTo: creationLog.createdBy,
          issuedAt: new Date()
        }
      });

      // Update log to success
      const totalDuration = Date.now() - startTime;
      await this.updateLogEntry(creationLog.id, {
        status: 'SUCCESS',
        currentStep: 'Аккаунт создан (без браузерной верификации)',
        email: account.email,
        accountId: account.id,
        durationMs: totalDuration,
        stepDurations
      });

      return account;

    } catch (error) {
      throw error;
    }
  }

  /**
   * Create single account with full 7-step process
   */
  async createSingleAccount(workspace, settings, creationLog, onProgress) {
    const startTime = Date.now();
    const stepDurations = {};
    let proxy = null;
    let browser = null;

    const updateStep = async (status, step, extra = {}) => {
      this.progress.currentStep = step;
      await this.updateLogEntry(creationLog.id, {
        status,
        currentStep: step,
        ...extra
      });
      if (onProgress) {
        const progressPercent = this.calculateProgress(status);
        onProgress(step, progressPercent);
      }
    };

    try {
      // ========== STEP 1: Get Proxy with Sticky Session ==========
      await updateStep('CREATING', 'Получение прокси');

      const proxyStart = Date.now();
      let proxyConfig = null;
      let proxyString = null;

      // Check for Webshare proxy config (new method)
      const hasWebshareProxy = settings.proxyHost && settings.proxyUsername && settings.proxyPassword;
      // Fallback to legacy API config
      const hasLegacyProxy = settings.proxyApiKey && settings.proxyApiUrl;

      if (hasWebshareProxy) {
        const proxyService = getProxyService(settings);

        // Per ТЗ: Use Rotating Residential Proxy for both API and browser.
        // Each connection gets a different residential IP from Webshare's pool.
        // Google Admin API (service account) and browser login IPs will differ,
        // but this is fine: Admin API creates accounts server-side (not as the user),
        // so IP mismatch between API and browser doesn't trigger phone verification.
        proxyConfig = proxyService.getRotatingProxy();
        proxyString = proxyService.getRotatingProxyUrl();

        console.log(`Using rotating residential proxy: ${proxyString.split('@')[1] || proxyString}`);
        await updateStep('CREATING', 'Прокси получен (rotating)', { proxyUsed: proxyString.split('@')[1] || proxyString });
      } else if (hasLegacyProxy) {
        const proxyService = getProxyService(settings);
        proxyString = await proxyService.getProxy({ country: 'US', type: 'residential' });
        await updateStep('CREATING', 'Прокси получен', { proxyUsed: proxyString });
      } else {
        console.log('Proxy not configured, skipping...');
      }
      stepDurations.proxy = Date.now() - proxyStart;

      // ========== STEP 2: Create via Google Admin SDK (through proxy) ==========
      await updateStep('CREATING', 'Создание аккаунта в Google (через прокси)');

      const googleStart = Date.now();
      // Pass proxy URL so API calls go through the same IP as browser
      const gwService = await createWorkspaceService(workspace, proxyString);
      const defaultPassword = settings?.defaultPassword || 'ChangeMe123!';

      // Recovery email will be added via browser, NOT via API
      // This is important - adding via browser looks more "natural" to Google
      const googleAccount = await gwService.createUser(
        workspace.domain,
        defaultPassword,
        null // Recovery email добавляется ТОЛЬКО через браузер!
      );
      stepDurations.googleApi = Date.now() - googleStart;

      // Cleanup Google API service (restores global gaxios defaults)
      gwService.destroy();

      // Anti-detection delay: 2-5 minutes before browser login
      // Instant login after Admin SDK account creation from different IP triggers phone verification.
      // This mimics a human receiving credentials and then manually logging in later.
      const delayMs = 120000 + Math.random() * 180000; // 2-5 minutes
      const delaySec = Math.round(delayMs / 1000);
      console.log(`Ожидание ${delaySec} сек перед входом в браузер (антидетект)...`);
      const delayStart = Date.now();
      const countdownInterval = setInterval(() => {
        const remaining = Math.round((delayMs - (Date.now() - delayStart)) / 1000);
        if (remaining > 0) console.log(`  ${remaining}s до входа в браузер...`);
      }, 30000);
      await this.sleep(delayMs);
      clearInterval(countdownInterval);

      await updateStep('BROWSER_AUTH', 'Аккаунт создан, запуск браузера', {
        email: googleAccount.email
      });

      // ========== STEP 3: Start Browser with GoLogin ==========
      const browserStart = Date.now();
      // Pick a random US timezone — used consistently for GoLogin profile AND CDP overrides
      const usTimezones = ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles'];
      const targetTimezone = usTimezones[Math.floor(Math.random() * usTimezones.length)];
      browser = new BrowserAutomation(settings, { timezone: targetTimezone, locale: 'en-US' });

      if (!settings.goLoginApiKey) {
        throw new Error('GoLogin API key not configured — cannot proceed without antidetect browser');
      }

      if (!proxyConfig) {
        throw new Error('Proxy not configured — cannot proceed without proxy');
      }

      // Start GoLogin with proxy
      await browser.start(proxyConfig);
      stepDurations.browserStart = Date.now() - browserStart;

      // ========== STEP 3.5: Verify browser IP matches API proxy ==========
      await updateStep('BROWSER_AUTH', 'Проверка IP прокси');
      const browserIp = await browser.verifyProxyIp();
      if (browserIp) {
        console.log(`Browser confirmed on IP: ${browserIp}`);
      }

      // ========== STEP 4: Login to Google ==========
      await updateStep('BROWSER_AUTH', 'Авторизация в Google');

      const loginStart = Date.now();
      // Warm-up: visit popular sites to build cookies and trust signals (90s visits all 8 sites)
      console.log("Warming up browser profile...");
      await browser.warmUp(90);
      await browser.loginGoogle(googleAccount.email, defaultPassword);
        stepDurations.login = Date.now() - loginStart;

        // ========== STEP 5: Add Recovery Email ==========
        await updateStep('ADDING_RECOVERY', 'Добавление recovery email');

        const recoveryStart = Date.now();
        await browser.addRecoveryEmail(
          workspace.recoveryEmail.email,
          defaultPassword
        );
        stepDurations.addRecovery = Date.now() - recoveryStart;

        // ========== STEP 6: Get OTP from Email ==========
        await updateStep('WAITING_OTP', 'Ожидание OTP кода');

        const otpStart = Date.now();
        const imapService = createImapService(workspace.recoveryEmail);
        const otpResult = await imapService.waitForOtp(googleAccount.email, 120000, 5000);

        if (!otpResult.success) {
          throw new Error('Failed to get OTP: ' + otpResult.error);
        }
        stepDurations.otpWait = Date.now() - otpStart;

        await updateStep('CONFIRMING_OTP', `OTP получен: ${otpResult.otp.slice(0, 2)}****`);

        // ========== STEP 7: Confirm OTP ==========
        const confirmStart = Date.now();
        await browser.enterOtp(otpResult.otp);
        stepDurations.otpConfirm = Date.now() - confirmStart;

      // Save profileId before cleanup (cleanup nullifies it)
      const savedProfileId = browser?.profileId || null;

      // Cleanup browser
      if (browser) {
        await browser.cleanup();
      }

      // ========== Save Account ==========
      const accountPassword = settings?.defaultPassword || 'ChangeMe123!';
      const account = await this.prisma.account.create({
        data: {
          email: googleAccount.email,
          password: accountPassword,
          recovery: workspace.recoveryEmail?.email || null,
          status: 'AVAILABLE',
          workspaceId: workspace.id,
          proxyUsed: proxyString,
          fingerprintId: savedProfileId,
          issuedTo: creationLog.createdBy,
          issuedAt: new Date()
        }
      });

      // Update log to success
      const totalDuration = Date.now() - startTime;
      await updateStep('SUCCESS', 'Аккаунт успешно создан', {
        accountId: account.id,
        durationMs: totalDuration,
        stepDurations,
        fingerprintId: savedProfileId
      });

      return account;

    } catch (error) {
      // Cleanup on error
      if (browser) {
        await browser.cleanup().catch(() => {});
      }

      throw error;
    }
  }

  /**
   * Calculate progress percentage based on status
   */
  calculateProgress(status) {
    const progressMap = {
      'PENDING': 0,
      'CREATING': 20,
      'BROWSER_AUTH': 40,
      'ADDING_RECOVERY': 60,
      'WAITING_OTP': 70,
      'CONFIRMING_OTP': 85,
      'SUCCESS': 100,
      'FAILED': 100
    };
    return progressMap[status] || 0;
  }

  /**
   * Monitor queue progress
   */
  async monitorQueueProgress(jobIds) {
    const queue = getAccountCreationQueue();

    const checkProgress = async () => {
      if (!this.isRunning) return;

      const status = await getQueueStatus();
      this.progress.current = `В очереди: ${status.waiting}, активно: ${status.active}`;

      // Check completed/failed
      let completed = 0;
      let failed = 0;

      for (const jobId of jobIds) {
        const job = await queue.getJob(jobId);
        if (job) {
          const state = await job.getState();
          if (state === 'completed') completed++;
          if (state === 'failed') failed++;
        }
      }

      this.progress.created = completed;
      this.progress.failed = failed;

      if (completed + failed < jobIds.length) {
        setTimeout(checkProgress, 2000);
      } else {
        this.isRunning = false;
        this.progress.current = 'Завершено';
      }
    };

    setTimeout(checkProgress, 1000);
  }

  /**
   * Stop account creation
   */
  stop() {
    this.shouldStop = true;
    this.progress.current = 'Остановка...';
    console.log('Stopping account creation...');
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let accountCreationFullService = null;

export function getAccountCreationFullService(prisma) {
  if (!accountCreationFullService) {
    accountCreationFullService = new AccountCreationFullService(prisma);
  }
  return accountCreationFullService;
}

export default AccountCreationFullService;
