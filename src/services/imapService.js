import Imap from 'imap';
import { simpleParser } from 'mailparser';

/**
 * IMAP Service for reading emails and extracting OTP codes
 */
export class ImapService {
  constructor(config) {
    this.config = {
      user: config.imapUser,
      password: config.imapPass,
      host: config.imapHost || 'imap.gmail.com',
      port: config.imapPort || 993,
      tls: true,
      tlsOptions: { rejectUnauthorized: false }
    };
    this.imap = null;
  }

  /**
   * Connect to IMAP server
   */
  connect() {
    return new Promise((resolve, reject) => {
      this.imap = new Imap(this.config);

      this.imap.once('ready', () => {
        resolve();
      });

      this.imap.once('error', (err) => {
        reject(err);
      });

      this.imap.connect();
    });
  }

  /**
   * Disconnect from IMAP server
   */
  disconnect() {
    if (this.imap) {
      this.imap.end();
      this.imap = null;
    }
  }

  /**
   * Test connection to IMAP server
   */
  async testConnection() {
    try {
      await this.connect();
      this.disconnect();
      return { success: true, message: 'Connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Open mailbox
   */
  openBox(boxName = 'INBOX', readOnly = true) {
    return new Promise((resolve, reject) => {
      this.imap.openBox(boxName, readOnly, (err, box) => {
        if (err) reject(err);
        else resolve(box);
      });
    });
  }

  /**
   * Search for emails
   */
  search(criteria) {
    return new Promise((resolve, reject) => {
      this.imap.search(criteria, (err, results) => {
        if (err) reject(err);
        else resolve(results);
      });
    });
  }

  /**
   * Fetch and parse email
   */
  fetchEmail(uid) {
    return new Promise((resolve, reject) => {
      const fetch = this.imap.fetch(uid, { bodies: '' });

      fetch.on('message', (msg) => {
        msg.on('body', (stream) => {
          simpleParser(stream, (err, parsed) => {
            if (err) reject(err);
            else resolve(parsed);
          });
        });
      });

      fetch.once('error', reject);
    });
  }

  /**
   * Get recent emails from Google (verification codes)
   * Searches for emails from Google with OTP codes
   */
  async getGoogleOtp(email, minutesAgo = 5) {
    try {
      await this.connect();
      await this.openBox('INBOX', true);

      // Calculate search date
      const searchDate = new Date();
      searchDate.setMinutes(searchDate.getMinutes() - minutesAgo);

      // Search for recent emails from Google about verification
      const criteria = [
        ['FROM', 'noreply@google.com'],
        ['SINCE', searchDate],
        ['OR',
          ['SUBJECT', 'verification'],
          ['SUBJECT', 'код']
        ]
      ];

      const uids = await this.search(criteria);

      if (uids.length === 0) {
        this.disconnect();
        return { success: false, error: 'No verification email found' };
      }

      // Get the most recent email
      const latestUid = uids[uids.length - 1];
      const parsed = await this.fetchEmail(latestUid);

      this.disconnect();

      // Extract OTP code from email body
      const body = parsed.text || parsed.html || '';
      const otpMatch = body.match(/\b(\d{6})\b/);

      if (otpMatch) {
        return {
          success: true,
          otp: otpMatch[1],
          subject: parsed.subject,
          from: parsed.from?.text,
          date: parsed.date
        };
      }

      return { success: false, error: 'Could not extract OTP from email' };

    } catch (error) {
      this.disconnect();
      return { success: false, error: error.message };
    }
  }

  /**
   * Wait for OTP email with polling
   */
  async waitForOtp(email, timeoutMs = 120000, pollIntervalMs = 5000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const result = await this.getGoogleOtp(email, 2);

      if (result.success) {
        return result;
      }

      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }

    return { success: false, error: 'Timeout waiting for OTP' };
  }
}

/**
 * Create IMAP service from recovery email config
 */
export function createImapService(recoveryEmail) {
  return new ImapService({
    imapHost: recoveryEmail.imapHost,
    imapPort: recoveryEmail.imapPort,
    imapUser: recoveryEmail.imapUser,
    imapPass: recoveryEmail.imapPass
  });
}

/**
 * Test IMAP connection for a recovery email
 */
export async function testImapConnection(recoveryEmail) {
  const service = createImapService(recoveryEmail);
  return service.testConnection();
}
