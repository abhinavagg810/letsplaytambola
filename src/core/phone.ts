// "Notify me" numbers: Indian mobile numbers only (10 digits, starting 6–9). Pure, shared by the form and the server.

/** Shown when the number typed is not an Indian mobile number. */
export const BAD_MOBILE = 'Please type a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)';

/**
 * The digits of whatever was typed or pasted, without a leading +91 / 91 / 0 when one was included:
 * "+91 98100-11001", "091 9810011001" and "09810011001" all give "9810011001".
 * Anything else comes back as its digits, unchanged (so a number that is too long stays too long).
 */
export function mobileDigits(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let d = raw.replace(/\D/g, '');
  if (d.length > 10) d = d.replace(/^0+/, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  return d;
}

/** Is this (already cleaned) number an Indian mobile number? */
export function isIndianMobile(digits: string): boolean {
  return /^[6-9][0-9]{9}$/.test(digits);
}
