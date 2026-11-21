// QA regression tests for the admin side (docs/qa/TEST_PLAN_ADMIN.md). Written by QA independently of the feature tests:
// each block names the test-plan cases it guards.
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { GAME_TTL_MS } from '@/core';
import { actOnGame, createGameForDevice } from '../../games';
import { countryName } from '../../client-info';
import { cleanBatch } from '../../insights/events';
import type { RequestContext } from '../../insights/types';
import { ADMIN_RETENTION_MS } from '../../store';
import { MemoryStore } from '../../store/memory';
import { hashToken } from '../../tokens';
import { ADMIN_SESSION_MS, LOGIN_LIMIT, attemptLogin, createSessionToken, resetRevokedSessions, revokeSessionToken, verifySessionToken } from '../auth';
import { quantile, summarise } from '../gameStats';
import { delta, parseRange } from '../range';
import { csv, csvCell } from '../stats';
import { DAY_MS, IST_OFFSET_MS, istDay, istDayStart } from '../time';
import { resetRateLimits } from '../../rateLimit';

const ENV = { ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'test-password-123' };
const NOW = Date.UTC(2026, 10, 21, 7, 30); // 21 Nov 2026, 1:00 pm IST

afterEach(() => {
  resetRevokedSessions();
  resetRateLimits();
});

describe('AUTH-05 / AUTH-07 session tokens', () => {
  it('expires after 12 hours — to the millisecond', () => {
    const t = createSessionToken(NOW, ENV)!;
    expect(verifySessionToken(t, NOW + ADMIN_SESSION_MS - 1, ENV)).not.toBeNull();
    expect(verifySessionToken(t, NOW + ADMIN_SESSION_MS, ENV)).toBeNull();
  });

  it('BUG-A01: a signed-out session cannot be replayed; other sessions are untouched', () => {
    const mine = createSessionToken(NOW, ENV)!;
    const other = createSessionToken(NOW + 5, ENV)!;
    expect(revokeSessionToken(mine, NOW + 1000, ENV)).toBe(true);
    expect(verifySessionToken(mine, NOW + 2000, ENV)).toBeNull();
    expect(verifySessionToken(other, NOW + 2000, ENV)).not.toBeNull();
    // revoking rubbish, or a token signed with another password, does nothing and does not throw
    expect(revokeSessionToken('rubbish', NOW, ENV)).toBe(false);
    expect(revokeSessionToken(createSessionToken(NOW, { ...ENV, ADMIN_PASSWORD: 'x' }), NOW, ENV)).toBe(false);
    expect(revokeSessionToken(undefined, NOW, ENV)).toBe(false);
  });

  it('a new password refuses every old session', () => {
    const t = createSessionToken(NOW, ENV)!;
    expect(verifySessionToken(t, NOW + 1, { ...ENV, ADMIN_PASSWORD: 'changed' })).toBeNull();
  });
});

describe('AUTH-04 sign-in rate limit', () => {
  it('blocks the 6th try for 15 minutes — also with the right password — then lets the address in again', () => {
    for (let i = 0; i < LOGIN_LIMIT.max; i++) expect(attemptLogin('admin@example.com', 'bad', '9.9.9.9', NOW + i, ENV)).toMatchObject({ status: 401 });
    expect(attemptLogin('admin@example.com', ENV.ADMIN_PASSWORD, '9.9.9.9', NOW + 10, ENV)).toMatchObject({ ok: false, status: 429 });
    expect(attemptLogin('admin@example.com', ENV.ADMIN_PASSWORD, '9.9.9.9', NOW + LOGIN_LIMIT.windowMs - 1, ENV)).toMatchObject({ status: 429 });
    expect(attemptLogin('admin@example.com', ENV.ADMIN_PASSWORD, '9.9.9.9', NOW + LOGIN_LIMIT.windowMs + 1, ENV)).toMatchObject({ ok: true });
    expect(attemptLogin('admin@example.com', ENV.ADMIN_PASSWORD, '8.8.8.8', NOW + 10, ENV)).toMatchObject({ ok: true });
  });
});

