/**
 * Stage 3: Local In-Memory Rate Limiting Service
 *
 * Protects local authentication endpoints from brute-force password/PIN guessing.
 * Supports injectable clocks for fast, non-blocking deterministic unit testing.
 */

export interface RateLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  lockDurationMs?: number;
  clock?: () => number;
}

interface AttemptRecord {
  failureCount: number;
  firstFailureTime: number;
  lockedUntil: number;
}

export class RateLimiterService {
  private attempts = new Map<string, AttemptRecord>();
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockDurationMs: number;
  private readonly clock: () => number;

  constructor(options: RateLimiterOptions = {}) {
    this.maxFailures = options.maxFailures ?? 5;
    this.windowMs = options.windowMs ?? 5 * 60 * 1000; // 5 minutes
    this.lockDurationMs = options.lockDurationMs ?? 5 * 60 * 1000; // 5 minutes
    this.clock = options.clock ?? (() => Date.now());
  }

  private makeKey(username: string, webContentsId: number): string {
    return `${(username || '').toLowerCase().trim()}:${webContentsId}`;
  }

  /**
   * Check if a specific username + webContents is currently throttled.
   */
  isRateLimited(username: string, webContentsId: number): { limited: boolean; retryAfterSeconds: number } {
    const key = this.makeKey(username, webContentsId);
    const record = this.attempts.get(key);
    if (!record) {
      return { limited: false, retryAfterSeconds: 0 };
    }

    const now = this.clock();

    // Check if under active lock
    if (record.lockedUntil > now) {
      const remainingSec = Math.ceil((record.lockedUntil - now) / 1000);
      return { limited: true, retryAfterSeconds: remainingSec };
    }

    // Window expired; clear stale record
    if (now - record.firstFailureTime > this.windowMs) {
      this.attempts.delete(key);
      return { limited: false, retryAfterSeconds: 0 };
    }

    return { limited: false, retryAfterSeconds: 0 };
  }

  /**
   * Record a failed login attempt and apply lock if threshold exceeded.
   */
  recordFailure(
    username: string,
    webContentsId: number
  ): { limitedNow: boolean; failureCount: number; retryAfterSeconds: number } {
    const key = this.makeKey(username, webContentsId);
    const now = this.clock();
    let record = this.attempts.get(key);

    if (!record || now - record.firstFailureTime > this.windowMs) {
      record = {
        failureCount: 1,
        firstFailureTime: now,
        lockedUntil: 0,
      };
    } else {
      record.failureCount += 1;
    }

    if (record.failureCount >= this.maxFailures) {
      record.lockedUntil = now + this.lockDurationMs;
      this.attempts.set(key, record);
      const retryAfterSec = Math.ceil(this.lockDurationMs / 1000);
      return { limitedNow: true, failureCount: record.failureCount, retryAfterSeconds: retryAfterSec };
    }

    this.attempts.set(key, record);
    return { limitedNow: false, failureCount: record.failureCount, retryAfterSeconds: 0 };
  }

  /**
   * Clear failure count on successful login.
   */
  recordSuccess(username: string, webContentsId: number): void {
    const key = this.makeKey(username, webContentsId);
    this.attempts.delete(key);
  }

  /**
   * Reset all rate limiter states.
   */
  reset(): void {
    this.attempts.clear();
  }
}

// Global default singleton
export const rateLimiterService = new RateLimiterService();
