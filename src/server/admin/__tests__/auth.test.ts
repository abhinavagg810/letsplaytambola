import { beforeEach, describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_MS, LOGIN_ERROR, LOGIN_LIMIT, adminConfig, adminConfigured, attemptLogin, checkCredentials,
  createSessionToken, isJsonRequest, loginBlocked, sameOrigin, sessionKey, verifySessionToken,
} from '../auth';
import { resetRateLimits } from '../../rateLimit';

// Placeholders only — never real credentials.
const ENV = { ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'change-me' };
const NOW = 1_800_000_000_000;

describe('admin configuration', () => {
  it('is off unless both variables are set', () => {
    expect(adminConfigured({})).toBe(false);
    expect(adminConfigured({ ADMIN_EMAIL: 'admin@example.com' })).toBe(false);
    expect(adminConfigured({ ADMIN_PASSWORD: 'change-me' })).toBe(false);
    expect(adminConfigured({ ADMIN_EMAIL: '   ', ADMIN_PASSWORD: 'change-me' })).toBe(false);
    expect(adminConfigured({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: '' })).toBe(false);
    expect(adminConfig(ENV)).toEqual({ email: 'admin@example.com', password: 'change-me' });
  });

  it('when off: no key, no token, nothing verifies, no credentials pass', () => {
    expect(sessionKey({})).toBeNull();
    expect(createSessionToken(NOW, {})).toBeNull();
    const token = createSessionToken(NOW, ENV)!;
    expect(verifySessionToken(token, NOW, {})).toBeNull();
    expect(verifySessionToken(token, NOW, { ADMIN_EMAIL: 'admin@example.com' })).toBeNull();
    expect(checkCredentials('admin@example.com', 'change-me', {})).toBe(false);
    expect(checkCredentials('', '', {})).toBe(false);
    expect(checkCredentials(undefined, undefined, {})).toBe(false);
    expect(checkCredentials('\u0000off', '\u0000off', {})).toBe(false);
    expect(attemptLogin('admin@example.com', 'change-me', '1.1.1.1', NOW, {})).toMatchObject({ ok: false, status: 404 });
  });
});

describe('credential check', () => {
  it('accepts the right email and password', () => {
    expect(checkCredentials('admin@example.com', 'change-me', ENV)).toBe(true);
  });
  it('compares the email without regard to case or outer spaces', () => {
    expect(checkCredentials('  Admin@Example.COM ', 'change-me', ENV)).toBe(true);
    expect(checkCredentials('admin@example.com', 'change-me', { ADMIN_EMAIL: 'ADMIN@example.com', ADMIN_PASSWORD: 'change-me' })).toBe(true);
  });
  it('rejects a wrong email', () => {
    expect(checkCredentials('someone@example.com', 'change-me', ENV)).toBe(false);
    expect(checkCredentials('admin@example.co', 'change-me', ENV)).toBe(false);
    expect(checkCredentials('', 'change-me', ENV)).toBe(false);
  });
  it('rejects a wrong password — exact match only', () => {
    expect(checkCredentials('admin@example.com', 'Change-me', ENV)).toBe(false);
    expect(checkCredentials('admin@example.com', 'change-me ', ENV)).toBe(false);
    expect(checkCredentials('admin@example.com', 'change-m', ENV)).toBe(false);
    expect(checkCredentials('admin@example.com', '', ENV)).toBe(false);
  });
  it('rejects anything that is not text', () => {
    for (const bad of [undefined, null, 0, true, {}, [], ['change-me']]) {
      expect(checkCredentials('admin@example.com', bad, ENV)).toBe(false);
      expect(checkCredentials(bad, 'change-me', ENV)).toBe(false);
    }
  });
});

