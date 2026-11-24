// The contact form: validation (src/lib/contact.ts), POST /api/contact (src/server/contact.ts + the route), the memory store
// (save, list, read/unread, delete + audit, 90-day purge), the admin actions (POST /api/admin/messages) and the CSV export.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = new Map<string, string>();
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { name: k, value: jar.get(k) } : undefined) }) }));
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (fn: () => unknown) => void fn(), connection: async () => undefined }));

import { CONTACT_COPY, CONTACT_LIMITS, cleanLine, cleanMessage, cleanPage, honeypotFilled, isReplyTo, validateContact } from '@/lib/contact';
import { CONTACT_EMAIL, contactEmail, CONTACT_EMAIL_PLACEHOLDER } from '@/lib/site';
import { POST as contactRoute } from '@/app/api/contact/route';
import { POST as messagesRoute } from '@/app/api/admin/messages/route';
import { GET as messagesCsv } from '@/app/api/admin/messages.csv/route';
import { MESSAGE_CSV_HEAD, messageCsvRow, parseMessagesFilter } from '../admin/messages';
import { csv } from '../admin/stats';
import { ADMIN_COOKIE, createSessionToken } from '../admin/auth';
import { CONTACT_COPY_SERVER, handleContact } from '../contact';
import { requestContext } from '../insights/record';
import { resetRateLimits } from '../rateLimit';
import { ADMIN_RETENTION_MS, getStore } from '../store';
import type { GameStore } from '../store';
import { MemoryStore, getMemoryStore } from '../store/memory';

const ch = (...codes: number[]): string => String.fromCharCode(...codes);
const TOKEN = '11111111-2222-4333-8444-555555555555';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const HOSTILE = '<img src=x onerror=alert(1)>';
const good = { name: 'Kamla', replyTo: 'kamla@example.com', topic: 'help', message: 'The game froze after number 42.' };

function req(body: unknown, opts: { headers?: Record<string, string>; raw?: string; ip?: string; token?: string | null } = {}): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000', 'user-agent': UA,
    'x-forwarded-for': opts.ip ?? '49.36.10.1', 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'DL', 'x-vercel-ip-city': 'New%20Delhi',
    ...(opts.token === null ? {} : { 'x-device-token': opts.token ?? TOKEN }),
    ...opts.headers,
  };
  return new Request('http://localhost:3000/api/contact', { method: 'POST', headers, body: opts.raw ?? JSON.stringify(body) });
}

beforeEach(() => resetRateLimits());
afterEach(() => {
  jar.clear();
  delete process.env.ADMIN_EMAIL;
  delete process.env.ADMIN_PASSWORD;
});

describe('the contact email', () => {
  it('comes from NEXT_PUBLIC_CONTACT_EMAIL, else the placeholder', () => {
    expect(contactEmail('team@example.in')).toBe('team@example.in');
    expect(contactEmail('  team@example.in  ')).toBe('team@example.in');
    for (const bad of [undefined, '', 'not an email', 'a@b', `x@y.com${HOSTILE}`]) expect(contactEmail(bad)).toBe(CONTACT_EMAIL_PLACEHOLDER);
    expect(CONTACT_EMAIL).toBe(CONTACT_EMAIL_PLACEHOLDER); // not set in tests
  });
});