describe('RANGE-01 / DATA-02 India days', () => {
  it('23:59:59.999 IST and 00:00:00.000 IST fall on different days; so do the two sides of UTC midnight only when IST says so', () => {
    const midnight = istDayStart(NOW);
    expect(istDay(midnight - 1)).toBe('2026-11-20');
    expect(istDay(midnight)).toBe('2026-11-21');
    // 23:59 UTC and 00:01 UTC are 05:29 and 05:31 IST: the SAME India day
    const utcMidnight = Date.UTC(2026, 10, 21);
    expect(istDay(utcMidnight - 60_000)).toBe(istDay(utcMidnight + 60_000));
    expect(midnight % DAY_MS).toBe(DAY_MS - IST_OFFSET_MS);
  });

  it('ranges: inverted is swapped, the future is pulled back to today, more than 90 days is capped, rubbish is 7 days', () => {
    const today = istDayStart(NOW);
    const r = (q: Record<string, string>) => parseRange(q, NOW);
    expect(r({ range: 'custom', from: '2026-11-20', to: '2026-11-15' })).toMatchObject({ fromDay: '2026-11-15', toDay: '2026-11-20' });
    expect(r({ range: 'custom', from: '2027-01-01', to: '2027-02-01' })).toMatchObject({ from: today, to: today + DAY_MS });
    const wide = r({ range: 'custom', from: '2020-01-01', to: '2026-11-21' });
    expect(wide.days).toHaveLength(90);
    expect(r({ range: 'custom', from: '2026-02-31', to: 'x' }).key).toBe('7d');
    expect(r({ range: '<script>' }).days).toHaveLength(7);
    expect(r({ range: '7d' }).prev).toMatchObject({ from: today - 13 * DAY_MS, to: today - 6 * DAY_MS });
    expect(r({ range: 'yesterday' })).toMatchObject({ from: today - DAY_MS, to: today });
  });

  it('DATA-04: change against zero is "new", zero against zero is flat, never NaN or Infinity', () => {
    expect(delta(5, 0)).toEqual({ pct: null, dir: 'new' });
    expect(delta(0, 0)).toEqual({ pct: 0, dir: 'flat' });
    expect(delta(0, 4)).toEqual({ pct: -1, dir: 'down' });
    expect(delta(NaN, 4).pct).toBeNull();
    expect(delta(7, 1).pct).toBe(6);
  });

  it('DATA-09: medians and quartiles on odd, even and tiny samples', () => {
    expect(summarise([])).toMatchObject({ n: 0, median: null, mean: null });
    expect(summarise([7])).toMatchObject({ median: 7, p25: 7, p75: 7 });
    expect(summarise([4, 2])).toMatchObject({ median: 3, p25: 2.5, p75: 3.5 });
    expect(summarise([30, 10, 20])).toMatchObject({ median: 20, p25: 15, p75: 25 });
    expect(summarise([1, 2, 3, 4])).toMatchObject({ median: 2.5, mean: 2.5 });
    expect(quantile([1, 2, 3, 4], 2)).toBe(4);
  });
});

