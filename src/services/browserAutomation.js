/**
 * Browser Automation Service
 *
 * Puppeteer-based automation for Google account operations:
 * - Login to Google account
 * - Add recovery email
 * - Enter OTP code
 *
 * Supports two modes:
 * 1. GoLogin SDK (production) - Uses antidetect browser with fingerprinting
 * 2. Fallback Puppeteer (local/dev) - Uses system Chrome when GoLogin fails
 */

import puppeteer from 'puppeteer-core';
import proxyChain from 'proxy-chain';
import { getGoLoginService } from './goLoginService.js';
import { existsSync } from 'fs';

// Try to find system Chrome path
function getChromePath() {
  const paths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    // Puppeteer env var
    process.env.PUPPETEER_EXECUTABLE_PATH,
    // Docker default
    '/usr/bin/chromium',
  ];

  for (const p of paths) {
    if (p && existsSync(p)) {
      return p;
    }
  }
  return null;
}

export class BrowserAutomation {
  constructor(settings) {
    this.settings = settings;
    this.goLoginService = null;
    this.goLoginInstance = null; // GL instance for stop()
    this.profileId = null;
    this.browser = null;
    this.page = null;
    this.mode = null; // 'gologin' or 'fallback'
  }

  /**
   * Initialize GoLogin service
   */
  initGoLoginService() {
    if (!this.settings.goLoginApiKey) {
      throw new Error('GoLogin API not configured. Set goLoginApiKey in settings.');
    }

    this.goLoginService = getGoLoginService(this.settings);
  }

  /**
   * Start browser with GoLogin profile and proxy
   * Falls back to regular Puppeteer if GoLogin fails (e.g., on macOS dev)
   * @param {object} proxy - Proxy config { mode, host, port, username, password }
   * @returns {Promise<Page>} - Puppeteer page instance
   */
  async start(proxy) {
    // Try GoLogin first
    if (this.settings.goLoginApiKey) {
      try {
        return await this.startWithGoLogin(proxy);
      } catch (error) {
        console.warn(`GoLogin failed: ${error.message}`);
        console.log('Falling back to regular Puppeteer...');
      }
    }

    // Fallback to regular Puppeteer
    // If proxy requires authentication, use proxy-chain to create a local forwarder
    return await this.startWithFallback(proxy);
  }

