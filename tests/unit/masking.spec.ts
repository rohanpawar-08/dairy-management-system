import { describe, it, expect } from 'vitest';
import { maskBankAccount, maskUpiId } from '../../shared/masking';

describe('Privacy & PII Masking Utilities (Unit)', () => {
  describe('maskBankAccount', () => {
    it('masks standard bank accounts showing only the last 4 digits', () => {
      expect(maskBankAccount('123456789012')).toBe('••••••••9012');
      expect(maskBankAccount('987654321')).toBe('•••••4321');
      expect(maskBankAccount('12345')).toBe('•2345');
    });

    it('returns 4 bullets for short accounts (<= 4 chars)', () => {
      expect(maskBankAccount('1234')).toBe('••••');
      expect(maskBankAccount('123')).toBe('••••');
      expect(maskBankAccount('1')).toBe('••••');
    });

    it('handles null, undefined, or empty strings cleanly', () => {
      expect(maskBankAccount(null)).toBeNull();
      expect(maskBankAccount(undefined)).toBeNull();
      expect(maskBankAccount('')).toBeNull();
      expect(maskBankAccount('   ')).toBeNull();
    });
  });

  describe('maskUpiId', () => {
    it('masks UPI usernames while preserving first/last characters and domain handle', () => {
      expect(maskUpiId('rohanpawar@oksbi')).toBe('r••••••••r@oksbi');
      expect(maskUpiId('tuka@paytm')).toBe('t••a@paytm');
      expect(maskUpiId('ram@upi')).toBe('r•m@upi');
    });

    it('handles short usernames (<= 2 chars) before @ symbol', () => {
      expect(maskUpiId('ab@oksbi')).toBe('••@oksbi');
      expect(maskUpiId('a@paytm')).toBe('•@paytm');
    });

    it('returns bullets for malformed UPI IDs lacking @ symbol', () => {
      expect(maskUpiId('invalidupi')).toBe('••••');
      expect(maskUpiId('@handle')).toBe('••••');
      expect(maskUpiId('user@')).toBe('••••');
    });

    it('handles null, undefined, or empty strings cleanly', () => {
      expect(maskUpiId(null)).toBeNull();
      expect(maskUpiId(undefined)).toBeNull();
      expect(maskUpiId('')).toBeNull();
      expect(maskUpiId('   ')).toBeNull();
    });
  });
});
