import { createWorkspaceService } from './googleWorkspace.js';
import { createCreationLog, updateCreationLog } from '../routes/creationLogs.js';

/**
 * Account Creation Service
 * Handles the full flow of creating Google Workspace accounts
 */
export class AccountCreationService {
  constructor(prisma) {
    this.prisma = prisma;
    this.isRunning = false;
    this.progress = {
      total: 0,
      created: 0,
      failed: 0,
      current: null
    };
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
   * Create accounts for a specific workspace
   */
  async createAccounts(workspaceId, count, issuedTo = 'Manual') {
    if (this.isRunning) {
      throw new Error('Account creation already in progress');
    }

    this.isRunning = true;
    this.progress = {
      total: count,
      created: 0,
      failed: 0,
      current: null,
      errors: []
    };

    const createdAccounts = [];

    try {
      // Get workspace with credentials
      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          recoveryEmail: true
        }
      });

      if (!workspace) {
        throw new Error('Workspace not found');
      }

      if (!workspace.serviceAccountJson || !workspace.adminEmail) {
        throw new Error('Workspace missing Google API credentials');
      }

      // Get settings for default password
      const settings = await this.prisma.settings.findUnique({
        where: { id: 'main' }
      });

      const defaultPassword = settings?.defaultPassword || 'ChangeMe123!';
      const recoveryEmail = workspace.recoveryEmail?.email || null;

      // Initialize Google Workspace service
      const gwService = await createWorkspaceService(workspace);

      // Create accounts
      for (let i = 0; i < count; i++) {
        this.progress.current = `Creating account ${i + 1} of ${count}`;
        const startTime = Date.now();
        let creationLog = null;

        try {
          // Create creation log entry
          creationLog = await createCreationLog(this.prisma, {
            workspaceId: workspace.id,
            status: 'PENDING',
            step: 'initialization'
          });

          // Update to LOGIN_STARTED (using Google Admin SDK)
          await updateCreationLog(this.prisma, creationLog.id, {
            status: 'LOGIN_STARTED',
            step: 'google_admin_sdk'
          });

          // Create user in Google Workspace
          const result = await gwService.createUser(
            workspace.domain,
            defaultPassword,
            recoveryEmail
          );

          // Save to database
          const account = await this.prisma.account.create({
            data: {
              email: result.email,
              password: defaultPassword,
              recovery: recoveryEmail,
              workspaceId: workspace.id,
              status: 'AVAILABLE',
              issuedTo: issuedTo,
              issuedAt: new Date()
            }
          });

          // Update creation log to completed
          const duration = Date.now() - startTime;
          await updateCreationLog(this.prisma, creationLog.id, {
            status: 'COMPLETED',
            step: 'completed',
            accountId: account.id,
            email: account.email,
            duration
          });

          createdAccounts.push(account);
          this.progress.created++;

        } catch (error) {
          console.error(`Failed to create account ${i + 1}:`, error.message);
          this.progress.failed++;
          this.progress.errors.push({
            index: i + 1,
            error: error.message
          });

          // Update creation log to failed
          if (creationLog) {
            const duration = Date.now() - startTime;
            await updateCreationLog(this.prisma, creationLog.id, {
              status: 'FAILED',
              step: 'error',
              errorMessage: error.message,
              duration
            }).catch(console.error);
          }

          // Continue with next account
          continue;
        }

        // Small delay between creations to avoid rate limiting
        if (i < count - 1) {
          await this.delay(500);
        }
      }

      this.progress.current = 'Completed';
      return {
        success: true,
        created: this.progress.created,
        failed: this.progress.failed,
        accounts: createdAccounts,
        errors: this.progress.errors
      };

    } catch (error) {
      this.progress.current = `Error: ${error.message}`;
      throw error;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Create accounts for a specific key (API request)
   */
  async createAccountsForKey(keyId, count) {
    // Get key with workspace
    const key = await this.prisma.key.findUnique({
      where: { id: keyId },
      include: {
        workspace: {
          include: {
            recoveryEmail: true
          }
        },
        _count: {
          select: { accounts: true }
        }
      }
    });

    if (!key) {
      throw new Error('Key not found');
    }

    // Check quota
    const currentUsage = key._count.accounts;
    const remainingQuota = key.quotaLimit - currentUsage;

    if (remainingQuota <= 0) {
      throw new Error('Quota exceeded');
    }

    // Limit count to remaining quota
    const actualCount = Math.min(count, remainingQuota);

    // Create accounts
    const result = await this.createAccounts(
      key.workspaceId,
      actualCount,
      key.keyId
    );

    // Update accounts with key reference
    if (result.accounts.length > 0) {
      await this.prisma.account.updateMany({
        where: {
          id: { in: result.accounts.map(a => a.id) }
        },
        data: {
          keyId: key.id,
          status: 'ISSUED'
        }
      });
    }

    return {
      ...result,
      quotaRemaining: remainingQuota - result.created
    };
  }

  /**
   * Issue existing available accounts to a key
   */
  async issueAccountsToKey(keyId, count) {
    // Get key with workspace
    const key = await this.prisma.key.findUnique({
      where: { id: keyId },
      include: {
        workspace: true,
        _count: {
          select: { accounts: true }
        }
      }
    });

    if (!key) {
      throw new Error('Key not found');
    }

    // Check quota
    const currentUsage = key._count.accounts;
    const remainingQuota = key.quotaLimit - currentUsage;

    if (remainingQuota <= 0) {
      throw new Error('Quota exceeded');
    }

    // Limit count to remaining quota
    const actualCount = Math.min(count, remainingQuota);

    // Get available accounts from the same workspace
    const availableAccounts = await this.prisma.account.findMany({
      where: {
        workspaceId: key.workspaceId,
        status: 'AVAILABLE'
      },
      take: actualCount
    });

    if (availableAccounts.length === 0) {
      throw new Error('No available accounts');
    }

    // Update accounts
    await this.prisma.account.updateMany({
      where: {
        id: { in: availableAccounts.map(a => a.id) }
      },
      data: {
        keyId: key.id,
        status: 'ISSUED',
        issuedTo: key.keyId,
        issuedAt: new Date()
      }
    });

    // Fetch updated accounts
    const issuedAccounts = await this.prisma.account.findMany({
      where: {
        id: { in: availableAccounts.map(a => a.id) }
      }
    });

    return {
      success: true,
      issued: issuedAccounts.length,
      accounts: issuedAccounts,
      quotaRemaining: remainingQuota - issuedAccounts.length
    };
  }

  /**
   * Helper: delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let accountCreationService = null;

export function getAccountCreationService(prisma) {
  if (!accountCreationService) {
    accountCreationService = new AccountCreationService(prisma);
  }
  return accountCreationService;
}
