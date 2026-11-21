// The insights end to end on the memory store: what a request writes, what the admin reads back, retention, erasing a device,
// the limits of POST /api/t, and — most important — that none of it can reach a public response.
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GAME_TTL_MS } from '@/core';
import { POST as trackPost } from '@/app/api/t/route';
import { POST as createPost } from '@/app/api/games/route';
import { GET as viewGet } from '@/app/api/games/[code]/route';
import { POST as actPost } from '@/app/api/games/[code]/act/route';
import { DAY_MS } from '../../admin/time';
import { actOnGame, createGameForDevice, viewGame } from '../../games';
import { resetRateLimits } from '../../rateLimit';
import { ADMIN_RETENTION_MS } from '../../store';
import { MemoryStore, getMemoryStore } from '../../store/memory';
import { SupabaseStore } from '../../store/supabase';
import { hashToken } from '../../tokens';
import { anonymiseDoc, dayLabel, funnel, istDayIndex, screenBucket, stepKey, weekIndex } from '../aggregate';
import { cleanBatch } from '../events';
import { requestContext } from '../record';
import { ERASED_NAME } from '../types';

// Outside a real request Next's after() throws; here "after the response" simply means "now".
vi.mock('next/server', async (original) => ({ ...(await original<typeof import('next/server')>()), after: (fn: () => unknown) => void fn() }));

const T0 = Date.UTC(2026, 10, 20, 6, 0, 0);
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36';
const UA_IPHONE_WA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.12.78';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const PUNE = { 'x-forwarded-for': '49.36.200.17', 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'MH', 'x-vercel-ip-city': 'Pune', 'x-vercel-ip-latitude': '18.52', 'x-vercel-ip-longitude': '73.85', 'x-vercel-ip-timezone': 'Asia/Kolkata' };
const JAIPUR = { 'x-forwarded-for': '2405:201:5c0a::77', 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'RJ', 'x-vercel-ip-city': 'Jaipur' };
const PRIVATE = /49\.36\.200\.17|2405:201|Pune|Jaipur|"ip"|country|region|"city"|latitude|userAgent|"ua"|Android|iPhone|tokenHash|token_hash/;

const hdr = (place: Record<string, string>, ua: string, extra: Record<string, string> = {}): Headers => new Headers({ ...place, 'user-agent': ua, 'accept-language': 'en-IN,en;q=0.9', ...extra });
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 5));

function setup() {
  let now = T0;
  const store = new MemoryStore(undefined, () => now);
  const hash = { priya: hashToken(randomUUID()), meera: hashToken(randomUUID()), nani: hashToken(randomUUID()) };
  const ctx = (who: keyof typeof hash | null, place: Record<string, string>, ua: string) => requestContext(hdr(place, ua), who ? hash[who] : null, now);
  const batch = (sid: string, src: string, events: unknown[]) => cleanBatch({ sid, src, e: events }, now)!;
  return { store, hash, ctx, batch, at: (ms: number) => { now = ms; }, now: () => now };
}

