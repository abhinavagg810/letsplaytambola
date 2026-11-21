// The admin's own helpers for the analytics pages: the global date range, deltas, the aggregate cache,
// game statistics, the quick filters of the plays table, and the labels the aggregates' keys are shown with.
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { actOnGame, createGameForDevice } from '../../games';
import { ABANDONED_AFTER_MS } from '../../store';
import { MemoryStore } from '../../store/memory';
import { hashToken } from '../../tokens';
import { cached, clearAdminCache } from '../cache';
import { devicesCsv, eventsCsv, parseDevicesFilter, parseEventsFilter } from '../exports';
import { gameDistributions, gameOverview, histogram, quantile, summarise, summariseCounts } from '../gameStats';
import { cityLabel, countryLabel, dailySeries, heatGrid, regionLabel, sourceLabel } from '../labels';
import { gamesQuery, parseGamesFilter } from '../queries';
import { delta, parseRange, rangeParams, withRange } from '../range';
import { DAY_MS, istDay } from '../time';

const NOW = Date.UTC(2026, 10, 20, 9, 30); // 20 Nov 2026, 3 pm IST

describe('the global date range', () => {
  it('defaults to the last 7 India days ending today', () => {
    const r = parseRange({}, NOW);
    expect(r).toMatchObject({ key: '7d', fromDay: '2026-11-14', toDay: '2026-11-20', label: 'Last 7 days', cmp: false });
    expect(r.days).toHaveLength(7);
    expect(r.to - r.from).toBe(7 * DAY_MS);
    expect(r.prev.days).toEqual(['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(r.prev.to).toBe(r.from);
  });
  it('knows today, yesterday, 30 and 90 days', () => {
    expect(parseRange({ range: 'today' }, NOW)).toMatchObject({ fromDay: '2026-11-20', toDay: '2026-11-20', label: 'Today' });
    expect(parseRange({ range: 'yesterday' }, NOW)).toMatchObject({ fromDay: '2026-11-19', toDay: '2026-11-19', label: 'Yesterday' });
    expect(parseRange({ range: 'yesterday' }, NOW).prev.days).toEqual(['2026-11-18']);
    expect(parseRange({ range: '30d' }, NOW).days).toHaveLength(30);
    expect(parseRange(new URLSearchParams('range=90d&cmp=1'), NOW)).toMatchObject({ key: '90d', cmp: true, fromDay: '2026-08-23' });
    expect(parseRange({ range: 'forever' }, NOW).key).toBe('7d');
  });
  it('takes a custom range in either order and keeps it inside the 90 days', () => {
    expect(parseRange({ range: 'custom', from: '2026-11-10', to: '2026-11-03' }, NOW)).toMatchObject({ key: 'custom', fromDay: '2026-11-03', toDay: '2026-11-10', label: '3 Nov – 10 Nov' });
    expect(parseRange({ range: 'custom', from: '2020-01-01', to: '2030-01-01' }, NOW)).toMatchObject({ fromDay: '2026-08-23', toDay: '2026-11-20' });
    expect(parseRange({ range: 'custom', from: '2020-01-01', to: '2020-02-01' }, NOW)).toMatchObject({ fromDay: '2026-08-23', toDay: '2026-08-23' });
    expect(parseRange({ range: 'custom', from: '2026-11-05' }, NOW)).toMatchObject({ fromDay: '2026-11-05', toDay: '2026-11-05', label: '5 Nov' });
    expect(parseRange({ range: 'custom', from: 'x', to: '2026-02-31' }, NOW).key).toBe('7d');
    expect(parseRange({ range: 'custom', from: '2026-08-01', to: '2026-11-20' }, NOW).days.length).toBeLessThanOrEqual(90);
  });
  it('travels in the URL, leaving defaults out', () => {
    expect(rangeParams(parseRange({}, NOW)).toString()).toBe('');
    expect(withRange('/admin/games', parseRange({ range: '30d', cmp: '1' }, NOW))).toBe('/admin/games?range=30d&cmp=1');
    expect(withRange('/admin/events', parseRange({ range: 'custom', from: '2026-11-01', to: '2026-11-02' }, NOW), { name: 'join_ok', page: undefined, code: '' }))
      .toBe('/admin/events?range=custom&from=2026-11-01&to=2026-11-02&name=join_ok');
  });
  it('works out the change against the previous period', () => {
    expect(delta(150, 100)).toEqual({ pct: 0.5, dir: 'up' });
    expect(delta(50, 100)).toEqual({ pct: -0.5, dir: 'down' });
    expect(delta(100, 100)).toEqual({ pct: 0, dir: 'flat' });
    expect(delta(5, 0)).toEqual({ pct: null, dir: 'new' });
    expect(delta(0, 0)).toEqual({ pct: 0, dir: 'flat' });
    expect(delta(Number.NaN, 3).pct).toBeNull();
  });
});

describe('the aggregate cache', () => {
  it('loads once per key within 30 seconds, then again', async () => {
    clearAdminCache();
    const load = vi.fn(async () => 42);
    expect(await cached('k', load, { now: 1000 })).toBe(42);
    expect(await cached('k', load, { now: 20_000 })).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
    await cached('k', load, { now: 31_001 });
    expect(load).toHaveBeenCalledTimes(2);
    await cached('other', load, { now: 31_002 });
    expect(load).toHaveBeenCalledTimes(3);
    await cached('k', load, { now: 31_003, fresh: true });
    expect(load).toHaveBeenCalledTimes(4);
    clearAdminCache();
    await cached('k', load, { now: 31_004 });
    expect(load).toHaveBeenCalledTimes(5);
  });
  it('does not keep a failure', async () => {
    clearAdminCache();
    let n = 0;
    const load = async () => { n++; if (n === 1) throw new Error('down'); return 'ok'; };
    await expect(cached('f', load, { now: 1 })).rejects.toThrow('down');
    await new Promise((r) => setTimeout(r, 0));
    expect(await cached('f', load, { now: 2 })).toBe('ok');
  });
});

describe('game statistics', () => {
  it('quantiles, summaries and histograms', () => {
    expect(quantile([], 0.5)).toBeNull();
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.25)).toBe(10);
    expect(summarise([4, 1, 3, 2])).toEqual({ n: 4, p25: 1.75, median: 2.5, p75: 3.25, mean: 2.5 });
    expect(summariseCounts([[30, 2], [40, 1], [50, 1]])).toMatchObject({ n: 4, median: 35 });
    expect(histogram([0, 1, 1, 7, 99], [0, 1, 5], ['0', '1', '2–5', '6+']).map((b) => b.count)).toEqual([1, 2, 0, 2]);
  });

  it('overview and distributions from real games', async () => {
    let now = NOW;
    const store = new MemoryStore(undefined, () => now);
    const h = { a: hashToken(randomUUID()), b: hashToken(randomUUID()), c: hashToken(randomUUID()) };
    // Game 1: priced ₹50, host + 2 players, played to the end (the only prize is won at once by calling everything).
    const g1 = await createGameForDevice(h.a, { hostName: 'Priya', prizes: ['full'], price: 50 }, { store, now: () => now });
    if (!g1.ok) throw new Error('create');
    now += 60_000;
    await actOnGame(g1.code, h.b, { type: 'join', name: 'Meera' }, { store, now: () => now });
    now += 30_000;
    await actOnGame(g1.code, h.c, { type: 'join', name: 'Ravi' }, { store, now: () => now });
    now += 30_000;
    await actOnGame(g1.code, h.a, { type: 'start' }, { store, now: () => now });
    for (let i = 0; i < 90; i++) { now += 5000; await actOnGame(g1.code, h.a, { type: 'draw' }, { store, now: () => now }); }
    // Game 2: created the day before, never started, nobody joined.
    now = NOW - DAY_MS;
    await createGameForDevice(h.b, { hostName: 'Meera', prizes: ['top', 'full'], hostPlays: false }, { store, now: () => now });
    now = NOW + 3 * 60 * 60_000;

    const rows = (await store.adminGamesInRange({ from: NOW - 7 * DAY_MS })).rows;
    const days = parseRange({}, NOW).days;
    const o = gameOverview(rows, days, now);
    expect(o).toMatchObject({ created: 2, started: 1, finished: 1, players: 3, uniqueDevices: 3, avgPlayers: 1.5, finishedRounds: 1, completionRate: 1, ticketMoney: 150, prizeMoney: 150, pricedGames: 1 });
    expect(o.avgDurationMs).toBe(90 * 5000);
    expect(o.daily.find((d) => d.day === istDay(NOW))).toMatchObject({ created: 1, started: 1, finished: 1, players: 3 });
    expect(o.daily.find((d) => d.day === istDay(NOW - DAY_MS))).toMatchObject({ created: 1, started: 0, players: 0 });
    expect(o.heat.flat().reduce((a, b) => a + b, 0)).toBe(2);
    expect(o.heat[4][15]).toBe(1); // Friday 3 pm IST
    expect(o.picked[0]).toMatchObject({ rule: 'full', count: 2 });

    const d = gameDistributions(rows, now);
    expect(d).toMatchObject({ games: 2, finishedGames: 1, replayedGames: 0, noJoin: 1, neverStarted: 1 });
    expect(d.playersPerGame.find((b) => b.label === '3')?.count).toBe(1);
    expect(d.playersPerGame.find((b) => b.label === '0')?.count).toBe(1);
    expect(d.duration.find((b) => b.label === '5–10')?.count).toBe(1);
    expect(d.toFirstJoinMs.median).toBe(60_000);
    expect(d.toStartMs.median).toBe(120_000);
    expect(d.lobbyMs.median).toBe(60_000);
    expect(d.called.median).toBe(90);
    expect(d.prizeMoneySummary.median).toBe(150);
    expect(d.rounds.map((b) => b.count)).toEqual([2, 0, 0, 0]);
  });
});

