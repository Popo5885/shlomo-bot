/**
 * Retry Strategy
 *
 * Exponential backoff with jitter for failed message sends.
 * Special handling for rate limits (429) and session disconnects.
 */

const BASE_DELAY_MS = 30_000; // 30 seconds
const MAX_DELAY_MS = 600_000; // 10 minutes cap

/**
 * Calculate the next retry delay using exponential backoff.
 * retry 1: 30s, retry 2: 60s, retry 3: 120s (capped at 10 min)
 */
export function calculateRetryDelay(retryCount: number): number {
  const exponentialMs = BASE_DELAY_MS * Math.pow(2, retryCount - 1);
  const capped = Math.min(exponentialMs, MAX_DELAY_MS);

  // Add jitter: +/- 20%
  const jitter = capped * 0.2 * (2 * Math.random() - 1);
  return Math.round(capped + jitter);
}

/**
 * Calculate delay for rate-limited accounts (429).
 * All pending messages for this account should be delayed by this amount.
 */
export function calculateRateLimitDelay(): number {
  // 30 minutes + jitter
  const baseMs = 30 * 60 * 1000;
  const jitter = baseMs * 0.1 * Math.random(); // +0-10%
  return Math.round(baseMs + jitter);
}

/**
 * Calculate delay for a session reconnection attempt.
 * Short delay — the session might come back quickly.
 */
export function calculateReconnectDelay(attemptNumber: number): number {
  // 3s, 6s, 12s, 24s, max 60s
  const base = 3000 * Math.pow(2, attemptNumber - 1);
  return Math.min(base, 60_000);
}

/**
 * Determine the next_retry_at timestamp.
 */
export function getNextRetryAt(retryCount: number): Date {
  const delayMs = calculateRetryDelay(retryCount);
  return new Date(Date.now() + delayMs);
}

/**
 * Check if a message should be retried based on retry count and max retries.
 */
export function shouldRetry(retryCount: number, maxRetries: number): boolean {
  return retryCount < maxRetries;
}