describe('recording', () => {
  it('builds the request context from headers only', () => {
    const c = requestContext(hdr(PUNE, UA_ANDROID), 'h'.repeat(64), T0);
    expect(c).toMatchObject({ ip: '49.36.200.17', country: 'IN', region: 'MH', city: 'Pune', lat: 18.52, lon: 73.85, timezone: 'Asia/Kolkata', deviceType: 'phone', os: 'Android', osVersion: '14', browser: 'Chrome', inApp: null, language: 'en-IN', at: T0 });
    expect(requestContext(new Headers(), null, T0)).toMatchObject({ ip: null, country: null, city: null, deviceType: 'unknown', ua: null, language: null });
    expect(requestContext(new Headers({ 'user-agent': 'x'.repeat(2000) }), null, T0).ua).toHaveLength(400);
  });

  it('remembers a device, its first touch and its latest place', async () => {
    const { store, hash, ctx, batch, at } = setup();
    await store.trackBatch(ctx('priya', PUNE, UA_ANDROID), batch('session-000001', 'whatsapp', [
      { n: 'session_start', d: { sw: 412, sh: 915, vw: 412, vh: 780, dpr: 263, tz: 'Asia/Kolkata', touch: true, pwa: false, conn: '4g', utm_source: 'diwali', utm_medium: 'whatsapp', utm_campaign: 'kitty', landing: '/' } },
      { n: 'page_view', p: '/', d: { page: 'home' } }, { n: 'cta_host', p: '/' },
    ]));
    at(T0 + 3 * DAY_MS);
    await store.trackBatch(ctx('priya', JAIPUR, UA_DESKTOP), batch('session-000002', 'google', [{ n: 'session_start', d: { sw: 1920, ref: 'google.com', landing: '/host' } }]));
    const got = await store.getDevice(hash.priya.slice(0, 8));
    expect(got?.device).toMatchObject({
      id: hash.priya.slice(0, 8), firstSeen: T0, lastSeen: T0 + 3 * DAY_MS, sessions: 2,
      ip: '2405:201:5c0a::77', country: 'IN', region: 'RJ', city: 'Jaipur', lat: null, deviceType: 'desktop', os: 'Windows', browser: 'Chrome', language: 'en-IN',
      screenW: 1920, screenH: 915, dpr: 263, clientTz: 'Asia/Kolkata', touch: true, connection: '4g', standalone: false,
      firstSource: 'whatsapp', firstUtmSource: 'diwali', firstUtmMedium: 'whatsapp', firstUtmCampaign: 'kitty', firstLanding: '/', firstReferrer: null,
    });
    expect(got?.ips.map((i) => i.ip)).toEqual(['2405:201:5c0a::77', '49.36.200.17']);
    expect(JSON.stringify(got)).not.toContain(hash.priya);
    const events = await store.listEvents({ limit: 10, offset: 0 });
    expect(events.total).toBe(4);
    expect(events.rows[0]).toMatchObject({ name: 'session_start', device: hash.priya.slice(0, 8), city: 'Jaipur', deviceType: 'desktop', source: 'google', session: 'session-000002' });
    expect(events.rows.at(-1)).toMatchObject({ city: 'Pune', deviceType: 'phone', source: 'whatsapp', country: 'IN' });
  });

  it('keeps events of a visitor without a token, but no device row', async () => {
    const { store, ctx, batch } = setup();
    await store.trackBatch(ctx(null, PUNE, UA_ANDROID), batch('session-anon01', 'direct', [{ n: 'page_view', d: { page: 'home' } }]));
    expect((await store.listDevices({ limit: 10, offset: 0 })).total).toBe(0);
    expect((await store.trafficTotals(T0 - 1, T0 + 1)).visitors).toBe(1);
    expect((await store.listEvents({ limit: 1, offset: 0 })).rows[0].device).toBeNull();
  });

  it('records one participation per device per game, with the place and device of the moment', async () => {
    const { store, hash, ctx } = setup();
    const made = await createGameForDevice(hash.priya, { hostName: 'Priya', prizes: ['top', 'full'], price: 50 }, { store, now: () => T0 });
    if (!made.ok) throw new Error('create failed');
    await store.recordParticipation(ctx('priya', PUNE, UA_ANDROID), { code: made.code, role: 'host', pid: made.hostPid, name: 'Priya' });
    await store.recordParticipation(ctx('priya', JAIPUR, UA_DESKTOP), { code: made.code, role: 'host', pid: made.hostPid, name: 'Again' });
    await store.recordParticipation(ctx('meera', JAIPUR, UA_IPHONE_WA), { code: made.code, role: 'player', pid: 'p2', name: 'Meera' });
    await store.recordParticipation(ctx('nani', PUNE, UA_ANDROID), { code: 'ZZZZZ', role: 'host', pid: null, name: 'Nobody' });
    await store.recordWin(hash.meera, 150);
    await store.recordWin(hash.nani, 150);
    const gi = await store.gameInsights(made.code);
    expect(gi.participations).toHaveLength(2);
    expect(gi.participations.find((p) => p.role === 'host')).toMatchObject({ ip: '49.36.200.17', city: 'Pune', deviceType: 'phone', os: 'Android', device: hash.priya.slice(0, 8) });
    expect(gi.participations.find((p) => p.role === 'player')).toMatchObject({ ip: '2405:201:5c0a::77', city: 'Jaipur', inApp: 'WhatsApp', os: 'iOS' });
    const devices = await store.listDevices({ sort: 'won', limit: 10, offset: 0 });
    expect(devices.rows[0]).toMatchObject({ lastName: 'Meera', gamesJoined: 1, gamesHosted: 0, prizesWon: 1, amountWon: 150 });
    expect(devices.rows.find((d) => d.id === hash.priya.slice(0, 8))).toMatchObject({ lastName: 'Priya', gamesHosted: 1, gamesJoined: 0 });
    expect(devices.total).toBe(2); // the unknown game recorded nothing
    expect(Object.keys(await store.gameHosts([made.code, 'ZZZZZ']))).toEqual([made.code]);
    expect((await store.participationBreakdown(T0 - 1, T0 + 1, 'city')).map((r) => [r.key, r.games, r.players, r.devices])).toEqual([['Pune|MH|IN', 1, 1, 1], ['Jaipur|RJ|IN', 0, 1, 1]]);
  });
});

