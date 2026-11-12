// Device tokens: a random UUID made in the browser, sent as the `x-device-token` header.
// The server only ever stores and compares its SHA-256 hash.
import { createHash } from 'node:crypto';

export const TOKEN_HEADER = 'x-device-token';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDeviceToken(v: unknown): v is string {
  return typeof v === 'string' && UUID.test(v);
}

/** SHA-256 of the (lower-cased) token, as 64 hex characters. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token.toLowerCase()).digest('hex');
}

/** The hash of the request's device token, or null when the header is missing or not a UUID. */
export function tokenHashFrom(headers: Headers): string | null {
  const raw = headers.get(TOKEN_HEADER)?.trim();
  return isDeviceToken(raw) ? hashToken(raw) : null;
}
