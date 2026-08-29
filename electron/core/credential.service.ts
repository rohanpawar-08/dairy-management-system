import * as crypto from 'crypto';

/**
 * Stage 3: Credential Security Service
 *
 * Implements password and PIN hashing using Node's built-in crypto.scrypt with
 * unique 32-byte salts, 64-byte derived keys, and timing-safe equality checks.
 *
 * Stored Hash Format:
 * $scrypt$v=1$N=16384,r=8,p=1$<salt_hex>$<derived_key_hex>
 */

export const CREDENTIAL_CONSTANTS = {
  SALT_BYTES: 32,
  KEY_BYTES: 64,
  SCRYPT_N: 16384,
  SCRYPT_R: 8,
  SCRYPT_P: 1,
  MAX_MEM: 32 * 1024 * 1024, // 32MB
  MIN_PASSWORD_LEN: 10,
  MAX_PASSWORD_LEN: 128,
  PIN_REGEX: /^\d{4,6}$/,
  HASH_PREFIX: '$scrypt$v=1$N=16384,r=8,p=1$',
} as const;

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate password length and limits against resource exhaustion attacks.
 */
export function validatePasswordPolicy(password: string): ValidationResult {
  if (!password || typeof password !== 'string') {
    return { valid: false, error: 'Password is required' };
  }
  if (password.length < CREDENTIAL_CONSTANTS.MIN_PASSWORD_LEN) {
    return {
      valid: false,
      error: `Password must be at least ${CREDENTIAL_CONSTANTS.MIN_PASSWORD_LEN} characters long`,
    };
  }
  if (password.length > CREDENTIAL_CONSTANTS.MAX_PASSWORD_LEN) {
    return {
      valid: false,
      error: `Password must not exceed ${CREDENTIAL_CONSTANTS.MAX_PASSWORD_LEN} characters`,
    };
  }
  return { valid: true };
}

/**
 * Validate optional quick-login PIN (must be 4 to 6 numeric digits).
 */
export function validatePinPolicy(pin: string): ValidationResult {
  if (!pin || typeof pin !== 'string') {
    return { valid: false, error: 'PIN is required' };
  }
  if (!CREDENTIAL_CONSTANTS.PIN_REGEX.test(pin)) {
    return { valid: false, error: 'PIN must consist of 4 to 6 numeric digits' };
  }
  return { valid: true };
}

/**
 * Asynchronously derives an scrypt key from plaintext and salt using standard parameters.
 */
function deriveScryptKey(secret: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      secret,
      salt,
      CREDENTIAL_CONSTANTS.KEY_BYTES,
      {
        N: CREDENTIAL_CONSTANTS.SCRYPT_N,
        r: CREDENTIAL_CONSTANTS.SCRYPT_R,
        p: CREDENTIAL_CONSTANTS.SCRYPT_P,
        maxmem: CREDENTIAL_CONSTANTS.MAX_MEM,
      },
      (err, derivedKey) => {
        if (err) return reject(err);
        resolve(derivedKey);
      }
    );
  });
}

/**
 * Hash a password using a newly generated 32-byte cryptographically secure salt.
 */
export async function hashPassword(password: string): Promise<string> {
  const policy = validatePasswordPolicy(password);
  if (!policy.valid) {
    throw new Error(policy.error || 'Invalid password policy');
  }

  const salt = crypto.randomBytes(CREDENTIAL_CONSTANTS.SALT_BYTES);
  const derivedKey = await deriveScryptKey(password, salt);

  return `${CREDENTIAL_CONSTANTS.HASH_PREFIX}${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Hash a 4-6 digit quick-login PIN using a unique 32-byte cryptographically secure salt.
 */
export async function hashPin(pin: string): Promise<string> {
  const policy = validatePinPolicy(pin);
  if (!policy.valid) {
    throw new Error(policy.error || 'Invalid PIN policy');
  }

  const salt = crypto.randomBytes(CREDENTIAL_CONSTANTS.SALT_BYTES);
  const derivedKey = await deriveScryptKey(pin, salt);

  return `${CREDENTIAL_CONSTANTS.HASH_PREFIX}${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verify a plaintext secret against a stored self-describing scrypt hash.
 * Safely returns false on malformed hashes or length mismatches without throwing.
 */
async function verifySecret(secret: string, storedHash: string): Promise<boolean> {
  if (!secret || !storedHash || typeof storedHash !== 'string') {
    return false;
  }

  // Expect format: $scrypt$v=1$N=16384,r=8,p=1$<salt_hex>$<derived_key_hex>
  if (!storedHash.startsWith(CREDENTIAL_CONSTANTS.HASH_PREFIX)) {
    return false;
  }

  const parts = storedHash.slice(CREDENTIAL_CONSTANTS.HASH_PREFIX.length).split('$');
  if (parts.length !== 2) {
    return false;
  }

  const [saltHex, keyHex] = parts;
  if (
    saltHex.length !== CREDENTIAL_CONSTANTS.SALT_BYTES * 2 ||
    keyHex.length !== CREDENTIAL_CONSTANTS.KEY_BYTES * 2
  ) {
    return false;
  }

  let saltBuffer: Buffer;
  let storedKeyBuffer: Buffer;

  try {
    saltBuffer = Buffer.from(saltHex, 'hex');
    storedKeyBuffer = Buffer.from(keyHex, 'hex');
  } catch {
    return false;
  }

  if (
    saltBuffer.length !== CREDENTIAL_CONSTANTS.SALT_BYTES ||
    storedKeyBuffer.length !== CREDENTIAL_CONSTANTS.KEY_BYTES
  ) {
    return false;
  }

  try {
    const computedKeyBuffer = await deriveScryptKey(secret, saltBuffer);
    if (computedKeyBuffer.length !== storedKeyBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(computedKeyBuffer, storedKeyBuffer);
  } catch {
    return false;
  }
}

/**
 * Verify a plaintext password against a stored password hash.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || password.length > CREDENTIAL_CONSTANTS.MAX_PASSWORD_LEN) {
    return false;
  }
  return verifySecret(password, storedHash);
}

/**
 * Verify a plaintext PIN against a stored PIN hash.
 */
export async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  if (!pin || !CREDENTIAL_CONSTANTS.PIN_REGEX.test(pin)) {
    return false;
  }
  return verifySecret(pin, storedHash);
}