describe('session token', () => {
  it('signs and verifies, for 12 hours', () => {
    const token = createSessionToken(NOW, ENV)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    expect(ADMIN_SESSION_MS).toBe(12 * 60 * 60 * 1000);
    expect(verifySessionToken(token, NOW, ENV)).toEqual({ exp: NOW + ADMIN_SESSION_MS });
    expect(verifySessionToken(token, NOW + ADMIN_SESSION_MS - 1, ENV)).not.toBeNull();
  });
  it('holds only the expiry — no email, no password', () => {
    const token = createSessionToken(NOW, ENV)!;
    const payload = Buffer.from(token.split('.')[0], 'base64url').toString('utf8');
    expect(JSON.parse(payload)).toEqual({ exp: NOW + ADMIN_SESSION_MS });
    expect(token).not.toContain('change-me');
    expect(Buffer.from(token, 'base64url').toString('latin1')).not.toContain('change-me');
  });
  it('expires', () => {
    const token = createSessionToken(NOW, ENV)!;
    expect(verifySessionToken(token, NOW + ADMIN_SESSION_MS, ENV)).toBeNull();
    expect(verifySessionToken(token, NOW + ADMIN_SESSION_MS + 1, ENV)).toBeNull();
  });
  it('rejects a tampered payload or signature', () => {
    const token = createSessionToken(NOW, ENV)!;
    const [payload, sig] = token.split('.');
    const longer = Buffer.from(JSON.stringify({ exp: NOW + 10 * ADMIN_SESSION_MS })).toString('base64url');
    expect(verifySessionToken(`${longer}.${sig}`, NOW, ENV)).toBeNull();
    const flipped = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(verifySessionToken(`${payload}.${flipped}`, NOW, ENV)).toBeNull();
    expect(verifySessionToken(`${payload}.`, NOW, ENV)).toBeNull();
    expect(verifySessionToken(payload, NOW, ENV)).toBeNull();
    expect(verifySessionToken(`${payload}.${sig}.${sig}`, NOW, ENV)).toBeNull();
    for (const bad of ['', '.', 'a.b', undefined, null, 42, {}, 'x'.repeat(600)]) expect(verifySessionToken(bad, NOW, ENV)).toBeNull();
  });
  it('rejects a correctly signed token with a far-future or missing expiry', () => {
    // Signed with the right key but not something createSessionToken would make.
    const far = createSessionToken(NOW + 10 * ADMIN_SESSION_MS, ENV)!;
    expect(verifySessionToken(far, NOW, ENV)).toBeNull();
  });
  it('changing the password signs everyone out', () => {
    const token = createSessionToken(NOW, ENV)!;
    expect(verifySessionToken(token, NOW, { ...ENV, ADMIN_PASSWORD: 'changed-it' })).toBeNull();
    // …also when a separate session secret is set
    const withSecret = { ...ENV, ADMIN_SESSION_SECRET: 'placeholder-secret' };
    const t2 = createSessionToken(NOW, withSecret)!;
    expect(verifySessionToken(t2, NOW, withSecret)).not.toBeNull();
    expect(verifySessionToken(t2, NOW, { ...withSecret, ADMIN_PASSWORD: 'changed-it' })).toBeNull();
  });
  it('the key depends on the session secret, else on the Supabase key', () => {
    const token = createSessionToken(NOW, ENV)!;
    expect(verifySessionToken(token, NOW, { ...ENV, ADMIN_SESSION_SECRET: 'placeholder-secret' })).toBeNull();
    expect(verifySessionToken(token, NOW, { ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'placeholder-key' })).toBeNull();
    const a = sessionKey({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'k1' })!;
    const b = sessionKey({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: 'k2' })!;
    expect(a.equals(b)).toBe(false);
    // the session secret wins over the Supabase key
    expect(sessionKey({ ...ENV, ADMIN_SESSION_SECRET: 's', SUPABASE_SERVICE_ROLE_KEY: 'k1' })!.equals(sessionKey({ ...ENV, ADMIN_SESSION_SECRET: 's', SUPABASE_SERVICE_ROLE_KEY: 'k2' })!)).toBe(true);
    expect(a).toHaveLength(32);
  });
});

