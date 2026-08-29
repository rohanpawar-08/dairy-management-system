import { describe, it, expect } from 'vitest';
import {
  hashPassword,
  hashPin,
  verifyPassword,
  verifyPin,
  validatePasswordPolicy,
  validatePinPolicy,
  CREDENTIAL_CONSTANTS,
} from '../../electron/core/credential.service';

describe('Credential Security & scrypt Hashing (Unit)', () => {
  it('generates unique 32-byte salts for identical passwords resulting in different hashes', async () => {
    const pwd = 'DairyOwnerSecret2026';
    const hash1 = await hashPassword(pwd);
    const hash2 = await hashPassword(pwd);

    expect(hash1).not.toBe(hash2);
    expect(hash1.startsWith(CREDENTIAL_CONSTANTS.HASH_PREFIX)).toBe(true);
    expect(hash2.startsWith(CREDENTIAL_CONSTANTS.HASH_PREFIX)).toBe(true);

    // Extract salt and verify length is 32 bytes (64 hex characters)
    const salt1 = hash1.slice(CREDENTIAL_CONSTANTS.HASH_PREFIX.length).split('$')[0];
    const salt2 = hash2.slice(CREDENTIAL_CONSTANTS.HASH_PREFIX.length).split('$')[0];

    expect(salt1.length).toBe(64);
    expect(salt2.length).toBe(64);
    expect(salt1).not.toBe(salt2);
  });

  it('correctly verifies valid and invalid passwords using scrypt', async () => {
    const password = 'CorrectHorseBatteryStaple';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isWrong = await verifyPassword('IncorrectPassword123', hash);
    expect(isWrong).toBe(false);

    const isEmpty = await verifyPassword('', hash);
    expect(isEmpty).toBe(false);
  });

  it('correctly hashes and verifies 4-6 digit quick login PINs', async () => {
    const pin = '482915';
    const pinHash1 = await hashPin(pin);
    const pinHash2 = await hashPin(pin);

    expect(pinHash1).not.toBe(pinHash2);

    const isValid = await verifyPin(pin, pinHash1);
    expect(isValid).toBe(true);

    const isWrong = await verifyPin('111111', pinHash1);
    expect(isWrong).toBe(false);

    const isDifferentLength = await verifyPin('4829', pinHash1);
    expect(isDifferentLength).toBe(false);
  });

  it('safely rejects malformed hashes without throwing uncaught exceptions', async () => {
    const malformed1 = 'not_a_valid_hash';
    const malformed2 = '$scrypt$v=1$N=16384,r=8,p=1$short_salt$short_key';
    const malformed3 = '$scrypt$v=1$N=16384,r=8,p=1$invalid_hex_characters_in_salt_string_length_64_padding_here!!!$key';

    expect(await verifyPassword('any_pass', malformed1)).toBe(false);
    expect(await verifyPassword('any_pass', malformed2)).toBe(false);
    expect(await verifyPassword('any_pass', malformed3)).toBe(false);
    expect(await verifyPin('1234', malformed1)).toBe(false);
  });

  it('enforces password policy limits to prevent resource exhaustion abuse', () => {
    expect(validatePasswordPolicy('').valid).toBe(false);
    expect(validatePasswordPolicy('12345').valid).toBe(false); // 5 chars
    expect(validatePasswordPolicy('123456').valid).toBe(false); // 6 chars (rejected)
    expect(validatePasswordPolicy('123456789').valid).toBe(false); // 9 chars (rejected)
    expect(validatePasswordPolicy('1234567890').valid).toBe(true); // 10 chars (accepted)

    const length128 = 'a'.repeat(128);
    expect(validatePasswordPolicy(length128).valid).toBe(true); // 128 chars (accepted)

    const length129 = 'a'.repeat(129);
    expect(validatePasswordPolicy(length129).valid).toBe(false); // 129 chars (rejected)
  });

  it('enforces PIN policy for 4-6 numeric digits only', () => {
    expect(validatePinPolicy('123').valid).toBe(false); // < 4 digits
    expect(validatePinPolicy('1234').valid).toBe(true);
    expect(validatePinPolicy('123456').valid).toBe(true);
    expect(validatePinPolicy('1234567').valid).toBe(false); // > 6 digits
    expect(validatePinPolicy('12a4').valid).toBe(false); // non-numeric
  });
});