  /**
   * Start with GoLogin (production mode)
   */
  async startWithGoLogin(proxy) {
    this.initGoLoginService();
    this.mode = 'gologin';

    // 1. Create browser profile with proxy
    console.log('Creating GoLogin profile...');
    this.profileId = await this.goLoginService.createProfile(proxy, `account_${Date.now()}`);

    // 2. Start the profile (Cloud Browser, SDK, or API mode)
    console.log('Starting GoLogin profile...');
    const { wsUrl, GL, mode: profileMode } = await this.goLoginService.startProfile(this.profileId);
    this.goLoginInstance = GL;
    this.goLoginMode = profileMode; // 'cloud', 'sdk', or 'api'

    console.log(`GoLogin profile started in ${profileMode} mode`);

    // 3. Connect Puppeteer with retry logic
    console.log('Connecting Puppeteer to GoLogin...');
    const maxRetries = 3;
    const baseDelay = 2000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.browser = await puppeteer.connect({
          browserWSEndpoint: wsUrl,
          defaultViewport: null,
          ignoreHTTPSErrors: true,
          protocolTimeout: 120000 // 2 min timeout for Cloud Browser
        });
        break; // Success
      } catch (connectError) {
        const isLastAttempt = attempt === maxRetries;
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff

        if (isLastAttempt) {
          throw connectError;
        }

        console.log(`Connection attempt ${attempt} failed: ${connectError.message}`);
        console.log(`Retrying in ${delay / 1000}s... (${maxRetries - attempt} attempts left)`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    // 4. Get page
    const pages = await this.browser.pages();
    this.page = pages[0] || await this.browser.newPage();

    // 5. Configure page
    await this.configurePage();

    console.log(`Browser started (GoLogin ${profileMode} mode)`);
    return this.page;
  }

  /**
   * Start with fallback Puppeteer (local/dev mode)
   * Note: This does NOT provide antidetect fingerprinting!
   * Uses proxy-chain to handle authenticated proxies via local forwarder
   */
  async startWithFallback(proxy) {
    this.mode = 'fallback';
    const hasProxy = proxy && proxy.host && proxy.port;
    const proxyRequiresAuth = hasProxy && proxy.username && proxy.password;

    if (hasProxy) {
      console.log(`Starting browser in fallback mode with proxy: ${proxy.host}:${proxy.port}`);
    } else {
      console.log('Starting browser in fallback mode (no proxy)...');
    }
    console.warn('WARNING: Fallback mode has no antidetect fingerprinting - use GoLogin for production!');

    const chromePath = getChromePath();
    if (!chromePath) {
      throw new Error('No Chrome/Chromium found. Install Chrome or use Docker for GoLogin.');
    }

    // Build args
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
    ];

    // For authenticated proxies, create a local anonymous forwarder using proxy-chain
    if (proxyRequiresAuth) {
      const protocol = proxy.mode || 'http';
      // URL encode username and password to handle special characters
      const encodedUsername = encodeURIComponent(proxy.username);
      const encodedPassword = encodeURIComponent(proxy.password);
      const upstreamUrl = `${protocol}://${encodedUsername}:${encodedPassword}@${proxy.host}:${proxy.port}`;
      console.log(`Creating proxy forwarder for: ${protocol}://${proxy.host}:${proxy.port}`);
      console.log(`Username: ${proxy.username.substring(0, 40)}...`);
      this._anonymizedProxyUrl = await proxyChain.anonymizeProxy(upstreamUrl);
      console.log(`Local proxy forwarder: ${this._anonymizedProxyUrl}`);
      args.push(`--proxy-server=${this._anonymizedProxyUrl}`);
    } else if (hasProxy) {
      const protocol = proxy.mode || 'http';
      args.push(`--proxy-server=${protocol}://${proxy.host}:${proxy.port}`);
    }

    // Launch browser
    this.browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: 'new',
      args,
    });

    // Get page
    this.page = await this.browser.newPage();

    // Configure page
    await this.configurePage();

    console.log(`Browser started (fallback Puppeteer mode${hasProxy ? ' + proxy' : ''})`);
    return this.page;
  }

  /**
   * Configure page for stealth
   */
  async configurePage() {
    // Remove webdriver flag
    await this.page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    });

    // Set timeouts (longer for Cloud Browser due to network latency)
    const timeout = this.goLoginMode === 'cloud' ? 120000 : 60000;
    this.page.setDefaultTimeout(timeout);
    this.page.setDefaultNavigationTimeout(timeout);
  }

  /**
   * Warm up browser profile before Google login
   * This helps avoid phone verification by building trust signals:
   * - Visiting popular sites collects cookies
   * - Mimics normal user behavior
   * - Builds browser history
   * @param {number} duration - Warm-up duration in seconds (default 60)
   */
  async warmUp(duration = 60) {
    console.log(`Warming up browser profile for ${duration}s...`);

    const sites = [
      { url: 'https://www.google.com/search?q=weather+today', wait: 3000, scroll: true },
      { url: 'https://www.youtube.com/', wait: 5000, scroll: true },
      { url: 'https://www.wikipedia.org/', wait: 3000, scroll: false },
      { url: 'https://www.google.com/search?q=news', wait: 3000, scroll: true },
      { url: 'https://www.amazon.com/', wait: 4000, scroll: true },
      { url: 'https://www.google.com/maps', wait: 4000, scroll: false },
      { url: 'https://www.reddit.com/', wait: 3000, scroll: true },
      { url: 'https://www.google.com/search?q=best+restaurants+near+me', wait: 3000, scroll: true },
    ];

    const startTime = Date.now();
    const endTime = startTime + (duration * 1000);
    let siteIndex = 0;

    while (Date.now() < endTime && siteIndex < sites.length) {
      const site = sites[siteIndex];
      try {
        console.log(`  Visiting ${new URL(site.url).hostname}...`);
        await this.page.goto(site.url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Random wait (human-like)
        await this.sleep(site.wait + Math.random() * 2000);

        // Random scroll (human-like behavior)
        if (site.scroll) {
          await this.page.evaluate(() => {
            const scrollHeight = Math.random() * 1000 + 300;
            window.scrollBy({ top: scrollHeight, behavior: 'smooth' });
          });
          await this.sleep(1000 + Math.random() * 1500);
        }

        // Sometimes click on random elements (safe ones)
        if (Math.random() > 0.7) {
          await this.page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const safeLinks = links.filter(a => {
              const href = a.href || '';
              return href.startsWith('http') && !href.includes('login') && !href.includes('signin');
            });
            if (safeLinks.length > 0) {
              const randomLink = safeLinks[Math.floor(Math.random() * Math.min(safeLinks.length, 10))];
              // Don't actually click, just hover
              randomLink.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            }
          });
        }
      } catch (e) {
        console.log(`  (${site.url} skipped: ${e.message})`);
      }
      siteIndex++;
    }

    // Final: visit Google and do a search to establish Google cookies
    try {
      console.log('  Establishing Google cookies...');
      await this.page.goto('https://www.google.com/', { waitUntil: 'networkidle2', timeout: 15000 });
      await this.sleep(2000);

      // Accept cookies if prompt appears
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        for (const btn of buttons) {
          const text = (btn.textContent || '').toLowerCase();
          if (text.includes('accept') || text.includes('agree') || text.includes('принять') || text.includes('согласен')) {
            btn.click();
            break;
          }
        }
      });
      await this.sleep(1000);

      // Do a random search
      const searchTerms = ['best coffee shops', 'how to learn programming', 'travel destinations 2025', 'healthy recipes'];
      const term = searchTerms[Math.floor(Math.random() * searchTerms.length)];
      const searchInput = await this.page.$('input[name="q"], textarea[name="q"]');
      if (searchInput) {
        await searchInput.type(term, { delay: 100 + Math.random() * 100 });
        await this.page.keyboard.press('Enter');
        await this.sleep(3000);
        await this.page.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' }));
        await this.sleep(2000);
      }
    } catch (e) {
      console.log(`  (Google cookie setup skipped: ${e.message})`);
    }

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`Warm-up complete (${elapsed}s, visited ${siteIndex} sites)`);
  }

  /**
   * Login to Google account
   * @param {string} email - Google account email
   * @param {string} password - Account password
   */
  async loginGoogle(email, password) {
    console.log(`Logging in to Google as ${email}...`);

    // Navigate directly to security page - this may avoid phone verification
    // and is where we need to add recovery email anyway
    await this.page.goto('https://myaccount.google.com/intro/security', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Check if we're on intro page (not logged in) - need to click "Sign in" button
    const currentUrl = this.page.url();
    if (currentUrl.includes('/intro/')) {
      console.log('On intro page, clicking "Sign in" button...');

      // Click "Sign in" / "Войти в аккаунт" button
      const clicked = await this.page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        const signInKeywords = ['sign in', 'войти', 'вход', 'sign-in', 'signin', 'log in', 'login'];

        for (const el of links) {
          const text = (el.textContent || '').toLowerCase().trim();
          const href = (el.href || '').toLowerCase();

          if (signInKeywords.some(kw => text.includes(kw)) || href.includes('signin') || href.includes('login')) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.click();
              return true;
            }
          }
        }
        return false;
      });

      if (clicked) {
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
        await this.sleep(1000);
      }
    }

    // Wait for and enter email
    await this.page.waitForSelector('input[type="email"]', { timeout: 30000 });
    await this.sleep(500);
    await this.humanType('input[type="email"]', email);

    // Click next
    await this.page.click('#identifierNext');
    await this.sleep(2000);

    // Wait for password field (or challenge page)
    await this.page.waitForSelector('input[type="password"]', {
      visible: true,
      timeout: 30000
    });

    // Human-like delay
    await this.sleep(1000 + Math.random() * 1000);

    // Enter password
    await this.humanType('input[type="password"]', password);

    // Click next and wait for navigation (use domcontentloaded - networkidle2 can timeout on challenge pages)
    await this.page.click('#passwordNext');
    await this.page.waitForNavigation({
      waitUntil: 'domcontentloaded',
      timeout: 60000
    }).catch(() => {});

    // Extra wait for page to stabilize
    await this.sleep(3000);

    // Handle intermediate pages (up to 5 attempts)
    for (let attempt = 0; attempt < 5; attempt++) {
      const url = this.page.url();
      console.log(`Post-login URL (attempt ${attempt + 1}): ${url}`);

      // Parse URL to check hostname only (not query params like continue=)
      let hostname = '';
      let pathname = '';
      try {
        const parsed = new URL(url);
        hostname = parsed.hostname;
        pathname = parsed.pathname;
      } catch (e) {
        hostname = url;
      }

      // Success: we're on myaccount or any non-signin Google page
      // Check hostname only to avoid false positives from continue= params
      if (hostname === 'myaccount.google.com' ||
          hostname === 'mail.google.com' ||
          hostname === 'drive.google.com' ||
          (hostname.endsWith('.google.com') && !pathname.includes('signin') && hostname !== 'accounts.google.com')) {
        console.log('Login successful');
        return true;
      }

      // Handle challenge/iap, consent pages, speedbump, welcome pages etc.
      if (pathname.includes('challenge/iap') || pathname.includes('challenge/') || pathname.includes('speedbump') ||
          hostname === 'consent.google.com' || pathname.includes('signin/newfeatures') ||
          pathname.includes('ServiceLogin') || pathname.includes('/intl/')) {
        console.log(`Intermediate page detected: ${url.split('?')[0]}`);

        // Take screenshot of challenge page for debugging
        await this.screenshot(`challenge_${attempt}`);

        // Log the page content for debugging
        const challengeText = await this.page.evaluate(() => {
          return document.body?.innerText?.substring(0, 500) || '';
        }).catch(() => '');
        console.log(`Challenge page text: ${challengeText.substring(0, 200).replace(/\n/g, ' | ')}`);

        // Detect page type: password re-entry vs phone verification vs other
        const pageType = await this.page.evaluate(() => {
          const bodyText = (document.body?.innerText || '').toLowerCase();
          const hasPasswordInput = (() => {
            const pw = document.querySelector('input[type="password"]');
            if (!pw) return false;
            const rect = pw.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })();
          const hasPhoneInput = (() => {
            const phone = document.querySelector('input[type="tel"]');
            if (!phone) return false;
            const rect = phone.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          })();

          // Phone verification keywords (multi-language)
          const phoneVerifyKeywords = [
            'verify your identity', 'phone number', 'sms',
            'подтвердите свою личность', 'номер телефона',
            'telefon', 'numéro de téléphone', 'telefonnummer', 'telefoonnummer',
            'verifiëren dat jij het bent', 'verifieer',
            'หมายเลขโทรศัพท์', 'ยืนยันตัวตน',
            'telefon numarası', 'kimliğinizi doğrulayın',
            'nomor telepon', 'verifikasi identitas',
            'フォン', '電話番号', '本人確認',
            'número de teléfono', 'verificar tu identidad'
          ];
          const isPhoneVerify = hasPhoneInput || phoneVerifyKeywords.some(kw => bodyText.includes(kw));

          if (isPhoneVerify && !hasPasswordInput) return 'phone_verification';
          if (hasPasswordInput) return 'password_reentry';
          return 'other';
        });

        console.log(`Challenge page type: ${pageType}`);

        if (pageType === 'password_reentry') {
          console.log('Re-authentication required, entering password...');

          try {
            await this.page.evaluate(() => {
              const input = document.querySelector('input[type="password"]');
              if (input) { input.focus(); input.value = ''; }
            });
            await this.sleep(300);
            await this.humanType('input[type="password"]', password);
            await this.sleep(500);

            // Click the VISIBLE "Next" button
            const clickedNext = await this.page.evaluate(() => {
              const buttons = Array.from(document.querySelectorAll('button'));
              for (const btn of buttons) {
                const rect = btn.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) continue;
                const text = (btn.textContent || '').toLowerCase().trim();
                const nextWords = ['next', 'volgende', 'suivant', 'naprej', 'weiter', 'далее', 'siguiente', 'avanti', '下一步', 'ileri', 'ถัดไป', '次へ', 'berikutnya', 'tiếp theo', 'dalje', 'seuraava', 'næste', 'próximo', 'selanjutnya', 'आगे', 'بعدی', 'التالي', 'seterusnya', 'folytatás', 'кийинки'];
                if (nextWords.some(w => text.includes(w))) {
                  btn.click();
                  return text;
                }
              }
              const submit = document.querySelector('button[type="submit"]');
              if (submit && submit.getBoundingClientRect().width > 0) {
                submit.click();
                return 'submit-btn';
              }
              return null;
            });

            if (clickedNext) {
              console.log(`Clicked next button: "${clickedNext}"`);
            } else {
              console.log('No visible next button found, pressing Enter...');
              await this.page.keyboard.press('Enter');
            }

            await this.sleep(3000);
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
          } catch (pwError) {
            console.log(`Password re-entry failed: ${pwError.message}, page may have transitioned`);
            await this.sleep(2000);
          }
          continue;
        }

        if (pageType === 'phone_verification') {
          console.log('Phone verification detected, clicking "Try another way"...');
          await this.screenshot(`phone_verify_${attempt}`);

          // Click "Try another way" link using hybrid approach:
          // 1. Text matching for known languages
          // 2. Structural matching: find the non-primary button/link in the form actions
          const clickedAlt = await this.page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('a, button, span[role="button"]'));

            // Approach 1: Text matching for known translations
            const altWords = [
              'try another way', 'another way', 'other options', 'more options',
              'другой способ', 'другим способом', 'другие варианты',
              'başka bir yol', 'başka yol', 'diğer seçenekler',
              'autre méthode', 'autre moyen', 'd\'autres options',
              'andere methode', 'weitere optionen', 'andere möglichkeit',
              'otro método', 'otra forma', 'otras opciones', 'probar de otra manera',
              'altra modalità', 'altri modi', 'prova un altro metodo',
              'cara lain', 'opsi lain', 'coba cara lain',
              'cách khác', 'lựa chọn khác', 'thử cách khác',
              'วิธีอื่น', 'ตัวเลือกอื่น', 'ลองวิธีอื่น',
              '別の方法', '他のオプション', '別の方法を試す',
              '其他方式', '其他选项', '尝试其他方式',
              'башка жолун', 'башка ыкма',
              'دوسرا طریقہ', 'روش دیگر',
              'طريقة أخرى', 'خيارات أخرى',
              'दूसरा तरीका', 'अन्य विकल्प',
              'outra forma', 'outras opções', 'tentar de outra forma',
              'andere manier', 'ander manier', 'andere opties', 'probeer een andere',
              'provo një mënyrë', 'mënyrë tjetër', // Albanian
              'annan metod', 'annat sätt', // Swedish
              'muu tapa', 'kokeile toista', // Finnish
              'anden måde', 'prøv en anden', // Danish
              'annen måte', 'prøv en annen', // Norwegian
              'inny sposób', 'spróbuj innego', // Polish
              'jiný způsob', 'zkusit jiný', // Czech
              'iný spôsob', 'skúsiť iný', // Slovak
              'altă metodă', 'încercați altă', // Romanian
              'друг начин', 'опитайте друг', // Bulgarian
              'інший спосіб', 'спробувати інший', // Ukrainian
              'kitą būdą', 'bandyti kitą', // Lithuanian
              'citu veidu', 'mēģiniet citu' // Latvian
            ];
            for (const el of elements) {
              const text = (el.textContent || '').toLowerCase().trim();
              if (altWords.some(w => text.includes(w))) {
                el.click();
                return text;
              }
            }

            // Approach 2: Structural matching
            // On Google challenge pages, there's a primary button (blue, type="button" or submit)
            // and a secondary link/button next to it. Find the secondary one.
            const visibleClickable = elements.filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && rect.bottom > 300; // in lower part of page
            });

            // Find the primary button (usually has a specific background color or is type="submit")
            const primaryBtn = visibleClickable.find(el => {
              const style = window.getComputedStyle(el);
              const bg = style.backgroundColor;
              // Google's blue button RGB values
              return (bg.includes('26, 115, 232') || bg.includes('66, 133, 244') ||
                      bg.includes('24, 90, 188') || bg.includes('25, 103, 210')) ||
                     el.getAttribute('type') === 'submit';
            });

            if (primaryBtn) {
              // Find the other clickable element near the primary button (not the button itself)
              const primaryRect = primaryBtn.getBoundingClientRect();
              const secondary = visibleClickable.find(el => {
                if (el === primaryBtn) return false;
                const rect = el.getBoundingClientRect();
                // Should be on the same horizontal row (within 30px vertically)
                return Math.abs(rect.top - primaryRect.top) < 30 ||
                       Math.abs(rect.bottom - primaryRect.bottom) < 30;
              });

              if (secondary) {
                secondary.click();
                return `[structural] ${(secondary.textContent || '').trim().substring(0, 50)}`;
              }
            }

            return null;
          });

          if (clickedAlt) {
            console.log(`Clicked: "${clickedAlt}"`);
            await this.sleep(3000);
            await this.screenshot(`alt_methods_${attempt}`);

            // Check what verification options are available
            const altPageText = await this.page.evaluate(() => document.body?.innerText || '').catch(() => '');
            console.log(`Alternative methods page: ${altPageText.substring(0, 300).replace(/\n/g, ' | ')}`);

            // Return challenge info so caller can handle email verification + OTP
            return {
              success: false,
              challenge: 'phone_verification',
              altMethodsClicked: true,
              pageText: altPageText.substring(0, 1000)
            };
          } else {
            console.log('Could not find "Try another way" link');

            // Return challenge info without alt methods
            return {
              success: false,
              challenge: 'phone_verification',
              altMethodsClicked: false
            };
          }
        }

        // Other challenge pages - try clicking accept/agree/continue buttons
        const clicked = await this.page.evaluate(() => {
          const allButtons = Array.from(document.querySelectorAll(
            'button, input[type="submit"], div[role="button"], a[role="button"], span[role="button"]'
          ));

          const keywords = [
            'i agree', 'agree', 'accept', 'continue', 'next', 'got it', 'ok',
            'понятно', 'принять', 'продолжить', 'далее', 'согласен',
            'sprejmem', 'naprej', 'nadaljuj', 'suivant',
            '同意', '接受', '繼續', '下一步',
            'kabul', 'devam', 'ileri',
            'akzeptieren', 'weiter', 'zustimmen',
            'ถัดไป', 'ยอมรับ', 'ดำเนินการต่อ',
            '次へ', '同意する',
            'berikutnya', 'setuju',
            'tiếp theo',
            'próximo', 'aceitar', 'concordo',
            'siguiente', 'aceptar',
            'بعدی', 'قبول',
            'التالي', 'موافق',
            'आगे', 'स्वीकार',
            'volgende'
          ];

          for (const btn of allButtons) {
            const text = (btn.textContent || btn.value || '').toLowerCase().trim();
            if (keywords.some(kw => text.includes(kw))) {
              btn.click();
              return text.slice(0, 30);
            }
          }

          const submitBtn = document.querySelector('form button[type="submit"], form input[type="submit"]');
          if (submitBtn) {
            submitBtn.click();
            return 'form-submit';
          }

          return null;
        });

        if (clicked) {
          console.log(`Clicked: "${clicked}"`);
        } else {
          console.log('No button found, trying Enter key...');
          await this.page.keyboard.press('Enter');
        }

        await this.sleep(2000);
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        continue;
      }

      // Check for real security challenges (phone verification, captcha etc.)
      const challengeSelector = await this.page.$('[data-challengetype]');
      if (challengeSelector) {
        const challengeType = await this.page.evaluate(el => el.getAttribute('data-challengetype'), challengeSelector);
        throw new Error(`Google security challenge detected: ${challengeType}`);
      }

      // If still on accounts.google.com but not a known page, try to navigate to myaccount
      if (url.includes('accounts.google.com')) {
        console.log('Still on accounts.google.com, navigating to myaccount...');
        await this.page.goto('https://myaccount.google.com', {
          waitUntil: 'networkidle2',
          timeout: 30000
        });
        await this.sleep(2000);

        // Check if we're logged in now
        const myAccountUrl = this.page.url();
        if (myAccountUrl.includes('myaccount.google.com') && !myAccountUrl.includes('intro')) {
          console.log('Login successful after redirect to myaccount');
          return true;
        }
        continue;
      }

      break;
    }

    // Final check - try navigating to myaccount directly
    console.log('Final login check - navigating to myaccount...');
    await this.page.goto('https://myaccount.google.com', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await this.sleep(2000);

    const finalUrl = this.page.url();
    console.log(`Final URL: ${finalUrl}`);

    // If myaccount loaded without /intro/ and without signin redirect, we're logged in
    if (finalUrl.includes('myaccount.google.com') && !finalUrl.includes('/intro/') && !finalUrl.includes('signin')) {
      console.log('Login successful (verified via myaccount)');
      return true;
    }

    // Get debug info
    const pageTitle = await this.page.title().catch(() => 'unknown');
    const bodyText = await this.page.evaluate(() =>
      document.body?.innerText?.substring(0, 500) || ''
    ).catch(() => '');

    console.error(`Login failed at URL: ${finalUrl}`);
    console.error(`Page title: ${pageTitle}`);
    console.error(`Page preview: ${bodyText.substring(0, 200)}...`);

    throw new Error(`Login failed - not authenticated after all attempts. URL: ${finalUrl}`);
  }

  /**
   * Add recovery email
   * @param {string} recoveryEmail - Recovery email address
   * @param {string} password - Account password (may be needed for re-auth)
   */
  async addRecoveryEmail(recoveryEmail, password) {
    console.log(`Adding recovery email: ${recoveryEmail}...`);

    // Navigate to security settings
    await this.page.goto('https://myaccount.google.com/security', {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    await this.sleep(2000);

    // Find and click recovery email link
    // Selectors may vary, trying multiple approaches
    const clicked = await this.page.evaluate(() => {
      // Try to find by text content
      const links = Array.from(document.querySelectorAll('a, button, div[role="link"]'));
      const recoveryLink = links.find(el => {
        const text = el.textContent?.toLowerCase() || '';
        return text.includes('recovery email') ||
               text.includes('резервн') ||
               text.includes('восстановлен');
      });

      if (recoveryLink) {
        recoveryLink.click();
        return true;
      }

      // Try by href
      const linkByHref = document.querySelector('a[href*="recovery"], a[href*="signinoptions"]');
      if (linkByHref) {
        linkByHref.click();
        return true;
      }

      return false;
    });

    if (!clicked) {
      // Try direct navigation
      await this.page.goto('https://myaccount.google.com/recovery/email', {
        waitUntil: 'networkidle2',
        timeout: 60000
      });
    } else {
      await this.page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: 30000
      }).catch(() => {});
    }

    await this.sleep(2000);

    // May need to re-enter password
    const passwordInput = await this.page.$('input[type="password"]');
    if (passwordInput) {
      console.log('Re-authentication required...');
      await this.humanType('input[type="password"]', password);
      const submitBtn = await this.page.$('button[type="submit"], #passwordNext');
      if (submitBtn) {
        await submitBtn.click();
        await this.page.waitForNavigation({
          waitUntil: 'networkidle2',
          timeout: 30000
        }).catch(() => {});
      }
      await this.sleep(2000);
    }

    // Find email input and enter recovery email
    const emailInput = await this.page.waitForSelector(
      'input[type="email"], input[name*="email"], input[aria-label*="email"]',
      { timeout: 30000 }
    );

    // Clear existing value
    await this.page.evaluate((sel) => {
      const input = document.querySelector(sel);
      if (input) input.value = '';
    }, 'input[type="email"], input[name*="email"]');

    await this.humanType('input[type="email"]', recoveryEmail);

    // Find and click submit/send button
    await this.sleep(500);

    const submitted = await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const submitBtn = buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('next') ||
               text.includes('send') ||
               text.includes('verify') ||
               text.includes('далее') ||
               text.includes('отправить') ||
               text.includes('ถัดไป') ||
               text.includes('ส่ง') ||
               text.includes('weiter') ||
               text.includes('suivant') ||
               text.includes('enviar') ||
               text.includes('التالي') ||
               text.includes('بعدی');
      });

      if (submitBtn) {
        submitBtn.click();
        return true;
      }

      // Try generic submit
      const genericSubmit = document.querySelector('button[type="submit"]');
      if (genericSubmit) {
        genericSubmit.click();
        return true;
      }

      return false;
    });

    if (!submitted) {
      // Try pressing Enter
      await this.page.keyboard.press('Enter');
    }

    await this.sleep(3000);
    console.log('Recovery email submitted, waiting for OTP...');

    return true;
  }

  /**
   * Enter OTP code
   * @param {string} otp - 6-digit OTP code
   */
  async enterOtp(otp) {
    console.log(`Entering OTP: ${otp.slice(0, 2)}****...`);

    // Wait for OTP input
    const otpInput = await this.page.waitForSelector(
      'input[type="tel"], input[type="text"][maxlength="6"], input[name*="code"], input[aria-label*="code"]',
      { timeout: 30000 }
    );

    await this.sleep(500);
    await this.humanType('input[type="tel"], input[name*="code"]', otp);

    // Click verify/submit
    await this.sleep(500);

    const verified = await this.page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const verifyBtn = buttons.find(btn => {
        const text = btn.textContent?.toLowerCase() || '';
        return text.includes('verify') ||
               text.includes('next') ||
               text.includes('подтвердить') ||
               text.includes('далее') ||
               text.includes('ถัดไป') ||
               text.includes('ยืนยัน') ||
               text.includes('weiter') ||
               text.includes('suivant') ||
               text.includes('verificar') ||
               text.includes('التالي') ||
               text.includes('بعدی');
      });

      if (verifyBtn) {
        verifyBtn.click();
        return true;
      }

      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
        return true;
      }

      return false;
    });

    if (!verified) {
      await this.page.keyboard.press('Enter');
    }

    // Wait for navigation/confirmation
    await this.page.waitForNavigation({
      waitUntil: 'networkidle2',
      timeout: 30000
    }).catch(() => {});

    await this.sleep(2000);

    // Check for success
    const url = this.page.url();
    if (url.includes('security') || url.includes('myaccount')) {
      console.log('OTP confirmed successfully');
      return true;
    }

    // Check for error messages
    const errorMsg = await this.page.evaluate(() => {
      const errorEl = document.querySelector('.error-message, [role="alert"], .LXRPh');
      return errorEl?.textContent || null;
    });

    if (errorMsg) {
      throw new Error(`OTP confirmation failed: ${errorMsg}`);
    }

    return true;
  }

  /**
   * Human-like typing
   * @param {string} selector - Input selector
   * @param {string} text - Text to type
   */
  async humanType(selector, text) {
    await this.page.type(selector, text, {
      delay: 50 + Math.random() * 100
    });
  }

  /**
   * Random sleep with variance
   * @param {number} ms - Base milliseconds
   */
  async sleep(ms) {
    const variance = ms * 0.2;
    const actual = ms + (Math.random() - 0.5) * variance;
    await new Promise(resolve => setTimeout(resolve, actual));
  }

  /**
   * Take screenshot for debugging
   * @param {string} name - Screenshot name
   */
  async screenshot(name) {
    if (this.page) {
      try {
        await this.page.screenshot({
          path: `/tmp/screenshot_${name}_${Date.now()}.png`,
          fullPage: true
        });
      } catch (error) {
        console.warn('Failed to take screenshot:', error.message);
      }
    }
  }

  /**
   * Cleanup - close browser and delete profile
   */
  async cleanup() {
    console.log('Cleaning up browser automation...');

    // Close browser
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (error) {
        console.warn('Failed to close browser:', error.message);
      }
      this.browser = null;
    }

    // Stop and delete GoLogin profile
    if (this.goLoginService && this.profileId) {
      try {
        // Stop profile (pass GL instance and mode for proper cleanup)
        await this.goLoginService.stopProfile(
          this.goLoginInstance,
          this.profileId,
          this.goLoginMode || 'api'
        );
      } catch (error) {
        console.warn('Failed to stop GoLogin profile:', error.message);
      }

      try {
        // Delete profile to free up the slot
        await this.goLoginService.deleteProfile(this.profileId);
      } catch (error) {
        console.warn('Failed to delete GoLogin profile:', error.message);
      }
      this.profileId = null;
    }

    this.goLoginInstance = null;
    this.goLoginMode = null;
    this.page = null;

    // Close local proxy forwarder if used
    if (this._anonymizedProxyUrl) {
      try {
        await proxyChain.closeAnonymizedProxy(this._anonymizedProxyUrl, true);
        console.log('Local proxy forwarder closed');
      } catch (error) {
        console.warn('Failed to close proxy forwarder:', error.message);
      }
      this._anonymizedProxyUrl = null;
    }
  }

  /**
   * Get current page URL
   */
  getCurrentUrl() {
    return this.page?.url() || null;
  }

  /**
   * Check if browser is still connected
   */
  isConnected() {
    return this.browser?.isConnected() || false;
  }
}

export default BrowserAutomation;