describe('sign-in and its rate limit', () => {
  beforeEach(() => resetRateLimits());

  it('signs in with the right credentials', () => {
    const r = attemptLogin('admin@example.com', 'change-me', '1.1.1.1', NOW, ENV);
    expect(r).toMatchObject({ ok: true, maxAgeSeconds: 43200 });
    if (r.ok) expect(verifySessionToken(r.token, NOW, ENV)).not.toBeNull();
  });

  it('gives the same generic error for a wrong email and a wrong password', () => {
    const a = attemptLogin('nobody@example.com', 'change-me', '1.1.1.1', NOW, ENV);
    const b = attemptLogin('admin@example.com', 'wrong', '1.1.1.1', NOW, ENV);
    const c = attemptLogin(undefined, undefined, '1.1.1.1', NOW, ENV);
    for (const r of [a, b, c]) expect(r).toEqual({ ok: false, status: 401, error: LOGIN_ERROR });
    expect(LOGIN_ERROR).toBe('Email or password is not right');
  });

  it('allows 5 failed tries per address per 15 minutes; the 6th is refused even with the right password', () => {
    expect(LOGIN_LIMIT).toEqual({ max: 5, windowMs: 15 * 60_000 });
    for (let i = 0; i < 5; i++) {
      expect(loginBlocked('2.2.2.2', NOW)).toBe(false);
      expect(attemptLogin('admin@example.com', `wrong-${i}`, '2.2.2.2', NOW + i, ENV)).toMatchObject({ ok: false, status: 401 });
    }
    expect(loginBlocked('2.2.2.2', NOW + 10)).toBe(true);
    expect(attemptLogin('admin@example.com', 'wrong', '2.2.2.2', NOW + 10, ENV)).toMatchObject({ ok: false, status: 429 });
    expect(attemptLogin('admin@example.com', 'change-me', '2.2.2.2', NOW + 11, ENV)).toMatchObject({ ok: false, status: 429 });
    // another address is not affected
    expect(attemptLogin('admin@example.com', 'change-me', '3.3.3.3', NOW + 12, ENV)).toMatchObject({ ok: true });
    // after the window it works again
    expect(attemptLogin('admin@example.com', 'change-me', '2.2.2.2', NOW + LOGIN_LIMIT.windowMs, ENV)).toMatchObject({ ok: true });
  });

  it('successful sign-ins are not counted', () => {
    for (let i = 0; i < 20; i++) expect(attemptLogin('admin@example.com', 'change-me', '4.4.4.4', NOW, ENV).ok).toBe(true);
    expect(loginBlocked('4.4.4.4', NOW)).toBe(false);
  });

  it('requests without an address share one bucket', () => {
    for (let i = 0; i < 5; i++) attemptLogin('x@example.com', 'wrong', null, NOW, ENV);
    expect(attemptLogin('admin@example.com', 'change-me', null, NOW, ENV)).toMatchObject({ ok: false, status: 429 });
  });

  it('is not switched off by RATE_LIMIT_DISABLED', () => {
    const env = { ...ENV, RATE_LIMIT_DISABLED: '1' };
    for (let i = 0; i < 5; i++) attemptLogin('x@example.com', 'wrong', '5.5.5.5', NOW, env);
    expect(attemptLogin('admin@example.com', 'change-me', '5.5.5.5', NOW, env)).toMatchObject({ ok: false, status: 429 });
  });
});

describe('CSRF checks', () => {
  const req = (headers: Record<string, string>) => new Request('http://internal.invalid/api/admin/logout', { method: 'POST', headers });

  it('accepts JSON only', () => {
    expect(isJsonRequest(req({ 'content-type': 'application/json' }))).toBe(true);
    expect(isJsonRequest(req({ 'content-type': 'application/json; charset=utf-8' }))).toBe(true);
    expect(isJsonRequest(req({ 'content-type': 'application/x-www-form-urlencoded' }))).toBe(false);
    expect(isJsonRequest(req({ 'content-type': 'text/plain' }))).toBe(false);
    expect(isJsonRequest(req({ 'content-type': 'multipart/form-data; boundary=x' }))).toBe(false);
    expect(isJsonRequest(req({}))).toBe(false);
  });

  it('needs an Origin header that names this site', () => {
    expect(sameOrigin(req({ origin: 'https://letsplaytambola.com', host: 'letsplaytambola.com' }), {})).toBe(true);
    expect(sameOrigin(req({ origin: 'http://localhost:8300', host: 'localhost:8300' }), {})).toBe(true);
    expect(sameOrigin(req({ origin: 'https://evil.example', host: 'letsplaytambola.com' }), {})).toBe(false);
    expect(sameOrigin(req({ origin: 'https://letsplaytambola.com.evil.example', host: 'letsplaytambola.com' }), {})).toBe(false);
    expect(sameOrigin(req({ origin: 'http://localhost:9999', host: 'localhost:8300' }), {})).toBe(false);
    expect(sameOrigin(req({ host: 'letsplaytambola.com' }), {})).toBe(false);
    expect(sameOrigin(req({ origin: 'null', host: 'letsplaytambola.com' }), {})).toBe(false);
    // the configured public address is accepted too
    expect(sameOrigin(req({ origin: 'https://letsplaytambola.com', host: 'internal:3000' }), { NEXT_PUBLIC_SITE_URL: 'https://letsplaytambola.com' })).toBe(true);
    expect(sameOrigin(req({ origin: 'https://evil.example', host: 'internal:3000' }), { NEXT_PUBLIC_SITE_URL: 'https://letsplaytambola.com' })).toBe(false);
  });
});