describe('validateContact', () => {
  it('accepts a normal message and trims every field', () => {
    const r = validateContact({ ...good, name: '  Kamla  Mausi ', replyTo: ' 98100 12345 ', message: '  Hello there, the game froze.  ', page: '/how-to-play?x=1#y' });
    expect(r).toEqual({ ok: true, value: { topic: 'help', name: 'Kamla Mausi', replyTo: '98100 12345', message: 'Hello there, the game froze.', page: '/how-to-play' } });
  });

  it('name and reply-to are optional; empty becomes null', () => {
    const r = validateContact({ topic: 'feedback', message: 'Lovely game, thank you!' });
    expect(r.ok && r.value).toMatchObject({ name: null, replyTo: null, page: null });
  });

  it('checks every limit', () => {
    const errs = (b: Record<string, unknown>) => (validateContact({ ...good, ...b }) as { errors: Record<string, string> }).errors;
    expect(errs({ name: 'n'.repeat(CONTACT_LIMITS.name + 1) }).name).toBe(CONTACT_COPY.name);
    expect(validateContact({ ...good, name: 'n'.repeat(CONTACT_LIMITS.name) }).ok).toBe(true);
    expect(errs({ replyTo: `${'a'.repeat(75)}@ex.com` }).replyTo).toBe(CONTACT_COPY.replyToLong);
    expect(errs({ replyTo: 'call me maybe' }).replyTo).toBe(CONTACT_COPY.replyTo);
    expect(errs({ topic: 'money' }).topic).toBe(CONTACT_COPY.topic);
    expect(errs({ topic: undefined }).topic).toBe(CONTACT_COPY.topic);
    expect(errs({ message: 'too short' }).message).toBe(CONTACT_COPY.messageShort);
    expect(errs({ message: `   ${'x'.repeat(5)}   ` }).message).toBe(CONTACT_COPY.messageShort);
    expect(errs({ message: 'x'.repeat(CONTACT_LIMITS.messageMax + 1) }).message).toBe(CONTACT_COPY.messageLong);
    expect(validateContact({ ...good, message: 'x'.repeat(CONTACT_LIMITS.messageMax) }).ok).toBe(true);
    // emoji count as one character each
    expect(validateContact({ ...good, message: '🎉'.repeat(CONTACT_LIMITS.messageMax) }).ok).toBe(true);
    expect(errs({ name: 42, message: ['x'] }).message).toBe(CONTACT_COPY.messageShort);
  });

  it('loosely checks the reply-to', () => {
    for (const ok of ['kamla@example.com', 'a.b+c@mail.co.in', '9810012345', '+91 98100-12345', '(011) 2345 6789']) expect(isReplyTo(ok)).toBe(true);
    for (const bad of ['kamla@', '@x.com', 'kamla@example', '12345', '+91', 'abc 123456789', '1'.repeat(16), `${HOSTILE}@x.com`]) expect(isReplyTo(bad)).toBe(false);
  });

  it('strips control, zero-width and direction characters; keeps new lines in the message', () => {
    const dirty = `Ka${ch(0)}m${ch(0x200b)}la${ch(0x202e)}${ch(7)}`;
    expect(cleanLine(dirty)).toBe('Kamla');
    expect(cleanLine(`a${ch(10)}b${ch(9)}c`)).toBe('a b c');
    expect(cleanMessage(`Line one${ch(13, 10)}Line two${ch(10, 10, 10, 10)}Line three${ch(27)}[31m${ch(0xfeff)}`)).toBe(`Line one${ch(10)}Line two${ch(10, 10)}Line three[31m`);
    expect(cleanMessage(`half ${ch(0xd83c)} emoji is dropped`)).toBe('half  emoji is dropped');
    const r = validateContact({ ...good, name: `${ch(0x200b, 0x200b)}` });
    expect(r.ok && r.value.name).toBe(null);
  });

  it('keeps hostile strings as plain text (they are escaped when shown) and never changes their meaning', () => {
    const r = validateContact({ ...good, name: HOSTILE, message: `=HYPERLINK("http://evil")${HOSTILE}` });
    expect(r.ok && r.value).toMatchObject({ name: HOSTILE, message: `=HYPERLINK("http://evil")${HOSTILE}` });
  });

  it('cleans the page it came from', () => {
    expect(cleanPage('/ways-to-win#top-line')).toBe('/ways-to-win');
    expect(cleanPage('/g/K7RQ2')).toBe('/g/code');
    for (const bad of ['https://evil.com/', '//evil.com', 'javascript:alert(1)', `/${'a'.repeat(100)}`, '/a b', 42]) expect(cleanPage(bad)).toBeNull();
  });

  it('spots a filled honeypot', () => {
    expect(honeypotFilled({ website: 'http://spam' })).toBe(true);
    expect(honeypotFilled({ website: 'x' })).toBe(true);
    expect(honeypotFilled({ website: '' })).toBe(false);
    expect(honeypotFilled({ website: '   ' })).toBe(false);
    expect(honeypotFilled({})).toBe(false);
  });
});

