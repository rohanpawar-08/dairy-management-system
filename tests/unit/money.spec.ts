import { describe, it, expect } from 'vitest';
import { parseRupeesToPaise, formatPaiseAsRupees } from '../../shared/money';

describe('Financial Money & Integer Paise Conversion (Unit)', () => {
  it('parses valid rupee strings to exact integer paise without floating point drift', () => {
    expect(parseRupeesToPaise('0')).toBe(0);
    expect(parseRupeesToPaise('0.00')).toBe(0);
    expect(parseRupeesToPaise('1')).toBe(100);
    expect(parseRupeesToPaise('1.5')).toBe(150);
    expect(parseRupeesToPaise('1.05')).toBe(105);
    expect(parseRupeesToPaise('123.45')).toBe(12345);
    expect(parseRupeesToPaise('1500')).toBe(150000);
    expect(parseRupeesToPaise('999999.99')).toBe(99999999);
  });

  it('correctly parses negative rupee strings for farmer debt / advance loan', () => {
    expect(parseRupeesToPaise('-50')).toBe(-5000);
    expect(parseRupeesToPaise('-50.5')).toBe(-5050);
    expect(parseRupeesToPaise('-123.45')).toBe(-12345);
  });

  it('proves zero float drift on classic 0.10 + 0.20 summation', () => {
    const p1 = parseRupeesToPaise('0.10');
    const p2 = parseRupeesToPaise('0.20');
    const sumPaise = p1 + p2;

    expect(sumPaise).toBe(30);
    expect(formatPaiseAsRupees(sumPaise)).toBe('0.30');

    // Contrast with JavaScript native floating-point math: 0.1 + 0.2 !== 0.3
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('formats integer paise as decimal rupee strings with 2 decimal places', () => {
    expect(formatPaiseAsRupees(0)).toBe('0.00');
    expect(formatPaiseAsRupees(1)).toBe('0.01');
    expect(formatPaiseAsRupees(5)).toBe('0.05');
    expect(formatPaiseAsRupees(50)).toBe('0.50');
    expect(formatPaiseAsRupees(100)).toBe('1.00');
    expect(formatPaiseAsRupees(150000)).toBe('1500.00');
    expect(formatPaiseAsRupees(-5005)).toBe('-50.05');
    expect(formatPaiseAsRupees(-100)).toBe('-1.00');
  });

  it('rejects malformed, non-numeric, or excessive decimal place strings', () => {
    expect(() => parseRupeesToPaise('')).toThrow(/cannot be empty/);
    expect(() => parseRupeesToPaise('abc')).toThrow(/Invalid rupee currency format/);
    expect(() => parseRupeesToPaise('12.345')).toThrow(/Invalid rupee currency format/); // 3 decimals
    expect(() => parseRupeesToPaise('12..34')).toThrow(/Invalid rupee currency format/);
    expect(() => parseRupeesToPaise('$100')).toThrow(/Invalid rupee currency format/);
    expect(() => parseRupeesToPaise('100,00')).toThrow(/Invalid rupee currency format/);
  });

  it('rejects unsafe integer values during format', () => {
    expect(() => formatPaiseAsRupees(NaN)).toThrow(/Invalid paise value/);
    expect(() => formatPaiseAsRupees(Infinity)).toThrow(/Invalid paise value/);
    expect(() => formatPaiseAsRupees(123.45)).toThrow(/Invalid paise value/);
  });
});
