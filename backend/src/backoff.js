/**
 * Exponential backoff calculator for failed unlock attempts.
 * Formula: 2^(attemptCount - 1) seconds, capped at reasonable max.
 */

/**
 * Calculates backoff delay (ms) based on failed-attempt count.
 * Exponential: 1s, 2s, 4s, 8s, 16s, 32s, 64s, 128s (capped).
 *
 * @param {number} failedCount - Number of consecutive failed attempts
 * @returns {number} Delay in milliseconds
 */
export function calculateBackoffMs(failedCount) {
  if (failedCount <= 0) return 0;

  // 2^(failedCount - 1) seconds, max 5 minutes
  const secondsDelay = Math.min(Math.pow(2, failedCount - 1), 5 * 60);
  return secondsDelay * 1000;
}

/**
 * Checks if enough time has passed since the last failed attempt.
 * Returns: { allowed: boolean, remainingMs: number }
 *
 * @param {object} failedAttemptData - { count, lastAttempt }
 * @returns {{ allowed: boolean, remainingMs: number }}
 */
export function checkBackoffWindow(failedAttemptData) {
  const { count, lastAttempt } = failedAttemptData;

  if (count === 0 || !lastAttempt) {
    // No failed attempts, allow immediately
    return { allowed: true, remainingMs: 0 };
  }

  const backoffMs = calculateBackoffMs(count);
  const lastAttemptTime = new Date(lastAttempt).getTime();
  const now = new Date().getTime();
  const elapsedMs = now - lastAttemptTime;
  const remainingMs = Math.max(0, backoffMs - elapsedMs);

  return {
    allowed: remainingMs === 0,
    remainingMs,
  };
}
