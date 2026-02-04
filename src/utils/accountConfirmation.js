/**
 * Auto-confirm accounts after 15 minutes
 * If account is ISSUED and not marked as BAD within 15 minutes, it's considered working
 */

const CONFIRMATION_DELAY_MS = 15 * 60 * 1000; // 15 minutes

let prismaClient = null;
let intervalId = null;

/**
 * Initialize the auto-confirmation service
 */
export function initAutoConfirmation(prisma) {
  prismaClient = prisma;

  // Run every minute
  intervalId = setInterval(processConfirmations, 60 * 1000);

  // Run immediately on start
  processConfirmations();

  console.log('Account auto-confirmation service started (15 min rule)');
}

/**
 * Stop the auto-confirmation service
 */
export function stopAutoConfirmation() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/**
 * Process accounts that need confirmation
 */
async function processConfirmations() {
  if (!prismaClient) return;

  try {
    const cutoffTime = new Date(Date.now() - CONFIRMATION_DELAY_MS);

    // Find ISSUED accounts older than 15 minutes
    const accountsToConfirm = await prismaClient.account.findMany({
      where: {
        status: 'ISSUED',
        issuedAt: {
          lt: cutoffTime
        }
      },
      select: {
        id: true,
        email: true
      }
    });

    if (accountsToConfirm.length > 0) {
      // These accounts were not reported as BAD within 15 minutes
      // They stay as ISSUED (which means they're working)
      // No action needed - they're already confirmed as working

      console.log(`[Auto-confirm] ${accountsToConfirm.length} accounts confirmed as working (15 min rule)`);
    }
  } catch (error) {
    console.error('Auto-confirmation error:', error);
  }
}

export default { initAutoConfirmation, stopAutoConfirmation };
