/**
 * Stage 4: Financial Precision & Currency Arithmetic
 *
 * All monetary values across Angular and Electron are represented strictly
 * as signed integer paise (1 INR = 100 paise).
 *
 * Floating-point arithmetic on currency totals is strictly forbidden.
 */

const RUPEE_PATTERN = /^([+-])?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Parse a rupee decimal string into exact signed integer paise.
 *
 * @param rupeeStr Input string (e.g. "123.45", "-50.5", "50", "0.05")
 * @returns Signed integer paise
 * @throws Error on invalid format, excessive decimal places, or unsafe integer
 */
export function parseRupeesToPaise(rupeeStr: string | number): number {
  if (typeof rupeeStr === 'number') {
    if (!Number.isSafeInteger(rupeeStr)) {
      throw new Error(
        `Invalid rupee number: must be a safe integer when passed as number: ${rupeeStr}`
      );
    }
    rupeeStr = String(rupeeStr);
  }

  if (typeof rupeeStr !== 'string') {
    throw new Error('Rupee input must be a string or integer number');
  }

  const trimmed = rupeeStr.trim();
  if (!trimmed) {
    throw new Error('Rupee amount cannot be empty');
  }

  const match = trimmed.match(RUPEE_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid rupee currency format: '${rupeeStr}'. Expected format like '123.45', '50.50', or '-100'.`
    );
  }

  const sign = match[1] === '-' ? -1 : 1;
  const wholePartStr = match[2];
  const fracPartStr = match[3] ?? '';

  // Max 2 decimal digits: pad with trailing zero if single digit, e.g. "5" -> "50"
  const paddedFrac =
    fracPartStr.length === 1 ? fracPartStr + '0' : fracPartStr || '00';

  const wholePaise = BigInt(wholePartStr) * 100n;
  const fracPaise = BigInt(paddedFrac);
  const totalPaiseBig = (wholePaise + fracPaise) * BigInt(sign);

  if (
    totalPaiseBig > BigInt(Number.MAX_SAFE_INTEGER) ||
    totalPaiseBig < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(`Rupee amount '${rupeeStr}' exceeds maximum safe integer limits.`);
  }

  return Number(totalPaiseBig);
}

/**
 * Format signed integer paise as a decimal rupee string with exactly 2 decimal places.
 *
 * @param paise Signed integer paise (e.g. 12345 -> "123.45", -5005 -> "-50.05", 0 -> "0.00")
 * @returns Formatted rupee string
 */
export function formatPaiseAsRupees(paise: number): string {
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Invalid paise value: '${paise}'. Must be a safe integer.`);
  }

  const sign = paise < 0 ? '-' : '';
  const absPaise = Math.abs(paise);

  const whole = Math.floor(absPaise / 100);
  const fraction = absPaise % 100;
  const fracStr = fraction < 10 ? `0${fraction}` : `${fraction}`;

  return `${sign}${whole}.${fracStr}`;
}
