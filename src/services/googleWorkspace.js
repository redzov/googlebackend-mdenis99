import { google } from 'googleapis';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import Gaxios from 'gaxios';
import { generateEmailUsername, generateRealName } from '../utils/generators.js';

/**
 * Google Workspace Account Creation Service
 */
export class GoogleWorkspaceService {
  constructor(serviceAccountJson, adminEmail, proxyUrl = null) {
    this.serviceAccountJson = serviceAccountJson;
    this.adminEmail = adminEmail;
    this.proxyUrl = proxyUrl;
    this.auth = null;
    this.admin = null;
    this.proxyAgent = null;
    this._originalGaxiosDefaults = null;
  }

  /**
   * Initialize the Google Admin SDK client
   */
  async initialize() {
    try {
      let credentials;
      if (typeof this.serviceAccountJson === 'string') {
        try {
          credentials = JSON.parse(this.serviceAccountJson);
        } catch (parseError) {
          // Fix: service account JSON may have literal newlines inside private_key PEM
          // This happens when JSON is stored with real \n instead of escaped \\n
          const fixed = this.serviceAccountJson.replace(
            /("private_key"\s*:\s*")([\s\S]*?)(")/,
            (match, prefix, key, suffix) => prefix + key.replace(/\n/g, '\\n') + suffix
          );
          credentials = JSON.parse(fixed);
        }
      } else {
        credentials = this.serviceAccountJson;
      }

      // Create proxy agent (SOCKS5 or HTTP) and set gaxios defaults
      if (this.proxyUrl) {
        if (this.proxyUrl.startsWith('socks')) {
          this.proxyAgent = new SocksProxyAgent(this.proxyUrl);
          console.log(`Google API will route through SOCKS proxy: ${this.proxyUrl.split('@')[1] || this.proxyUrl}`);
        } else {
          this.proxyAgent = new HttpsProxyAgent(this.proxyUrl);
          console.log(`Google API will route through HTTP proxy: ${this.proxyUrl.split('@')[1] || this.proxyUrl}`);
        }
        // Save original defaults and set proxy agent globally for gaxios
        this._originalGaxiosDefaults = { ...Gaxios.instance.defaults };
        Gaxios.instance.defaults.agent = this.proxyAgent;
      }

      // Use JWT directly with subject for domain-wide delegation
      const jwtOptions = {
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/admin.directory.user',
          'https://www.googleapis.com/auth/admin.directory.user.security'
        ],
        subject: this.adminEmail // Impersonate admin user
      };

      this.auth = new google.auth.JWT(jwtOptions);

      // Authorize the JWT client (will use gaxios defaults with proxy)
      await this.auth.authorize();

      // Create admin directory client with proxy support
      const adminOptions = {
        version: 'directory_v1',
        auth: this.auth
      };

      // If proxy is configured, pass the agent to all API calls
      if (this.proxyAgent) {
        adminOptions.http_options = {
          agent: this.proxyAgent
        };
      }

      this.admin = google.admin(adminOptions);

      // Note: We do NOT restore gaxios defaults here anymore
      // The proxy should remain active for all API calls
      // It will be restored when destroy() is called

      return true;
    } catch (error) {
      this._restoreGaxiosDefaults();
      console.error('Failed to initialize Google Workspace service:', error);
      throw new Error(`Google API initialization failed: ${error.message}`);
    }
  }

  /**
   * Restore original gaxios defaults
   */
  _restoreGaxiosDefaults() {
    if (this._originalGaxiosDefaults) {
      if (this._originalGaxiosDefaults.agent === undefined) {
        delete Gaxios.instance.defaults.agent;
      } else {
        Gaxios.instance.defaults.agent = this._originalGaxiosDefaults.agent;
      }
      this._originalGaxiosDefaults = null;
    }
  }

  /**
   * Cleanup and restore defaults - call when done with this service instance
   */
  destroy() {
    this._restoreGaxiosDefaults();
    this.admin = null;
    this.auth = null;
    this.proxyAgent = null;
  }

  /**
   * Create a new user account in Google Workspace
   */
  async createUser(domain, password, recoveryEmail = null) {
    if (!this.admin) {
      await this.initialize();
    }

    const realName = generateRealName();
    const username = generateEmailUsername();
    const email = `${username}@${domain}`;

    try {
      const userResource = {
        primaryEmail: email,
        name: {
          givenName: realName.givenName,
          familyName: realName.familyName
        },
        password: password,
        changePasswordAtNextLogin: false,
        hashFunction: undefined // Let Google hash the password
      };

      // Add recovery email if provided
      if (recoveryEmail) {
        userResource.recoveryEmail = recoveryEmail;
      }

      const response = await this.admin.users.insert({
        requestBody: userResource
      });

      return {
        success: true,
        email: response.data.primaryEmail,
        id: response.data.id,
        createdAt: response.data.creationTime
      };
    } catch (error) {
      console.error('Failed to create user:', error);
      
      // Handle specific Google API errors
      if (error.code === 409) {
        throw new Error('User already exists');
      }
      if (error.code === 403) {
        throw new Error('Permission denied - check service account permissions');
      }
      if (error.code === 400) {
        throw new Error(`Invalid request: ${error.message}`);
      }
      
      throw new Error(`Failed to create user: ${error.message}`);
    }
  }

  /**
   * Set recovery email for existing user
   */
  async setRecoveryEmail(email, recoveryEmail) {
    if (!this.admin) {
      await this.initialize();
    }

    try {
      const response = await this.admin.users.update({
        userKey: email,
        requestBody: {
          recoveryEmail: recoveryEmail
        }
      });

      return {
        success: true,
        email: response.data.primaryEmail,
        recoveryEmail: response.data.recoveryEmail
      };
    } catch (error) {
      console.error('Failed to set recovery email:', error);
      throw new Error(`Failed to set recovery email: ${error.message}`);
    }
  }

  /**
   * Get user info
   */
  async getUser(email) {
    if (!this.admin) {
      await this.initialize();
    }

    try {
      const response = await this.admin.users.get({
        userKey: email
      });

      return {
        success: true,
        user: {
          id: response.data.id,
          email: response.data.primaryEmail,
          name: response.data.name,
          recoveryEmail: response.data.recoveryEmail,
          suspended: response.data.suspended,
          createdAt: response.data.creationTime
        }
      };
    } catch (error) {
      if (error.code === 404) {
        return { success: false, error: 'User not found' };
      }
      throw new Error(`Failed to get user: ${error.message}`);
    }
  }

  /**
   * Delete user
   */
  async deleteUser(email) {
    if (!this.admin) {
      await this.initialize();
    }

    try {
      await this.admin.users.delete({
        userKey: email
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to delete user:', error);
      throw new Error(`Failed to delete user: ${error.message}`);
    }
  }

  /**
   * List users in domain
   */
  async listUsers(domain, maxResults = 100) {
    if (!this.admin) {
      await this.initialize();
    }

    try {
      const response = await this.admin.users.list({
        domain: domain,
        maxResults: maxResults,
        orderBy: 'email'
      });

      return {
        success: true,
        users: response.data.users || [],
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      console.error('Failed to list users:', error);
      throw new Error(`Failed to list users: ${error.message}`);
    }
  }
}

/**
 * Create and initialize a GoogleWorkspaceService for a workspace
 * @param {object} workspace - Workspace DB record with serviceAccountJson and adminEmail
 * @param {string|null} proxyUrl - Optional proxy URL (http:// or socks5://)
 */
export async function createWorkspaceService(workspace, proxyUrl = null) {
  if (!workspace.serviceAccountJson || !workspace.adminEmail) {
    throw new Error('Workspace missing Google credentials (serviceAccountJson or adminEmail)');
  }

  // proxyUrl is passed directly to constructor, will be used via HTTP_PROXY env var
  if (proxyUrl) {
    console.log(`Google Workspace API will use proxy: ${proxyUrl.split('@')[1] || proxyUrl}`);
  }

  const service = new GoogleWorkspaceService(
    workspace.serviceAccountJson,
    workspace.adminEmail,
    proxyUrl
  );

  await service.initialize();
  return service;
}
