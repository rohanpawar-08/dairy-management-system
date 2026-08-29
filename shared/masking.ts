/**
 * Stage 4: Privacy & PII Data Masking Utilities
 *
 * Provides deterministic masking for bank account numbers and UPI identifiers
 * to ensure sensitive financial details are not exposed in list views or to Operators.
 */

/**
 * Mask a bank account number to show only the last 4 digits.
 *
 * Examples:
 * - "123456789012" -> "••••••••9012"
 * - "987654321"    -> "•••••4321"
 * - "1234"         -> "••••"
 * - "12"           -> "••••"
 * - "" / null      -> null
 */
export function maskBankAccount(accountNumber?: string | null): string | null {
  if (!accountNumber) {
    return null;
  }

  const clean = accountNumber.trim();
  if (clean.length === 0) {
    return null;
  }

  if (clean.length <= 4) {
    return '••••';
  }

  const unmaskedSuffix = clean.slice(-4);
  const maskedPrefix = '•'.repeat(clean.length - 4);
  return `${maskedPrefix}${unmaskedSuffix}`;
}

/**
 * Mask a UPI identifier while retaining provider handle and boundary recognition.
 *
 * Examples:
 * - "rohanpawar@oksbi" -> "r••••••••r@oksbi"
 * - "ab@upi"          -> "••@upi"
 * - "a@paytm"         -> "•@paytm"
 * - "invalidupi"      -> "••••"
 * - "" / null         -> null
 */
export function maskUpiId(upiId?: string | null): string | null {
  if (!upiId) {
    return null;
  }

  const clean = upiId.trim();
  if (clean.length === 0) {
    return null;
  }

  const atIndex = clean.lastIndexOf('@');
  if (atIndex === -1 || atIndex === 0 || atIndex === clean.length - 1) {
    return '••••';
  }

  const username = clean.slice(0, atIndex);
  const handle = clean.slice(atIndex); // includes '@'

  if (username.length <= 2) {
    return `${'•'.repeat(username.length)}${handle}`;
  }

  const firstChar = username[0];
  const lastChar = username[username.length - 1];
  const maskLength = username.length - 2;

  return `${firstChar}${'•'.repeat(maskLength)}${lastChar}${handle}`;
}
