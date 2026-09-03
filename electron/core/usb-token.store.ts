import * as crypto from 'crypto';

interface PendingUsbDrive {
  deviceId: string;
  driveRoot: string;
  senderWebContentsId: number;
  expiresAt: number;
}

const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const pendingUsbDrives = new Map<string, PendingUsbDrive>();

/**
 * Create an opaque cryptographically random token tied to a detected USB drive and sender.
 * 5-minute expiry.
 */
export function createUsbToken(
  deviceId: string,
  driveRoot: string,
  senderWebContentsId: number
): string {
  pruneExpiredUsbTokens();

  const token = crypto.randomBytes(32).toString('hex');
  pendingUsbDrives.set(token, {
    deviceId,
    driveRoot,
    senderWebContentsId,
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
  });
  return token;
}

/**
 * Resolve a USB token. Validates format, existence, expiry, and sender.
 */
export function resolveUsbToken(
  token: string,
  senderWebContentsId: number
): { deviceId: string; driveRoot: string } {
  if (!token || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) {
    throw new Error('USB_INVALID_TOKEN');
  }

  const entry = pendingUsbDrives.get(token);
  if (!entry) {
    throw new Error('USB_TOKEN_NOT_FOUND');
  }

  if (Date.now() > entry.expiresAt) {
    pendingUsbDrives.delete(token);
    throw new Error('USB_TOKEN_EXPIRED');
  }

  if (entry.senderWebContentsId !== senderWebContentsId) {
    pendingUsbDrives.delete(token);
    throw new Error('USB_TOKEN_SENDER_MISMATCH');
  }

  return {
    deviceId: entry.deviceId,
    driveRoot: entry.driveRoot,
  };
}

function pruneExpiredUsbTokens(): void {
  const now = Date.now();
  for (const [key, entry] of pendingUsbDrives) {
    if (now > entry.expiresAt) {
      pendingUsbDrives.delete(key);
    }
  }
}

/**
 * Clear all pending USB tokens (for testing).
 */
export function clearAllUsbTokens(): void {
  pendingUsbDrives.clear();
}

/**
 * Exposed for testing only: manually set USB token expiry.
 */
export function _setUsbTokenExpiryForTesting(token: string, expiresAt: number): void {
  const entry = pendingUsbDrives.get(token);
  if (entry) {
    entry.expiresAt = expiresAt;
  }
}