describe('POST /api/contact', () => {
  const store = () => getMemoryStore();
  const count = () => store().contactRows.length;

  it('stores a valid message with the IP, place and device from the headers', async () => {
    const before = count();
    const res = await contactRoute(req({ ...good, page: '/how-to-play', ip: '1.2.3.4', country: 'US' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(await res.json()).toEqual({ ok: true });
    expect(count()).toBe(before + 1);
    const row = store().contactRows.at(-1)!;
    expect(row).toMatchObject({ topic: 'help', name: 'Kamla', replyTo: 'kamla@example.com', page: '/how-to-play', readAt: null });
    expect(row.ctx).toMatchObject({ ip: '49.36.10.1', country: 'IN', region: 'DL', city: 'New Delhi', deviceType: 'phone', os: 'Android' });
    expect(row.ctx.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('a filled honeypot pretends success and stores nothing — even when the rest is junk', async () => {
    const before = count();
    for (const body of [{ ...good, website: 'http://spam.example' }, { website: 'x', message: '' }]) {
      const res = await contactRoute(req(body));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(count()).toBe(before);
  });

  it('answers field errors with fixed sentences and never echoes the input', async () => {
    const res = await contactRoute(req({ name: HOSTILE.repeat(5), replyTo: HOSTILE, topic: 'evil', message: HOSTILE.slice(0, 5) }));
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).not.toContain('onerror');
    expect(text).not.toContain('evil');
    expect(JSON.parse(text)).toEqual({ ok: false, code: 'invalid', error: 'Please check the form', fields: { name: CONTACT_COPY.name, replyTo: CONTACT_COPY.replyTo, topic: CONTACT_COPY.topic, message: CONTACT_COPY.messageShort } });
  });

  it('refuses a body that is not JSON, not an object, or over 8 KB', async () => {
    expect((await contactRoute(req(null, { raw: 'name=Kamla' }))).status).toBe(400);
    expect((await contactRoute(req(null, { raw: '[1,2]' }))).status).toBe(400);
    expect((await contactRoute(req(null, { raw: '"text"' }))).status).toBe(400);
    const big = await contactRoute(req({ ...good, message: 'x'.repeat(9000) }));
    expect(big.status).toBe(413);
    expect((await big.json()).error).toBe(CONTACT_COPY_SERVER.tooBig);
    // 8 KB in BYTES: 3,000 Hindi letters are 9,000 bytes
    expect((await contactRoute(req({ ...good, message: 'क'.repeat(3000) }))).status).toBe(413);
  });

  it('accepts JSON only, from this site only', async () => {
    expect((await contactRoute(req(good, { headers: { 'content-type': 'text/plain' } }))).status).toBe(415);
    expect((await contactRoute(req(good, { headers: { 'content-type': 'application/x-www-form-urlencoded' } }))).status).toBe(415);
    expect((await contactRoute(req(good, { headers: { origin: 'https://evil.example' } }))).status).toBe(403);
    const noOrigin = req(good);
    noOrigin.headers.delete('origin');
    expect((await contactRoute(noOrigin)).status).toBe(403);
  });

  it('rate limits per device (5 an hour) and per address (20 an hour)', async () => {
    for (let i = 0; i < 5; i++) expect((await contactRoute(req(good, { ip: '10.0.0.1' }))).status).toBe(200);
    const sixth = await contactRoute(req(good, { ip: '10.0.0.2' }));
    expect(sixth.status).toBe(429);
    expect((await sixth.json()).error).toBe(CONTACT_COPY_SERVER.tooMany);
    resetRateLimits();
    let last = 0;
    for (let i = 0; i < 21; i++) last = (await contactRoute(req(good, { ip: '10.0.0.3', token: `11111111-2222-4333-8444-${String(i).padStart(12, '0')}` }))).status;
    expect(last).toBe(429);
    resetRateLimits();
    for (let i = 0; i < 20; i++) await contactRoute(req(good, { ip: '10.0.0.4', token: null }));
    expect((await contactRoute(req(good, { ip: '10.0.0.4', token: null }))).status).toBe(429);
  });

  it('before migration 0004 (store says missing): 503 with the email address, nothing pretended', async () => {
    const missing = { saveContactMessage: async () => 'missing' as const } as unknown as GameStore;
    const r = await handleContact(req(good), { store: missing });
    expect(r).toMatchObject({ ok: false, status: 503, code: 'unavailable' });
    expect(!r.ok && r.error).toContain(CONTACT_EMAIL);
    const broken = { saveContactMessage: async () => { throw new Error('db down'); } } as unknown as GameStore;
    const r2 = await handleContact(req(good), { store: broken });
    expect(r2).toMatchObject({ ok: false, status: 500, code: 'server' });
    expect(!r2.ok && r2.error).toContain(CONTACT_EMAIL);
  });
});

describe('memory store: contact messages', () => {
  const ctx = (tokenHash: string | null) => ({ ...requestContext(new Headers({ 'user-agent': UA, 'x-forwarded-for': '49.36.1.2', 'x-vercel-ip-city': 'Delhi', 'x-vercel-ip-country': 'IN' }), tokenHash), lat: 28.6 });

  it('lists newest first, filters, searches, marks read / unread, deletes with an audit line, and purges after 90 days', async () => {
    let now = Date.UTC(2026, 10, 1);
    const store = new MemoryStore(undefined, () => now);
    await store.saveContactMessage(ctx('a'.repeat(64)), { topic: 'help', name: HOSTILE, replyTo: 'kamla@example.com', message: 'The game froze at 42', page: '/' });
    now += 1000;
    await store.saveContactMessage(ctx(null), { topic: 'remove', name: null, replyTo: null, message: '=cmd|calc please remove me', page: null });
    now += 1000;
    await store.saveContactMessage(ctx(null), { topic: 'feedback', name: 'Ravi', replyTo: null, message: 'Lovely, thank you all', page: '/about' });

    const all = await store.adminListContactMessages({ limit: 10, offset: 0 });
    expect(all.total).toBe(3);
    expect(all.unread).toBe(3);
    expect(all.rows.map((r) => r.topic)).toEqual(['feedback', 'remove', 'help']);
    const help = all.rows[2];
    expect(help).toMatchObject({ name: HOSTILE, device: 'aaaaaaaa', city: 'Delhi', country: 'IN', deviceType: 'phone', ip: '49.36.1.2', readAt: null });
    // the admin view carries no full hash, no raw user agent and no coordinates
    expect(JSON.stringify(all)).not.toContain('a'.repeat(64));
    expect(JSON.stringify(all)).not.toContain('Pixel 8');
    expect(Object.keys(help)).not.toContain('lat');

    expect((await store.adminListContactMessages({ limit: 10, offset: 0, topic: 'remove' })).rows).toHaveLength(1);
    expect((await store.adminListContactMessages({ limit: 10, offset: 0, search: 'FROZE' })).rows[0].topic).toBe('help');
    expect((await store.adminListContactMessages({ limit: 10, offset: 0, search: 'kamla@' })).total).toBe(1);
    expect((await store.adminListContactMessages({ limit: 1, offset: 1 })).rows[0].topic).toBe('remove');

    expect(await store.adminSetContactRead(help.id, true)).toBe(true);
    expect(await store.adminCountUnreadContact()).toBe(2);
    expect((await store.adminListContactMessages({ limit: 10, offset: 0, status: 'read' })).rows.map((r) => r.id)).toEqual([help.id]);
    expect(await store.adminSetContactRead(help.id, false)).toBe(true);
    expect(await store.adminCountUnreadContact()).toBe(3);
    expect(await store.adminSetContactRead(999, true)).toBe(false);

    const remove = all.rows[1];
    expect(await store.adminDeleteContactMessage(remove.id)).toBe(true);
    expect(await store.adminDeleteContactMessage(remove.id)).toBe(false);
    const audit = await store.listAudit(10);
    expect(audit[0]).toMatchObject({ action: 'delete_message', target: String(remove.id), detail: { topic: 'remove' } });
    expect(JSON.stringify(audit)).not.toContain('calc');

    now += ADMIN_RETENTION_MS - 1500; // the first message is now just over 90 days old, the third just under
    await store.purge();
    expect((await store.adminListContactMessages({ limit: 10, offset: 0 })).rows.map((r) => r.topic)).toEqual(['feedback']);
  });
});

describe('Admin → Messages: actions and export', () => {
  const adminReq = (body: unknown, headers: Record<string, string> = {}) =>
    new Request('http://localhost:3000/api/admin/messages', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000', ...headers }, body: JSON.stringify(body) });
  const signIn = () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'test-password-123';
    jar.set(ADMIN_COOKIE, createSessionToken()!);
  };
  const newest = async () => (await getStore().adminListContactMessages({ limit: 1, offset: 0 })).rows[0];

  it('is switched off (404) without admin settings, and needs the session (401)', async () => {
    expect((await messagesRoute(adminReq({ action: 'read', id: 1 }))).status).toBe(404);
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'test-password-123';
    expect((await messagesRoute(adminReq({ action: 'read', id: 1 }))).status).toBe(401);
    expect((await messagesCsv(new Request('http://localhost:3000/api/admin/messages.csv'))).status).toBe(401);
  });

  it('refuses another origin and non-JSON (CSRF), and bad input', async () => {
    signIn();
    expect((await messagesRoute(adminReq({ action: 'read', id: 1 }, { origin: 'https://evil.example' }))).status).toBe(403);
    expect((await messagesRoute(adminReq({ action: 'read', id: 1 }, { 'content-type': 'text/plain' }))).status).toBe(415);
    expect((await messagesRoute(adminReq({ action: 'drop', id: 1 }))).status).toBe(400);
    expect((await messagesRoute(adminReq({ action: 'read', id: '1' }))).status).toBe(400);
    expect((await messagesRoute(adminReq({ action: 'read', id: 99999999 }))).status).toBe(404);
  });

  it('marks read / unread and deletes', async () => {
    signIn();
    await contactRoute(req({ ...good, name: HOSTILE, message: '=SUM(A1:A9) ' + HOSTILE }, { ip: '10.9.9.9', token: '99999999-2222-4333-8444-555555555555' }));
    const m = await newest();
    expect(m.readAt).toBeNull();
    expect((await messagesRoute(adminReq({ action: 'read', id: m.id }))).status).toBe(200);
    expect((await newest()).readAt).not.toBeNull();
    expect((await messagesRoute(adminReq({ action: 'unread', id: m.id }))).status).toBe(200);
    expect((await newest()).readAt).toBeNull();

    // CSV: every typed cell defused, header row first, no-store
    const res = await messagesCsv(new Request('http://localhost:3000/api/admin/messages.csv?topic=help'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const text = await res.text();
    expect(text.split('\r\n')[0]).toBe(MESSAGE_CSV_HEAD.join(','));
    expect(text).toContain(`'=SUM(A1:A9)`);
    expect(text).not.toMatch(/(^|,)=SUM/m);

    expect((await messagesRoute(adminReq({ action: 'delete', id: m.id }))).status).toBe(200);
    expect((await getStore().adminListContactMessages({ limit: 100, offset: 0 })).rows.some((r) => r.id === m.id)).toBe(false);
    expect((await messagesRoute(adminReq({ action: 'delete', id: m.id }))).status).toBe(404);
  });

  it('defuses formulas in every typed column of the export', () => {
    const row = messageCsvRow({
      id: 1, createdAt: 0, topic: 'help', name: '=1+1', replyTo: '+91 98100 12345', message: '@SUM(1)', page: '/', readAt: null, device: null, ip: null,
      country: null, region: null, city: '-Delhi', deviceType: null, os: null, osVersion: null, browser: null, browserVersion: null, inApp: null, language: null,
    });
    const line = csv(MESSAGE_CSV_HEAD, [row]).split('\r\n')[1];
    expect(line).toContain(`'=1+1`);
    expect(line).toContain(`'+91 98100 12345`);
    expect(line).toContain(`'@SUM(1)`);
  });

  it('reads the filters from the address safely', () => {
    expect(parseMessagesFilter({ topic: 'remove', q: '  froze ', status: 'unread', page: '3' })).toEqual({ topic: 'remove', q: 'froze', status: 'unread', page: 3 });
    expect(parseMessagesFilter({ topic: 'evil', status: 'x', page: '-4', q: 'q'.repeat(99) })).toEqual({ topic: '', q: 'q'.repeat(60), status: '', page: 1 });
  });
});

describe('Supabase store before migration 0004', () => {
  it('says "missing" instead of failing: no message stored, empty admin reads, actions explain', async () => {
    const { SupabaseStore } = await import('../store/supabase');
    const missing = { code: 'PGRST202', message: 'Could not find the function in the schema cache' };
    const calls: string[] = [];
    const client = {
      rpc: async (fn: string) => {
        calls.push(fn);
        return fn === 'purge_expired_games' ? { data: 0, error: null } : { data: null, error: missing };
      },
      from: () => { throw new Error('no table reads expected'); },
    };
    const store = new SupabaseStore('http://x', 'k', client as never);
    expect(await store.contactStatus()).toBe('missing');
    expect(await store.saveContactMessage(requestContext(new Headers(), null), { topic: 'help', name: null, replyTo: null, message: 'hello there all', page: null })).toBe('missing');
    expect(await store.adminListContactMessages({ limit: 25, offset: 0 })).toEqual({ total: 0, unread: 0, rows: [] });
    expect(await store.adminCountUnreadContact()).toBe(0);
    await expect(store.adminDeleteContactMessage(1)).rejects.toThrow(/0004_contact/);
    await expect(store.adminSetContactRead(1, true)).rejects.toThrow(/0004_contact/);
    expect(calls).toContain('save_contact_message');
    // and the API answers 503 with the email address
    const r = await handleContact(req(good, { ip: '10.7.7.7' }), { store });
    expect(r).toMatchObject({ ok: false, status: 503, code: 'unavailable' });
  });

  it('passes rows through field by field once 0004 exists', async () => {
    const { SupabaseStore } = await import('../store/supabase');
    const row = { id: 7, createdAt: 1, topic: 'help', name: HOSTILE, replyTo: null, message: 'm'.repeat(12), page: null, readAt: null, device: 'abcd1234', ip: '1.1.1.1', extra: 'leak', tokenHash: 'f'.repeat(64) };
    const client = { rpc: async (fn: string) => (fn === 'admin_list_contact' ? { data: { total: 1, unread: 1, rows: [row] }, error: null } : { data: fn === 'admin_delete_contact', error: null }), from: () => null };
    const store = new SupabaseStore('http://x', 'k', client as never);
    const page = await store.adminListContactMessages({ limit: 25, offset: 0 });
    expect(page.rows[0]).toMatchObject({ id: 7, name: HOSTILE, device: 'abcd1234' });
    expect(Object.keys(page.rows[0])).not.toContain('extra');
    expect(Object.keys(page.rows[0])).not.toContain('tokenHash');
    expect(await store.adminDeleteContactMessage(7)).toBe(true);
  });
});