describe('aggregates', () => {
  it('names steps, buckets and India days', () => {
    expect(stepKey({ name: 'page_view', props: { page: 'home' } })).toBe('page_view:home');
    expect(stepKey({ name: 'results_seen', props: { role: 'host' } })).toBe('results_seen:host');
    expect(stepKey({ name: 'join_ok', props: {} })).toBe('join_ok');
    expect([200, 360, 479, 480, 800, 1366, 1440, 'x'].map(screenBucket)).toEqual(['0-359', '360-479', '360-479', '480-767', '768-1023', '1024-1439', '1440+', '']);
    // 20 Nov 2026 00:10 IST is still 19 Nov in UTC.
    const lateNight = Date.UTC(2026, 10, 19, 18, 40);
    expect(dayLabel(istDayIndex(lateNight))).toBe('2026-11-20');
    expect(dayLabel(weekIndex(istDayIndex(lateNight)) * 7 - 3)).toBe('2026-11-16'); // the Monday of that week
  });

  it('breaks events down, with filters', async () => {
    const { store, ctx, batch } = setup();
    await store.trackBatch(ctx('priya', PUNE, UA_ANDROID), batch('session-000001', 'whatsapp', [{ n: 'page_view', d: { page: 'home' } }, { n: 'page_view', d: { page: 'host' } }, { n: 'cta_host' }]));
    await store.trackBatch(ctx('meera', JAIPUR, UA_DESKTOP), batch('session-000002', 'google', [{ n: 'page_view', d: { page: 'home' } }, { n: 'session_start', d: { sw: 1920 } }]));
    await store.trackBatch(ctx('meera', JAIPUR, UA_DESKTOP), batch('session-000003', 'google', [{ n: 'page_view', d: { page: 'home' } }]));
    const r = { from: T0 - 1, to: T0 + 1 };
    expect(await store.eventBreakdown({ ...r, dim: 'name' })).toEqual([
      { key: 'page_view', events: 4, sessions: 3, devices: 2 }, { key: 'cta_host', events: 1, sessions: 1, devices: 1 }, { key: 'session_start', events: 1, sessions: 1, devices: 1 },
    ]);
    expect(await store.eventBreakdown({ ...r, dim: 'city', names: ['page_view'] })).toEqual([{ key: 'Jaipur|RJ|IN', events: 2, sessions: 2, devices: 1 }, { key: 'Pune|MH|IN', events: 2, sessions: 1, devices: 1 }]);
    expect(await store.eventBreakdown({ ...r, dim: 'prop:page', deviceType: 'phone' })).toEqual([{ key: 'home', events: 1, sessions: 1, devices: 1 }, { key: 'host', events: 1, sessions: 1, devices: 1 }, { key: '', events: 1, sessions: 1, devices: 1 }].sort((a, b) => b.events - a.events || (a.key < b.key ? -1 : 1)));
    expect(await store.eventBreakdown({ ...r, dim: 'source', source: 'google' })).toEqual([{ key: 'google', events: 3, sessions: 2, devices: 1 }]);
    expect(await store.eventBreakdown({ ...r, dim: 'screen', names: ['session_start'] })).toEqual([{ key: '1440+', events: 1, sessions: 1, devices: 1 }]);
    expect(await store.eventBreakdown({ ...r, dim: 'day' })).toEqual([{ key: '2026-11-20', events: 6, sessions: 3, devices: 2 }]);
    expect(await store.eventBreakdown({ ...r, dim: 'hourdow' })).toEqual([{ key: '4-11', events: 6, sessions: 3, devices: 2 }]); // Friday, 11:30 IST
    expect(await store.eventBreakdown({ from: T0 + 1, to: T0 + 2, dim: 'name' })).toEqual([]);
    expect(await store.trafficTotals(r.from, r.to)).toMatchObject({ visitors: 2, sessions: 3, events: 6, pageViews: 4, newDevices: 2, returningDevices: 0 });
  });

  it('a funnel never rises from one step to the next', () => {
    const e = (device: string | null, session: string, name: string, props = {}) => ({ id: 0, at: T0, device, session, name, code: null, path: null, props, country: null, region: null, city: null, deviceType: 'phone', os: null, browser: null, inApp: null, source: 'direct' });
    const events = [
      e('a', 's1', 'page_view', { page: 'home' }), e('a', 's1', 'page_view', { page: 'host' }), e('a', 's1', 'host_created'),
      e('b', 's2', 'page_view', { page: 'home' }), e('b', 's2', 'host_created'), // skipped /host: not kept at "created"
      e('c', 's3', 'page_view', { page: 'host' }), // never saw home: only counted in "any"
      e(null, 's4', 'page_view', { page: 'home' }), e(null, 's4', 'page_view', { page: 'host' }),
    ];
    const steps = ['page_view:home', 'page_view:host', 'host_created'];
    expect(funnel(events, { from: T0 - 1, to: T0 + 1, steps })).toEqual([{ step: 'page_view:home', any: 3, kept: 3 }, { step: 'page_view:host', any: 3, kept: 2 }, { step: 'host_created', any: 2, kept: 1 }]);
    expect(funnel(events, { from: T0 - 1, to: T0 + 1, steps, deviceType: 'desktop' }).map((s) => s.kept)).toEqual([0, 0, 0]);
    expect(funnel(events, { from: T0 - 1, to: T0 + 1, steps: [] })).toEqual([]);
  });

  it('works out cohorts, return rates and returning hosts', async () => {
    const { store, hash, ctx, batch, at } = setup();
    const visit = async (who: 'priya' | 'meera' | 'nani', when: number, sid: string) => { at(when); await store.trackBatch(ctx(who, PUNE, UA_ANDROID), batch(sid, 'direct', [{ n: 'page_view', d: { page: 'home' } }])); };
    const start = T0 - 35 * DAY_MS;
    await visit('priya', start, 'session-00000a');
    await visit('priya', start + DAY_MS, 'session-00000b');
    await visit('priya', start + 31 * DAY_MS, 'session-00000c');
    await visit('meera', start + 2 * DAY_MS, 'session-00000d');
    await visit('meera', start + 9 * DAY_MS, 'session-00000e');
    await visit('nani', T0, 'session-00000f');
    for (const [day, name] of [[0, 'A'], [0, 'B'], [5, 'C']] as const) {
      at(start + day * DAY_MS);
      const g = await createGameForDevice(hash.priya, { hostName: 'Priya', prizes: ['full'] }, { store, now: () => start + day * DAY_MS });
      if (g.ok) await store.recordParticipation(ctx('priya', PUNE, UA_ANDROID), { code: g.code, role: 'host', pid: g.hostPid, name });
    }
    at(T0);
    const g = await createGameForDevice(hash.meera, { hostName: 'Meera', prizes: ['full'] }, { store, now: () => T0 });
    if (g.ok) await store.recordParticipation(ctx('meera', PUNE, UA_ANDROID), { code: g.code, role: 'host', pid: g.hostPid, name: 'Meera' });
    const r = await store.retention(T0);
    expect(r.d1).toEqual({ eligible: 2, returned: 2 });
    expect(r.d7).toEqual({ eligible: 2, returned: 2 });
    expect(r.d30).toEqual({ eligible: 2, returned: 1 });
    expect(r.hosts).toBe(2);
    expect(r.returningHosts).toBe(1);
    expect(r.cohorts).toHaveLength(8);
    expect(r.cohorts.at(-1)).toMatchObject({ size: 1, active: [1] });
    const first = r.cohorts.find((c) => c.size === 2)!;
    expect(first.active[0]).toBe(2);
    expect(first.active.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(4);
    expect(r.cohorts.every((c) => c.active.every((n) => n <= c.size))).toBe(true);
  });
});

describe('retention: 90 days', () => {
  it('purges events, device rows, IPs and participations with the game summaries', async () => {
    const { store, hash, ctx, batch, at } = setup();
    const made = await createGameForDevice(hash.priya, { hostName: 'Priya', prizes: ['full'] }, { store, now: () => T0 });
    if (!made.ok) throw new Error('create failed');
    await store.recordParticipation(ctx('priya', PUNE, UA_ANDROID), { code: made.code, role: 'host', pid: made.hostPid, name: 'Priya' });
    await store.trackBatch(ctx('priya', PUNE, UA_ANDROID), batch('session-000001', 'direct', [{ n: 'page_view', d: { page: 'home' } }]));
    at(T0 + 50 * DAY_MS);
    await store.trackBatch(ctx('meera', JAIPUR, UA_DESKTOP), batch('session-000002', 'direct', [{ n: 'page_view', d: { page: 'home' } }]));

    at(T0 + ADMIN_RETENTION_MS - 60_000);
    await store.purge();
    expect(await store.tableCounts()).toMatchObject({ devices: 2, device_ips: 2, events: 2, participations: 1, games: 1 });

    at(T0 + ADMIN_RETENTION_MS + 60_000);
    await store.purge();
    expect(await store.tableCounts()).toMatchObject({ devices: 1, device_ips: 1, events: 1, participations: 0, games: 0 });
    expect(await store.getDevice(hash.priya.slice(0, 8))).toBeNull();
    expect((await store.listEvents({ limit: 10, offset: 0 })).rows.map((e) => e.city)).toEqual(['Jaipur']);

    at(T0 + 50 * DAY_MS + ADMIN_RETENTION_MS + 60_000);
    await store.purge();
    expect(await store.tableCounts()).toMatchObject({ devices: 0, device_ips: 0, events: 0, participations: 0 });
  });
});

describe('erase a device', () => {
  it('anonymises a game document for the given seats only', () => {
    const doc = {
      hostName: 'Priya', players: [{ pid: 'p1', name: 'Priya' }, { pid: 'p2', name: 'Meera' }],
      prizes: [{ id: 'top', winnerPid: 'p2', winnerName: 'Meera' }, { id: 'full', winnerPid: 'p1', winnerName: 'Priya' }, { id: 'x', winnerPid: null, winnerName: null }],
      events: [{ seq: 1, kind: 'join', pid: 'p2', name: 'Meera' }, { seq: 2, kind: 'start' }, { seq: 3, kind: 'win', pid: 'p1', name: 'Priya' }],
      history: [{ round: 1, prizes: [{ id: 'top', winnerPid: 'p1', winnerName: 'Priya' }] }],
    } as never;
    const out = anonymiseDoc(doc, ['p1'], true) as unknown as { hostName: string; players: { name: string }[]; prizes: { winnerName: string | null }[]; events: { name?: string }[]; history: { prizes: { winnerName: string }[] }[] };
    expect(out.hostName).toBe(ERASED_NAME);
    expect(out.players.map((p) => p.name)).toEqual([ERASED_NAME, 'Meera']);
    expect(out.prizes.map((p) => p.winnerName)).toEqual(['Meera', ERASED_NAME, null]);
    expect(out.events.map((e) => e.name)).toEqual(['Meera', undefined, ERASED_NAME]);
    expect(out.history[0].prizes[0].winnerName).toBe(ERASED_NAME);
    expect(JSON.stringify(anonymiseDoc(doc, ['p2'], false))).not.toContain('Meera');
    expect((anonymiseDoc(doc, ['p2'], false) as unknown as { hostName: string }).hostName).toBe('Priya');
  });

  it('removes the device, its events, IPs and participations, and its names from stored games', async () => {
    const { store, hash, ctx, batch, at } = setup();
    const made = await createGameForDevice(hash.priya, { hostName: 'Priya', prizes: ['full'] }, { store, now: () => T0 });
    if (!made.ok) throw new Error('create failed');
    const joined = await actOnGame(made.code, hash.meera, { type: 'join', name: 'Meera' }, { store, now: () => T0 });
    expect(joined.ok).toBe(true);
    await store.recordParticipation(ctx('priya', PUNE, UA_ANDROID), { code: made.code, role: 'host', pid: made.hostPid, name: 'Priya' });
    await store.recordParticipation(ctx('meera', JAIPUR, UA_IPHONE_WA), { code: made.code, role: 'player', pid: 'x', name: 'Meera' });
    await store.trackBatch(ctx('meera', JAIPUR, UA_IPHONE_WA), batch('session-000001', 'whatsapp', [{ n: 'join_ok', c: made.code }, { n: 'page_view', d: { page: 'game_lobby' } }]));
    await store.trackBatch(ctx('priya', PUNE, UA_ANDROID), batch('session-000002', 'direct', [{ n: 'host_created', c: made.code }]));
    const id = hash.meera.slice(0, 8);

    await expect(store.eraseDevice('not-an-id')).rejects.toThrow();
    const res = await store.eraseDevice(id);
    expect(res).toEqual({ found: true, devices: 1, ips: 1, events: 2, participations: 1, games: 1, activeGames: 1 });
    expect(await store.getDevice(id)).toBeNull();
    expect((await store.listEvents({ device: id, limit: 10, offset: 0 })).total).toBe(0);
    expect((await store.listEvents({ limit: 10, offset: 0 })).total).toBe(1);
    expect((await store.gameInsights(made.code)).participations.map((p) => p.role)).toEqual(['host']);
    const row = await store.adminGetGame(made.code);
    expect(row?.doc.players.map((p) => p.name)).toEqual(['Priya', ERASED_NAME]);
    expect(row?.doc.hostName).toBe('Priya');
    expect(JSON.stringify(row?.doc)).not.toContain('Meera');
    // The game is still being played: Meera keeps her seat and can go on.
    expect((await viewGame(made.code, hash.meera, { store, now: () => T0 })).ok && (await viewGame(made.code, hash.meera, { store, now: () => T0 }) as { game: { you: { role: string } } }).game.you.role).toBe('player');
    expect(row?.devices && Object.values(row.devices)).toContain(id);

    // Once the game has expired, erasing again cuts the last link.
    at(T0 + GAME_TTL_MS + 60_000);
    const again = await store.eraseDevice(id);
    expect(again).toEqual({ found: true, devices: 0, ips: 0, events: 0, participations: 0, games: 1, activeGames: 0 });
    const later = await store.adminGetGame(made.code);
    expect(Object.values(later!.devices)).not.toContain(id);
    expect(later!.hostDevice).toBe(hash.priya.slice(0, 8));
    expect(await store.eraseDevice('00000000')).toMatchObject({ found: false, games: 0 });
    const audit = await store.listAudit(10);
    expect(audit).toHaveLength(3);
    expect(audit.at(-1)).toMatchObject({ action: 'erase_device', target: id, detail: { devices: 1, ips: 1, events: 2, participations: 1, games: 1, activeGames: 1 } });
  });
});

describe('POST /api/t', () => {
  beforeEach(() => resetRateLimits());
  const post = (body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
    trackPost(new Request('http://localhost/api/t', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'content-type': 'text/plain', 'user-agent': UA_ANDROID, ...headers } }));
  const sid = () => `sid-${randomUUID()}`;

  it('accepts a batch, answers 204 with no body, and stores it with the request\'s place', async () => {
    const token = randomUUID();
    const s = sid();
    const res = await post({ sid: s, tk: token, src: 'whatsapp', e: [{ n: 'page_view', p: '/', d: { page: 'home' } }, { n: 'evil' }, { n: 'cta_host', p: '/' }] }, PUNE);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
    expect(res.headers.get('cache-control')).toContain('no-store');
    await tick();
    const rows = (await getMemoryStore().listEvents({ session: s, limit: 10, offset: 0 })).rows;
    expect(rows.map((r) => r.name).sort()).toEqual(['cta_host', 'page_view']);
    expect(rows[0]).toMatchObject({ device: hashToken(token).slice(0, 8), city: 'Pune', country: 'IN', deviceType: 'phone', source: 'whatsapp' });
  });

  it('takes the token from the header or the body, and nothing else about the client from the body', async () => {
    const token = randomUUID();
    const s = sid();
    await post({ sid: s, ip: '6.6.6.6', country: 'US', city: 'Fake', e: [{ n: 'online', d: { city: 'Fake', ip: '6.6.6.6' } }] }, { 'x-device-token': token });
    await tick();
    const row = (await getMemoryStore().listEvents({ session: s, limit: 1, offset: 0 })).rows[0];
    expect(row).toMatchObject({ device: hashToken(token).slice(0, 8), city: null, country: null, props: {} });
    expect((await getMemoryStore().getDevice(hashToken(token).slice(0, 8)))?.device.ip).toBeNull();
  });

  it('refuses a body over 16 KB, bad JSON and a bad envelope', async () => {
    expect((await post({ sid: sid(), e: [], pad: 'x'.repeat(17_000) })).status).toBe(413);
    expect((await post('{"sid":"abcdefgh","e":[]}', { 'content-length': '99999' })).status).toBe(413);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ e: [] })).status).toBe(400);
    expect((await post({ sid: 'x', e: [] })).status).toBe(400);
    expect((await post({ sid: sid(), e: [] })).status).toBe(204);
  });

  it('stores at most 50 events of a batch', async () => {
    const s = sid();
    expect((await post({ sid: s, e: Array.from({ length: 70 }, () => ({ n: 'online' })) })).status).toBe(204);
    await tick();
    expect((await getMemoryStore().listEvents({ session: s, limit: 1, offset: 0 })).total).toBe(50);
  });

  it('is rate-limited per device and per IP', async () => {
    const token = randomUUID();
    let last = 204;
    for (let i = 0; i < 121; i++) last = (await post({ sid: sid(), tk: token, e: [] })).status;
    expect(last).toBe(429);
    expect((await post({ sid: sid(), tk: randomUUID(), e: [] })).status).toBe(204);
    resetRateLimits();
    for (let i = 0; i < 1201; i++) last = (await post({ sid: 'sid-shared-0001', e: [] }, { 'x-forwarded-for': '10.9.8.7' })).status;
    expect(last).toBe(429);
    expect((await post({ sid: sid(), e: [] }, { 'x-forwarded-for': '10.9.8.8' })).status).toBe(204);
  });

  it('ignores crawlers and the admin pages', async () => {
    const a = sid(), b = sid();
    expect((await post({ sid: a, e: [{ n: 'page_view', d: { page: 'home' } }] }, { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).status).toBe(204);
    expect((await post({ sid: b, e: [{ n: 'page_view', p: '/admin/games', d: { page: 'other' } }] })).status).toBe(204);
    await tick();
    expect((await getMemoryStore().listEvents({ session: a, limit: 1, offset: 0 })).total).toBe(0);
    expect((await getMemoryStore().listEvents({ session: b, limit: 1, offset: 0 })).total).toBe(0);
  });
});

