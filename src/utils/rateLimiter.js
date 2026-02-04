/**
 * In-memory rate limiter for API keys
 * Limit: 100 requests per minute per key
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

// Map: keyId -> { count, windowStart }
const requestCounts = new Map();

export function checkRateLimit(keyId) {
  const now = Date.now();
  const record = requestCounts.get(keyId);

  if (!record || now - record.windowStart > WINDOW_MS) {
    // New window
    requestCounts.set(keyId, { count: 1, windowStart: now });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt: now + WINDOW_MS };
  }

  if (record.count >= MAX_REQUESTS) {
    // Rate limited
    const resetAt = record.windowStart + WINDOW_MS;
    return { allowed: false, remaining: 0, resetAt, retryAfter: Math.ceil((resetAt - now) / 1000) };
  }

  // Increment count
  record.count++;
  return { allowed: true, remaining: MAX_REQUESTS - record.count, resetAt: record.windowStart + WINDOW_MS };
}

// Cleanup old records every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [keyId, record] of requestCounts.entries()) {
    if (now - record.windowStart > WINDOW_MS * 2) {
      requestCounts.delete(keyId);
    }
  }
}, 5 * 60 * 1000);

export default { checkRateLimit };
