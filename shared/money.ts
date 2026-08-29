/**
 * Financial Precision, Currency & Milk Arithmetic (Stages 4 & 5)
 *
 * All monetary values across Angular and Electron are represented strictly
 * as signed integer paise (1 INR = 100 paise).
 *
 * Quality values (FAT, SNF) are represented as scaled integers (x100),
 * and milk volume as millilitres (1 Litre = 1000 mL).
 *
 * Floating-point arithmetic on currency totals and rates is strictly forbidden.
 */

const RUPEE_PATTERN = /^([+-])?(\d+)(?:\.(\d{1,2}))?$/;
const PERCENT_PATTERN = /^(\d+)(?:\.(\d{1,2}))?$/;
const LITRE_PATTERN = /^(\d+)(?:\.(\d{1,3}))?$/;

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

/**
 * Parse a percentage string (e.g. FAT "4.2", "4.25", "4") into integer x100 (e.g. 420, 425, 400).
 */
export function parsePercentToX100(percentStr: string | number): number {
  if (typeof percentStr === 'number') {
    percentStr = String(percentStr);
  }

  if (typeof percentStr !== 'string') {
    throw new Error('Percentage input must be a string or number');
  }

  const trimmed = percentStr.trim();
  if (!trimmed) {
    throw new Error('Percentage value cannot be empty');
  }

  const match = trimmed.match(PERCENT_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid percentage format: '${percentStr}'. Expected non-negative format like '4.2' or '8.50' (max 2 decimals).`
    );
  }

  const wholePart = BigInt(match[1]);
  const fracPart = match[2] ?? '';
  const paddedFrac =
    fracPart.length === 1 ? fracPart + '0' : fracPart || '00';

  const totalX100 = wholePart * 100n + BigInt(paddedFrac);
  if (totalX100 > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Percentage '${percentStr}' exceeds safe integer limits.`);
  }

  return Number(totalX100);
}

/**
 * Format scaled percentage (x100) as fixed 2-decimal string (e.g. 400 -> "4.00", 850 -> "8.50").
 */
export function formatX100AsPercent(val: number): string {
  if (!Number.isSafeInteger(val) || val < 0) {
    throw new Error(`Invalid scaled percentage: '${val}'. Must be a non-negative safe integer.`);
  }

  const whole = Math.floor(val / 100);
  const frac = val % 100;
  const fracStr = frac < 10 ? `0${frac}` : `${frac}`;
  return `${whole}.${fracStr}`;
}

/**
 * Parse a volume in litres (e.g. "50", "1.5", "0.250") into integer millilitres (e.g. 50000, 1500, 250).
 */
export function parseLitresToMl(litresStr: string | number): number {
  if (typeof litresStr === 'number') {
    litresStr = String(litresStr);
  }

  if (typeof litresStr !== 'string') {
    throw new Error('Litre volume input must be a string or number');
  }

  const trimmed = litresStr.trim();
  if (!trimmed) {
    throw new Error('Litre volume cannot be empty');
  }

  const match = trimmed.match(LITRE_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid litre format: '${litresStr}'. Expected non-negative format like '50', '1.5', or '0.250' (max 3 decimals).`
    );
  }

  const wholePart = BigInt(match[1]);
  const fracPart = match[2] ?? '';
  let paddedFrac = fracPart;
  while (paddedFrac.length < 3) {
    paddedFrac += '0';
  }

  const totalMl = wholePart * 1000n + BigInt(paddedFrac);
  if (totalMl > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Volume '${litresStr}' exceeds safe integer limits.`);
  }

  return Number(totalMl);
}

/**
 * Format millilitres as fixed 3-decimal litre string (e.g. 50000 -> "50.000", 1500 -> "1.500").
 */
export function formatMlAsLitres(ml: number): string {
  if (!Number.isSafeInteger(ml) || ml < 0) {
    throw new Error(`Invalid millilitre value: '${ml}'. Must be a non-negative safe integer.`);
  }

  const whole = Math.floor(ml / 1000);
  const frac = ml % 1000;
  const fracStr = frac < 10 ? `00${frac}` : frac < 100 ? `0${frac}` : `${frac}`;
  return `${whole}.${fracStr}`;
}

/**
 * Exact BigInt Integer Division with ROUND_HALF_UP.
 *
 * For numerator >= 0 and denominator > 0:
 * If (remainder * 2) >= denominator, rounds up by 1.
 */
export function roundHalfUpBigInt(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new Error('Division by zero in integer arithmetic.');
  }

  const isNegative = (numerator < 0n) !== (denominator < 0n);
  const absNum = numerator < 0n ? -numerator : numerator;
  const absDen = denominator < 0n ? -denominator : denominator;

  const quotient = absNum / absDen;
  const remainder = absNum % absDen;

  const rounded = remainder * 2n >= absDen ? quotient + 1n : quotient;
  return isNegative ? -rounded : rounded;
}

/**
 * Calculate rate in integer paise per litre using the confirmed Stage 5 Formula:
 *
 * rateNumerator = (fat_x100 * fatRatePaisePerPoint) + (snf_x100 * snfRatePaisePerPoint)
 * ratePaisePerLitre = ROUND_HALF_UP(rateNumerator / 100)
 */
export function calculateRatePaisePerLitre(
  fatX100: number,
  snfX100: number,
  fatRatePaisePerPoint: number,
  snfRatePaisePerPoint: number
): number {
  if (
    !Number.isSafeInteger(fatX100) ||
    !Number.isSafeInteger(snfX100) ||
    !Number.isSafeInteger(fatRatePaisePerPoint) ||
    !Number.isSafeInteger(snfRatePaisePerPoint)
  ) {
    throw new Error('All inputs to calculateRatePaisePerLitre must be safe integers.');
  }

  const num =
    BigInt(fatX100) * BigInt(fatRatePaisePerPoint) +
    BigInt(snfX100) * BigInt(snfRatePaisePerPoint);

  const ratePaise = roundHalfUpBigInt(num, 100n);
  if (ratePaise > BigInt(Number.MAX_SAFE_INTEGER) || ratePaise < 0n) {
    throw new Error(`Calculated rate paise per litre out of bounds: ${ratePaise}`);
  }

  return Number(ratePaise);
}

/**
 * Calculate collection amount in integer paise:
 *
 * amountPaise = ROUND_HALF_UP((quantityMl * ratePaisePerLitre) / 1000)
 */
export function calculateCollectionAmountPaise(
  quantityMl: number,
  ratePaisePerLitre: number
): number {
  if (
    !Number.isSafeInteger(quantityMl) ||
    !Number.isSafeInteger(ratePaisePerLitre) ||
    quantityMl < 0 ||
    ratePaisePerLitre < 0
  ) {
    throw new Error('quantityMl and ratePaisePerLitre must be non-negative safe integers.');
  }

  const num = BigInt(quantityMl) * BigInt(ratePaisePerLitre);
  const amountPaise = roundHalfUpBigInt(num, 1000n);

  if (amountPaise > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Calculated collection amount paise out of bounds: ${amountPaise}`);
  }

  return Number(amountPaise);
}