describe('IP, place and device never reach a public response', () => {
  beforeEach(() => resetRateLimits());
  it('not in any view of the game service', async () => {
    const { store, hash, ctx, batch } = setup();
    const made = await createGameForDevice(hash.priya, { hostName: 'Priya', prizes: ['top', 'full'] }, { store, now: () => T0 });
    if (!made.ok) throw new Error('create failed');
    await store.recordParticipation(ctx('priya', PUNE, UA_ANDROID), { code: made.code, role: 'host', pid: made.hostPid, name: 'Priya' });
    const join = await actOnGame(made.code, hash.meera, { type: 'join', name: 'Meera' }, { store, now: () => T0 });
    await store.recordParticipation(ctx('meera', JAIPUR, UA_IPHONE_WA), { code: made.code, role: 'player', pid: 'p2', name: 'Meera' });
    await store.trackBatch(ctx('meera', JAIPUR, UA_IPHONE_WA), batch('session-000001', 'whatsapp', [{ n: 'join_ok', c: made.code }]));
    const start = await actOnGame(made.code, hash.priya, { type: 'start' }, { store, now: () => T0 });
    const draw = await actOnGame(made.code, hash.priya, { type: 'draw' }, { store, now: () => T0 });
    const views = [join, start, draw, await viewGame(made.code, hash.priya, { store }), await viewGame(made.code, hash.meera, { store }), await viewGame(made.code, hash.nani, { store }), await viewGame(made.code, null, { store })];
    for (const v of views) {
      expect(v.ok).toBe(true);
      expect(JSON.stringify(v)).not.toMatch(PRIVATE);
    }
    // …while the admin does have them.
    expect(JSON.stringify(await store.gameInsights(made.code))).toMatch(/49\.36\.200\.17/);
    // The game's own stored rows hold nothing but the game.
    expect(JSON.stringify(await store.load(made.code))).not.toMatch(/49\.36\.200\.17|2405:201|Pune|Jaipur|Android|iPhone/);
  });

  it('not in the HTTP responses of /api/games', async () => {
    const host = randomUUID(), player = randomUUID();
    const created = await createPost(new Request('http://localhost/api/games', { method: 'POST', headers: hdr(PUNE, UA_ANDROID, { 'x-device-token': host, 'content-type': 'application/json' }), body: JSON.stringify({ hostName: 'Priya', prizes: ['full'] }) }));
    const createdText = await created.text();
    expect(created.status).toBe(201);
    expect(Object.keys(JSON.parse(createdText) as object).sort()).toEqual(['code', 'ok']);
    const code = (JSON.parse(createdText) as { code: string }).code;
    const params = { params: Promise.resolve({ code }) };
    const joined = await actPost(new Request(`http://localhost/api/games/${code}/act`, { method: 'POST', headers: hdr(JAIPUR, UA_IPHONE_WA, { 'x-device-token': player, 'content-type': 'application/json' }), body: JSON.stringify({ type: 'join', name: 'Meera' }) }), params);
    const texts = [createdText, await joined.text()];
    for (const who of [host, player, randomUUID()]) texts.push(await (await viewGet(new Request(`http://localhost/api/games/${code}`, { headers: hdr(PUNE, UA_ANDROID, { 'x-device-token': who }) }), params)).text());
    texts.push(await (await viewGet(new Request(`http://localhost/api/games/${code}`, { headers: hdr(PUNE, UA_ANDROID) }), params)).text());
    for (const t of texts) expect(t).not.toMatch(PRIVATE);
    await tick();
    // The participation WAS recorded — for the admin only.
    const gi = await getMemoryStore().gameInsights(code);
    expect(gi.participations.map((p) => [p.role, p.city, p.ip]).sort()).toEqual([['host', 'Pune', '49.36.200.17'], ['player', 'Jaipur', '2405:201:5c0a::77']]);
    expect((await getMemoryStore().getDevice(hashToken(player).slice(0, 8)))?.device).toMatchObject({ lastName: 'Meera', gamesJoined: 1, inApp: 'WhatsApp' });
  });
});

