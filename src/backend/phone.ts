/**
 * Canonical phone form used for matching: digits only, with country code, no "+".
 * A bare 10-digit number is assumed to be Indian (+91). Both backends and the SQL
 * side hash exactly this string, so keep them in step.
 */
export function phoneDigits(phone: string): string {
  let d = (phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.length === 10 ? '91' + d : d;
}

export const toE164 = (phone: string): string => '+' + phoneDigits(phone);

export const USERNAME_RE = /^[a-z0-9_]{3,15}$/;
export const cleanHandle = (handle: string): string => (handle || '').trim().replace(/^@/, '').toLowerCase();
