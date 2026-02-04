import { customAlphabet } from 'nanoid';

const nanoidNumbers = customAlphabet('0123456789', 5);
const nanoidAlphaNum = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 2);

/**
 * Generate KEY-XXXXX-XX format ID
 */
export function generateKeyId() {
  return `KEY-${nanoidNumbers()}-${nanoidAlphaNum()}`;
}

/**
 * Generate LOG-XXXXX-XX format ID
 */
export function generateLogId() {
  return `LOG-${nanoidNumbers()}-${nanoidAlphaNum()}`;
}

/**
 * Generate CLOG-XXXXX-XX format ID for CreationLog
 */
export function generateCreationLogId() {
  return `CLOG-${nanoidNumbers()}-${nanoidAlphaNum()}`;
}

/**
 * Generate random API key
 */
export function generateApiKey() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const nanoid = customAlphabet(alphabet, 32);
  return nanoid();
}

/**
 * Generate email username
 * Format: userXXXXXXXXXX (10 random digits)
 */
export function generateEmailUsername() {
  const nanoid = customAlphabet('0123456789', 10);
  return `user${nanoid()}`;
}