describe('before migration 0003 has been run (Supabase)', () => {
  const missing = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.track_batch in the schema cache' } };
  const fake = (answer: unknown = missing) => {
    const rpc = vi.fn(async (fn: string) => (fn.startsWith('admin_list_games') ? { data: { total: 0, rows: [] }, error: null } : answer));
    const from = vi.fn(() => ({ select: () => Promise.resolve({ count: 7, error: null }) }));
    return { rpc, from, store: new SupabaseStore('http://localhost', 'key', { rpc, from } as never) };
  };

  it('says "missing" and keeps every public write silent', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { store, rpc } = fake();
    const ctx = requestContext(hdr(PUNE, UA_ANDROID), 'a'.repeat(64), T0);
    await expect(store.trackBatch(ctx, { session: 'session-000001', source: 'direct', events: [] })).resolves.toBeUndefined();
    await expect(store.recordParticipation(ctx, { code: 'K7RQ2', role: 'host', pid: null, name: 'P' })).resolves.toBeUndefined();
    await expect(store.recordWin('a'.repeat(64), 5)).resolves.toBeUndefined();
    expect(rpc).toHaveBeenCalledTimes(1); // after the first miss it stops asking for a while
    expect(await store.insightsStatus()).toBe('missing');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('0003_insights.sql');
    warn.mockRestore();
  });

  it('gives the admin empty answers instead of crashing', async () => {
    const { store } = fake();
    expect(await store.insightsStatus()).toBe('missing');
    expect(await store.eventBreakdown({ from: 0, to: 1, dim: 'name' })).toEqual([]);
    expect(await store.funnel({ from: 0, to: 1, steps: ['a', 'b'] })).toEqual([{ step: 'a', any: 0, kept: 0 }, { step: 'b', any: 0, kept: 0 }]);
    expect((await store.trafficTotals(0, 1)).visitors).toBe(0);
    expect(await store.participationBreakdown(0, 1, 'city')).toEqual([]);
    expect((await store.retention(T0)).cohorts).toEqual([]);
    expect(await store.listEvents({ limit: 5, offset: 0 })).toEqual({ total: 0, rows: [] });
    expect(await store.listDevices({ limit: 5, offset: 0 })).toEqual({ total: 0, rows: [] });
    expect(await store.getDevice('aaaaaaaa')).toBeNull();
    expect(await store.gameInsights('K7RQ2')).toEqual({ participations: [], events: [] });
    expect(await store.gameHosts(['K7RQ2'])).toEqual({});
    expect(await store.listAudit(5)).toEqual([]);
    expect(await store.tableCounts()).toEqual({ games: 7, players: 7, notify_numbers: 7, devices: 0, device_ips: 0, participations: 0, events: 0, admin_audit: 0 });
    await expect(store.eraseDevice('aaaaaaaa')).rejects.toThrow(/0003_insights/);
  });

  it('treats a missing table the same way, but reports real errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await fake({ data: null, error: { code: '42P01', message: 'relation "events" does not exist' } }).store.insightsStatus()).toBe('missing');
    const broken = fake({ data: null, error: { code: '57014', message: 'statement timeout' } }).store;
    await expect(broken.insightsStatus()).rejects.toThrow(/57014/);
    await expect(broken.eventBreakdown({ from: 0, to: 1, dim: 'name' })).rejects.toThrow(/57014/);
    await expect(broken.trackBatch(requestContext(new Headers(), null, T0), { session: 'session-000001', source: 'direct', events: [] })).resolves.toBeUndefined();
    warn.mockRestore();
  });

  it('passes arguments through once the migration is there', async () => {
    const { store, rpc } = fake({ data: [{ key: 'home', events: 2, sessions: 1, devices: 1 }], error: null });
    expect(await store.insightsStatus()).toBe('ok');
    expect(await store.eventBreakdown({ from: 1000, to: 2000, dim: 'prop:page', names: ['page_view'], deviceType: 'phone' })).toEqual([{ key: 'home', events: 2, sessions: 1, devices: 1 }]);
    expect(rpc).toHaveBeenLastCalledWith('admin_event_breakdown', { p_from: '1970-01-01T00:00:01.000Z', p_to: '1970-01-01T00:00:02.000Z', p_dim: 'prop:page', p_names: ['page_view'], p_device_type: 'phone', p_source: null, p_code: null, p_limit: 500 });
  });
});
