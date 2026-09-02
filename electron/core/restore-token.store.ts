import * as crypto from 'crypto';

interface PendingCandidate {
  candidatePath: string;
  senderWebContentsId: number;
  expiresAt: number;
  used: boolean;
}

const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const pendingCandidates = new Map<string, PendingCandidate>();

/**
 * Create an opaque cryptographically random token tied to a specific candidate path and sender.
 * One-time use, 5-minute expiry.
 */
export function createCandidateToken(candidatePath: string, senderWebContentsId: number): string {
  // Prune expired tokens on each creation
  pruneExpired();

  const token = crypto.randomBytes(32).toString('hex');
  pendingCandidates.set(token, {
    candidatePath,
    senderWebContentsId,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    used: false,
  });
  return token;
}

/**
 * Consume a candidate token. Returns the file path only if:
 * - Token exists, is not expired, has not been used, and was issued to the same sender.
 * Otherwise throws.
 */
export function consumeCandidateToken(token: string, senderWebContentsId: number): string {
  // Validate token format
  if (!token || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error('RESTORE_INVALID_TOKEN');
  }

  const entry = pendingCandidates.get(token);
  if (!entry) {
    throw new Error('RESTORE_TOKEN_NOT_FOUND');
  }

  if (entry.used) {
    pendingCandidates.delete(token);
    throw new Error('RESTORE_TOKEN_ALREADY_USED');
  }

  if (Date.now() > entry.expiresAt) {
    pendingCandidates.delete(token);
    throw new Error('RESTORE_TOKEN_EXPIRED');
  }

  if (entry.senderWebContentsId !== senderWebContentsId) {
    pendingCandidates.delete(token);
    throw new Error('RESTORE_TOKEN_SENDER_MISMATCH');
  }

  // Mark used and remove
  entry.used = true;
  pendingCandidates.delete(token);
  return entry.candidatePath;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of pendingCandidates) {
    if (now > entry.expiresAt) {
      pendingCandidates.delete(key);
    }
  }
}

/**
 * Clear all pending tokens (for testing).
 */
export function clearAllTokens(): void {
  pendingCandidates.clear();
}

/**
 * Exposed for testing only: manually set token expiry.
 */
export function _setTokenExpiryForTesting(token: string, expiresAt: number): void {
  const entry = pendingCandidates.get(token);
  if (entry) {
    entry.expiresAt = expiresAt;
  }
}
