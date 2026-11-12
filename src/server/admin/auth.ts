// Admin sign-in: one operator, credentials from the environment, a signed session cookie.
// Pure Node (no Next.js imports) so it can be unit-tested; the request glue is in ./guard.ts.
//
//   ADMIN_EMAIL, ADMIN_PASSWORD   both required — if either is missing the admin area is switched off.
//   ADMIN_SESSION_SECRET          optional extra secret for signing sessions.
//
// Nothing here ever logs or returns the email or the password.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { exhausted, hit } from '../rateLimit';
import type { Limit } from '../rateLimit';

export const ADMIN_COOKIE = 'lpt_admin';
/** How long a sign-in lasts. */
export const ADMIN_SESSION_MS = 12 * 60 * 60 * 1000;
/** Brute-force protection: failed sign-ins allowed per address per window. */
export const LOGIN_LIMIT: Limit = { max: 5, windowMs: 15 * 60_000 };
/** Every failed sign-in waits this long before answering. */
export const LOGIN_FAIL_DELAY_MS = 400;
/** The one message for every failed sign-in, whatever was wrong. */
export const LOGIN_ERROR = 'Email or password is not right';
export const LOGIN_TOO_MANY = 'Too many tries — please wait 15 minutes and try again';
/** Used in the signing key when there is no Supabase key (local, in-memory mode). */
const KEY_FALLBACK = 'letsplaytambola-admin-session-v1';

type Env = Record<string, string | undefined>;

export interface AdminConfig { email: string; password: string }

/** The configured credentials, or null when the admin area is switched off (either variable missing or blank). */
export function adminConfig(env: Env = process.env): AdminConfig | null {
  const email = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

export function adminConfigured(env: Env = process.env): boolean {
  return adminConfig(env) !== null;
}

const sha256 = (s: string): Buffer => createHash('sha256').update(s, 'utf8').digest();

/**
 * Constant-time check of an email + password against the configured ones: both sides are hashed with SHA-256
 * and compared with timingSafeEqual; both comparisons always run. The email is compared case-insensitively.
 * False when the admin area is off or anything is missing.
 */
export function checkCredentials(email: unknown, password: unknown, env: Env = process.env): boolean {
  const cfg = adminConfig(env);
  const givenEmail = typeof email === 'string' ? email : '';
  const givenPassword = typeof password === 'string' ? password : '';
  // Compare against something even when the admin is off, so the timing does not tell.
  const emailOk = timingSafeEqual(sha256(givenEmail.trim().toLowerCase()), sha256((cfg?.email ?? '\u0000off').toLowerCase()));
  const passwordOk = timingSafeEqual(sha256(givenPassword), sha256(cfg?.password ?? '\u0000off'));
  return cfg !== null && typeof email === 'string' && typeof password === 'string' && emailOk && passwordOk;
}

/**
 * The key that signs sessions: SHA-256 of ADMIN_SESSION_SECRET (when set) or the Supabase service key
 * (or a constant in memory mode), always together with ADMIN_PASSWORD — so changing the password
 * signs everyone out. Null when the admin area is off.
 */
export function sessionKey(env: Env = process.env): Buffer | null {
  const cfg = adminConfig(env);
  if (!cfg) return null;
  const secret = env.ADMIN_SESSION_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || KEY_FALLBACK;
  return sha256(`${cfg.password}:${secret}`);
}

const b64 = (b: Buffer | string): string => Buffer.from(b).toString('base64url');
const sign = (payload: string, key: Buffer): Buffer => createHmac('sha256', key).update(payload).digest();

/** A new session token: base64url({ exp }) + "." + base64url(HMAC-SHA256). Null when the admin area is off. */
export function createSessionToken(now: number = Date.now(), env: Env = process.env): string | null {
  const key = sessionKey(env);
  if (!key) return null;
  const payload = b64(JSON.stringify({ exp: now + ADMIN_SESSION_MS }));
  return `${payload}.${b64(sign(payload, key))}`;
}

/** The session's expiry time when the token is ours and still valid; otherwise null. */
export function verifySessionToken(token: unknown, now: number = Date.now(), env: Env = process.env): { exp: number } | null {
  const key = sessionKey(env);
  if (!key || typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot !== token.lastIndexOf('.')) return null;
  const payload = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1), 'base64url');
  const expected = sign(payload, key);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const exp = (data as { exp?: unknown } | null)?.exp;
    if (typeof exp !== 'number' || !Number.isFinite(exp) || exp <= now || exp > now + ADMIN_SESSION_MS + 60_000) return null;
    return { exp };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- brute-force protection
// The shared in-memory limiter (src/server/rateLimit.ts), counting only FAILED attempts per address.
// It deliberately ignores RATE_LIMIT_DISABLED. Requests with no known address share one bucket.

const loginKey = (ip: string | null): string => `admin-login:i:${ip || 'unknown'}`;

/** True when this address has used up its failed attempts for the current window. */
export function loginBlocked(ip: string | null, now: number = Date.now()): boolean {
  return exhausted(loginKey(ip), LOGIN_LIMIT, now);
}

/** Count one failed attempt for this address. */
export function recordLoginFailure(ip: string | null, now: number = Date.now()): void {
  hit(loginKey(ip), LOGIN_LIMIT, now);
}

export type LoginResult =
  | { ok: true; token: string; maxAgeSeconds: number }
  | { ok: false; status: 401 | 404 | 429; error: string };

/** The whole sign-in decision, without the HTTP parts. (The route adds the delay on failure.) */
export function attemptLogin(email: unknown, password: unknown, ip: string | null, now: number = Date.now(), env: Env = process.env): LoginResult {
  if (!adminConfigured(env)) return { ok: false, status: 404, error: 'Not found' };
  if (loginBlocked(ip, now)) return { ok: false, status: 429, error: LOGIN_TOO_MANY };
  if (!checkCredentials(email, password, env)) {
    recordLoginFailure(ip, now);
    return { ok: false, status: 401, error: LOGIN_ERROR };
  }
  return { ok: true, token: createSessionToken(now, env)!, maxAgeSeconds: Math.floor(ADMIN_SESSION_MS / 1000) };
}

// ---------------------------------------------------------------- CSRF checks for state-changing admin requests

/** The body is declared as JSON (a plain HTML form cannot send that). */
export function isJsonRequest(request: Request): boolean {
  return /^application\/json\b/i.test(request.headers.get('content-type') ?? '');
}

/**
 * The request's Origin header names this site: the host the request was sent to, or NEXT_PUBLIC_SITE_URL.
 * A missing Origin is refused (browsers always send it on a POST made by a page).
 */
export function sameOrigin(request: Request, env: Env = process.env): boolean {
  const host = (v: string | null | undefined): string | null => {
    if (!v) return null;
    try { return new URL(v).host.toLowerCase(); } catch { return null; }
  };
  const origin = host(request.headers.get('origin'));
  if (!origin) return false;
  const allowed = new Set<string>();
  const sentTo = request.headers.get('host')?.trim().toLowerCase();
  if (sentTo) allowed.add(sentTo);
  const site = host(env.NEXT_PUBLIC_SITE_URL);
  if (site) allowed.add(site);
  return allowed.has(origin);
}