describe('plays: quick filters', () => {
  it('"with ticket price", "abandoned in lobby" and "live now"', async () => {
    let now = NOW;
    const store = new MemoryStore(undefined, () => now);
    const host = hashToken(randomUUID());
    const mk = (input: object) => createGameForDevice(host, { hostName: 'P', prizes: ['full'], ...input }, { store, now: () => now });
    const priced = await mk({ price: 20 });
    now += ABANDONED_AFTER_MS + 60_000;
    const fresh = await mk({});
    if (!priced.ok || !fresh.ok) throw new Error('create');
    const codes = async (params: Record<string, string>) => (await store.adminListGames(gamesQuery(parseGamesFilter(params, now), now))).rows.map((r) => r.code).sort();
    expect(await codes({})).toEqual([priced.code, fresh.code].sort());
    expect(await codes({ quick: 'priced' })).toEqual([priced.code]);
    expect(await codes({ quick: 'abandoned' })).toEqual([priced.code]);
    expect(await codes({ quick: 'live' })).toEqual([fresh.code]);
    expect(await codes({ quick: 'live', from: '2026-01-01', to: '2026-01-02' })).toEqual([fresh.code]); // "now" ignores the date range
    await actOnGame(fresh.code, host, { type: 'start' }, { store, now: () => now });
    now += ABANDONED_AFTER_MS + 60_000;
    expect(await codes({ quick: 'abandoned' })).toEqual([priced.code]); // a started game is not "abandoned in the lobby"
  });
});