describe('SEC-04 CSV', () => {
  it('defuses every formula trigger and keeps commas, quotes and new lines intact', () => {
    for (const s of ['=1+1', '+91 98', '-2', '@SUM(A1)', '\tx', '\rx', '=cmd|\' /C calc\'!A0']) expect(csvCell(s).replace(/^"/, '')[0]).toBe("'");
    expect(csvCell(-5)).toBe('-5'); // a real number stays a number
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('<script>alert(1)</script>')).toBe('<script>alert(1)</script>'); // inert in a CSV; nothing to defuse
    expect(csv(['A'], [['x\ny']])).toBe('A\r\n"x\ny"\r\n');
  });
});

describe('DATA-05 country names', () => {
  it('BUG-A04: countries outside the built-in list are named, not shown as a bare code', () => {
    expect(countryName('IN')).toBe('India');
    expect(countryName('BR')).toBe('Brazil');
    expect(countryName('ZZ')).toBe('ZZ');
    expect(countryName(null)).toBe('Unknown');
  });
});

// ---------------------------------------------------------------- retention and erase with a shifted clock (memory store)

const ctxOf = (tokenHash: string | null, at: number, ip: string): RequestContext => ({
  tokenHash, at, ip, country: 'IN', region: 'MH', city: 'Mumbai', lat: 19, lon: 72, timezone: 'Asia/Kolkata', postal: '400001',
  deviceType: 'phone', os: 'Android', osVersion: '14', browser: 'Chrome', browserVersion: '126', inApp: null, ua: 'UA', language: 'en-IN',
});

async function playedGame(store: MemoryStore, clock: { now: number }) {
  // the game service and the store both work with token HASHES
  const host = hashToken(randomUUID()), guest = hashToken(randomUUID());
  const ctx = { now: () => clock.now, store };
  const made = await createGameForDevice(host, { hostName: 'Asha', prizes: ['full'] }, ctx);
  if (!made.ok) throw new Error('create failed');
  const joined = await actOnGame(made.code, guest, { type: 'join', name: 'Meera' }, ctx);
  if (!joined.ok) throw new Error('join failed');
  for (const [token, role, name] of [[host, 'host', 'Asha'], [guest, 'player', 'Meera']] as const) {
    await store.recordParticipation(ctxOf(token, clock.now, role === 'host' ? '1.1.1.1' : '2.2.2.2'), { code: made.code, role, pid: 'x', name });
    await store.trackBatch(ctxOf(token, clock.now, role === 'host' ? '1.1.1.1' : '2.2.2.2'), cleanBatch({ sid: 'session-' + role, e: [{ n: 'session_start' }, { n: 'page_view', d: { page: 'home' } }] }, clock.now)!);
  }
  return { code: made.code, host, guest };
}

describe('RET-01 retention (memory store, shifted clock)', () => {
  it('tickets and dabs go at 24 h; the summary, devices, IPs, events and participations go at 90 days — not a minute earlier', async () => {
    const clock = { now: NOW };
    const store = new MemoryStore(undefined, () => clock.now);
    const { code } = await playedGame(store, clock);
    expect(store.rawPlayers(code)!.every((p) => p.ticket.length === 3)).toBe(true);

    clock.now = NOW + GAME_TTL_MS - 1000;
    await store.purge();
    expect(store.rawPlayers(code)!.every((p) => p.ticket.length === 3)).toBe(true);
    expect(await store.load(code)).not.toBeNull();

    clock.now = NOW + GAME_TTL_MS + 1000;
    expect(await store.purge()).toBe(1);
    expect(await store.load(code)).toBeNull();
    expect(store.rawPlayers(code)!.every((p) => p.ticket.length === 0 && p.marks.length === 0)).toBe(true);
    const kept = await store.adminGetGame(code);
    expect(kept).toMatchObject({ erased: true });
    expect(kept!.doc.players.map((p) => p.name).sort()).toEqual(['Asha', 'Meera']);
    expect(await store.tableCounts()).toMatchObject({ games: 1, devices: 2, device_ips: 2, participations: 2, events: 4 });

    clock.now = NOW + ADMIN_RETENTION_MS - 60_000;
    await store.purge();
    expect(await store.tableCounts()).toMatchObject({ games: 1, devices: 2, device_ips: 2, participations: 2, events: 4 });

    clock.now = NOW + ADMIN_RETENTION_MS + 60_000;
    await store.purge();
    expect(await store.tableCounts()).toMatchObject({ games: 0, players: 0, devices: 0, device_ips: 0, participations: 0, events: 0 });
    expect(await store.adminGetGame(code)).toBeNull();
  });

  it('a device seen again keeps its row, but its old events and old IP still expire', async () => {
    const clock = { now: NOW };
    const store = new MemoryStore(undefined, () => clock.now);
    const { host } = await playedGame(store, clock);
    clock.now = NOW + 60 * DAY_MS;
    await store.trackBatch(ctxOf(host, clock.now, '3.3.3.3'), cleanBatch({ sid: 'session-later', e: [{ n: 'session_start' }] }, clock.now)!);
    clock.now = NOW + ADMIN_RETENTION_MS + DAY_MS;
    await store.purge();
    const c = await store.tableCounts();
    expect(c).toMatchObject({ devices: 1, device_ips: 1, events: 1 });
    const d = await store.getDevice(host.slice(0, 8));
    expect(d!.ips.map((i) => i.ip)).toEqual(['3.3.3.3']);
  });
});

describe('ERASE (memory store)', () => {
  it('removes the device row, IPs, events and per-game details, anonymises names, is idempotent, writes one audit line per call, and leaves other people alone', async () => {
    const clock = { now: NOW };
    const store = new MemoryStore(undefined, () => clock.now);
    const { code, guest, host } = await playedGame(store, clock);
    const id = guest.slice(0, 8);

    const active = await store.eraseDevice(id);
    expect(active).toEqual({ found: true, devices: 1, ips: 1, events: 2, participations: 1, games: 1, activeGames: 1 });
    const row = (await store.adminGetGame(code))!;
    expect(JSON.stringify(row)).not.toContain('Meera');
    expect(row.doc.players.map((p) => p.name).sort()).toEqual(['Asha', 'Erased player']);
    expect(Object.values(row.devices)).toContain(id); // the seat stays while the game can still be played
    expect((await store.gameInsights(code)).participations.map((p) => p.device)).toEqual([host.slice(0, 8)]);
    expect(await store.getDevice(id)).toBeNull();
    expect((await store.listEvents({ device: id, limit: 50, offset: 0 })).total).toBe(0);
    // the erased player can still open the game they are in (nothing a player needs was broken)
    expect(await store.load(code)).not.toBeNull();

    clock.now = NOW + GAME_TTL_MS + 1000;
    const after = await store.eraseDevice(id);
    expect(after).toEqual({ found: true, devices: 0, ips: 0, events: 0, participations: 0, games: 1, activeGames: 0 });
    expect(Object.values((await store.adminGetGame(code))!.devices)).not.toContain(id);
    expect(await store.eraseDevice(id)).toMatchObject({ found: false, games: 0 });

    const audit = await store.listAudit(10);
    expect(audit).toHaveLength(3);
    expect(JSON.stringify(audit)).not.toMatch(/Meera|2\.2\.2\.2|Mumbai/);
    expect((await store.tableCounts()).devices).toBe(1);
    await expect(store.eraseDevice('nothex!!')).rejects.toThrow();
    await expect(store.eraseDevice('abc')).rejects.toThrow();
  });
});