describe('labels and exports', () => {
  it('turns aggregate keys into words', () => {
    expect(countryLabel('IN')).toBe('India');
    expect(countryLabel('')).toBe('Unknown');
    expect(regionLabel('IN-MH')).toBe('Maharashtra');
    expect(regionLabel('US-CA')).toBe('CA, United States');
    expect(cityLabel('Pune|MH|IN')).toEqual({ city: 'Pune', where: 'Maharashtra' });
    expect(cityLabel('Dubai|DU|AE')).toEqual({ city: 'Dubai', where: 'DU, United Arab Emirates' });
    expect(cityLabel('')).toEqual({ city: 'Unknown', where: '' });
    expect(sourceLabel('whatsapp')).toBe('WhatsApp');
    expect(sourceLabel('my-campaign')).toBe('my-campaign');
  });
  it('builds chart series from breakdown rows', () => {
    const rows = [{ key: '2026-11-20', events: 9, sessions: 4, devices: 3 }];
    expect(dailySeries(rows, ['2026-11-19', '2026-11-20'], 'devices').map((d) => d.value)).toEqual([0, 3]);
    const grid = heatGrid([{ key: '4-15', events: 5, sessions: 2, devices: 1 }, { key: '9-99', events: 1, sessions: 1, devices: 1 }], 'sessions');
    expect(grid[4][15]).toBe(2);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(2);
  });
  it('cleans the URL filters of the events and players tables', () => {
    expect(parseEventsFilter({ name: 'join_ok', device: 'ABCDEF12', code: 'k7rq2', session: 'session-000001', page: '2' })).toEqual({ name: 'join_ok', device: 'abcdef12', code: 'K7RQ2', session: 'session-000001', page: 2 });
    expect(parseEventsFilter({ name: 'evil', device: 'zz', code: '<x>', session: '!', page: '-1' })).toEqual({ name: '', device: '', code: '', session: '', page: 1 });
    expect(parseDevicesFilter({ q: ' pune ', played: '1', sort: 'won', dir: 'asc' })).toEqual({ q: 'pune', played: true, sort: 'won', dir: 'asc', page: 1 });
    expect(parseDevicesFilter({ sort: 'drop table' })).toMatchObject({ sort: 'lastSeen', dir: 'desc', played: false });
  });
  it('writes CSV with formulas defused', () => {
    const e = eventsCsv([{ id: 1, at: NOW, device: 'abcdef12', session: 's', name: 'page_view', code: null, path: '/', props: { page: 'home' }, country: 'IN', region: 'MH', city: '=cmd()', deviceType: 'phone', os: 'Android', browser: 'Chrome', inApp: null, source: 'direct' }]);
    expect(e.split('\r\n')[1]).toContain("page=home,,/,abcdef12,s,direct,phone,Android,Chrome,,'=cmd(),MH,IN");
    const d = devicesCsv([{ id: 'abcdef12', lastName: '+Priya', ip: '1.2.3.4', city: 'Pune', region: 'MH', country: 'IN', firstSeen: NOW, lastSeen: NOW, sessions: 2, gamesHosted: 1, gamesJoined: 0, prizesWon: 0, amountWon: 0 } as never]);
    expect(d.split('\r\n')[1]).toContain("abcdef12,'+Priya,");
    expect(d.split('\r\n')[1]).toContain('1.2.3.4,"Pune, Maharashtra, India"');
  });
});
