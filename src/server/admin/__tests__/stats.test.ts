import { describe, expect, it } from 'vitest';
import { GAME_TTL_MS } from '@/core';
import type { MemberView } from '@/core';
import { actOnGame, createGameForDevice, saveNotifyNumber, viewGame } from '../../games';
import { MemoryStore } from '../../store/memory';
import { ADMIN_RETENTION_DAYS, ADMIN_RETENTION_MS } from '../../store/types';
import { hashToken } from '../../tokens';
import { allGames, gamesCsv, gamesQuery, gamesQueryString, parseGamesFilter } from '../queries';
import { adminStatus, csv, csvCell, dashboardStats, deviceStats, filterDevices, gameFacts, rangeFor, roundsOf } from '../stats';
import { DAY_MS, formatDuration, formatIst, formatIstTime, hourLabel, istDay, istDayStart, istHour, parseIstDay, shortDay } from '../time';
import { mulberry32 } from '../../../core/__tests__/helpers';

const tok = (n: number) => hashToken(`${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`);
const PRIYA = tok(1), MEERA = tok(2), NANI = tok(3), RAVI = tok(4);
const short = (h: string) => h.slice(0, 8);

// 12 Nov 2026, 10:00 am IST
const T0 = Date.UTC(2026, 10, 12, 4, 30);

function world(start = T0) {
  let now = start;
  const store = new MemoryStore(undefined, () => now);
  const deps = { store, now: () => now, rng: mulberry32(7) };
  const must = async <T extends { ok: boolean }>(p: Promise<T>): Promise<Extract<T, { ok: true }>> => {
    const r = await p;
    if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
    return r as Extract<T, { ok: true }>;
  };
  const api = {
    store,
    deps,
    now: () => now,
    tick: (ms: number) => { now += ms; },
    create: async (who: string, input: object) => (await must(createGameForDevice(who, input, deps))).code,
    act: (code: string, who: string, action: object) => must(actOnGame(code, who, action, deps)),
    view: async (code: string, who: string) => (await must(viewGame(code, who, deps))).game as MemberView,
    /** Draw until `who` can claim the top line, then claim it. Returns how many numbers were called in all. */
    winTop: async (code: string, host: string, who: string): Promise<number> => {
      const want = (await api.view(code, who)).you.ticket![0].filter(Boolean);
      for (;;) {
        const g = await api.view(code, who);
        if (want.every((n) => g.called.includes(n))) break;
        await api.act(code, host, { type: 'draw' });
        now += 1000;
      }
      for (const n of want) await api.act(code, who, { type: 'mark', n, on: true });
      const r = await api.act(code, who, { type: 'claim', prizeId: 'top' });
      return r.game.status === 'done' ? (r.game as MemberView).called.length : -1;
    },
  };
  return api;
}

describe('India time helpers', () => {
  it('uses UTC+05:30', () => {
    const t = Date.UTC(2026, 10, 12, 16, 11, 7); // 9:41:07 pm IST
    expect(formatIst(t)).toBe('12 Nov 2026, 9:41 pm IST');
    expect(formatIstTime(t)).toBe('9:41:07 pm IST');
    expect(istHour(t)).toBe(21);
    expect(istDay(t)).toBe('2026-11-12');
    // 18:30 UTC is midnight in India: the next day begins
    expect(istDay(Date.UTC(2026, 10, 12, 18, 29, 59))).toBe('2026-11-12');
    expect(istDay(Date.UTC(2026, 10, 12, 18, 30))).toBe('2026-11-13');
    expect(formatIst(Date.UTC(2026, 10, 12, 18, 30))).toBe('13 Nov 2026, 12:00 am IST');
    expect(formatIst(Date.UTC(2026, 10, 12, 6, 30))).toBe('12 Nov 2026, 12:00 pm IST');
    expect(formatIst(null)).toBe('—');
  });
  it('finds the start of an India day and parses days', () => {
    const t = Date.UTC(2026, 10, 12, 16, 11);
    expect(istDayStart(t)).toBe(Date.UTC(2026, 10, 11, 18, 30));
    expect(parseIstDay('2026-11-12')).toBe(Date.UTC(2026, 10, 11, 18, 30));
    expect(istDay(parseIstDay('2026-11-12')!)).toBe('2026-11-12');
    for (const bad of ['2026-02-30', '2026-13-01', 'yesterday', '', undefined, '2026-1-2']) expect(parseIstDay(bad)).toBeNull();
  });
  it('formats the small things', () => {
    expect(shortDay('2026-11-02')).toBe('2 Nov');
    expect([0, 1, 11, 12, 13, 23].map(hourLabel)).toEqual(['12 am', '1 am', '11 am', '12 pm', '1 pm', '11 pm']);
    expect([0, 38_000, 245_000, 4_320_000].map(formatDuration)).toEqual(['0s', '38s', '4m 05s', '1h 12m']);
    expect(formatDuration(null)).toBe('—');
  });
  it('builds ranges of whole India days ending today', () => {
    const now = Date.UTC(2026, 10, 12, 16, 11);
    const today = rangeFor('today', now);
    expect(today.days).toEqual(['2026-11-12']);
    expect(today.to - today.from).toBe(DAY_MS);
    const week = rangeFor('7d', now);
    expect(week.days).toHaveLength(7);
    expect(week.days[0]).toBe('2026-11-06');
    expect(week.days[6]).toBe('2026-11-12');
    expect(week.from).toBe(parseIstDay('2026-11-06'));
    expect(rangeFor('30d', now).days).toHaveLength(30);
    expect(rangeFor('90d', now).days).toHaveLength(90);
    expect(rangeFor('90d', now).days[0]).toBe('2026-08-15');
  });
});

describe('admin rows from the memory store', () => {
  it('carry the public document and short device ids — never a ticket, marks or a token hash', async () => {
    const w = world();
    const code = await w.create(PRIYA, { hostName: 'Priya', name: 'Diwali Night', price: 50, prizes: ['top', 'full'] });
    await w.act(code, MEERA, { type: 'join', name: 'Meera' });
    await w.act(code, PRIYA, { type: 'start' });
    await w.act(code, PRIYA, { type: 'draw' });
    const called = (await w.view(code, MEERA)).called[0];
    const onTicket = (await w.view(code, MEERA)).you.ticket!.flat().includes(called);
    if (onTicket) await w.act(code, MEERA, { type: 'mark', n: called, on: true });

    const row = (await w.store.adminGetGame(code))!;
    expect(Object.keys(row).sort()).toEqual(['code', 'createdAt', 'devices', 'doc', 'erased', 'hostDevice', 'updatedAt']);
    expect(row.hostDevice).toBe(short(PRIYA));
    expect(Object.values(row.devices).sort()).toEqual([short(PRIYA), short(MEERA)].sort());
    expect(row.doc.events.map((e) => e.kind)).toEqual(['join', 'start', 'call']);
    const list = await w.store.adminListGames({ limit: 25, offset: 0 });
    expect(list.total).toBe(1);
    expect(list.rows[0].doc.events).toEqual([]);
    for (const text of [JSON.stringify(row), JSON.stringify(list), JSON.stringify(await w.store.adminGamesInRange({}))]) {
      expect(text).not.toMatch(/ticket|marks|tokenHash|token_hash/);
      expect(text).not.toContain(PRIYA);
      expect(text).not.toContain(MEERA);
    }
    // the store's raw rows do hold tickets (this is what must never reach the admin)
    expect(w.store.rawPlayers(code)!.every((p) => p.ticket.length === 3)).toBe(true);
  });

  it('filters, sorts and pages', async () => {
    const w = world();
    const a = await w.create(PRIYA, { hostName: 'Priya', name: 'Diwali Night', prizes: ['top'] });
    w.tick(60_000);
    const b = await w.create(RAVI, { hostName: 'Ravi', name: 'Kitty Party', hostPlays: false, prizes: ['top'] });
    w.tick(60_000);
    const c = await w.create(PRIYA, { hostName: 'Priya', name: 'Sunday', prizes: ['top'] });
    await w.act(b, MEERA, { type: 'join', name: 'Meera' });
    await w.act(b, NANI, { type: 'join', name: 'Nani' });
    await w.act(b, RAVI, { type: 'start' });
    w.tick(60_000);
    await w.act(a, MEERA, { type: 'join', name: 'Meera' });

    const codes = async (q: Parameters<MemoryStore['adminListGames']>[0]) => (await w.store.adminListGames(q)).rows.map((r) => r.code);
    const page = { limit: 25, offset: 0 };
    expect(await codes(page)).toEqual([c, b, a]); // newest first
    expect(await codes({ ...page, dir: 'asc' })).toEqual([a, b, c]);
    expect(await codes({ ...page, sort: 'players' })).toEqual(expect.arrayContaining([a, b, c]));
    expect((await codes({ ...page, sort: 'players' }))[2]).toBe(c);
    expect((await codes({ ...page, sort: 'activity' }))[0]).toBe(a);
    expect(await codes({ ...page, search: 'kitty' })).toEqual([b]);
    expect(await codes({ ...page, search: 'PRIYA' })).toEqual([c, a]);
    expect(await codes({ ...page, search: b.toLowerCase() })).toEqual([b]);
    expect(await codes({ ...page, status: 'live' })).toEqual([b]);
    expect(await codes({ ...page, status: 'lobby' })).toEqual([c, a]);
    expect(await codes({ ...page, status: 'open' })).toEqual([c, b, a]);
    expect(await codes({ ...page, status: 'done' })).toEqual([]);
    expect(await codes({ ...page, device: short(MEERA) })).toEqual([b, a]);
    expect(await codes({ ...page, device: short(RAVI) })).toEqual([b]); // a host without a ticket still counts
    expect(await codes({ ...page, from: T0 + 60_000 })).toEqual([c, b]);
    expect(await codes({ ...page, to: T0 + 60_000 })).toEqual([a]);
    expect(await codes({ limit: 2, offset: 0 })).toEqual([c, b]);
    expect(await codes({ limit: 2, offset: 2 })).toEqual([a]);
    expect((await w.store.adminListGames({ limit: 1, offset: 0 })).total).toBe(3);
    expect((await w.store.adminListGames({ limit: 100000, offset: 0 })).rows).toHaveLength(3);
    // "expired": left in the lobby or mid-game for 24 hours
    w.tick(GAME_TTL_MS + 1);
    expect(await codes({ ...page, status: 'expired' })).toEqual([c, b, a]);
    expect(await codes({ ...page, status: 'open' })).toEqual([]);
    expect(await codes({ ...page, activeSince: w.now() - 15 * 60_000 })).toEqual([]);
  });
});

describe('dashboard statistics', () => {
  it('counts what was seeded', async () => {
    const w = world();
    // 1. a finished game with a ticket price: 3 players, Meera wins the only prize
    const done = await w.create(PRIYA, { hostName: 'Priya', name: 'Diwali Night', price: 50, prizes: ['top'] });
    await w.act(done, MEERA, { type: 'join', name: 'Meera' });
    await w.act(done, NANI, { type: 'join', name: 'Nani' });
    await w.act(done, PRIYA, { type: 'start' });
    const calledDone = await w.winTop(done, PRIYA, MEERA);
    expect(calledDone).toBeGreaterThanOrEqual(5);
    // 2. a live game, no price, host without a ticket; Meera plays here as "Meera Aunty"
    w.tick(3 * 60 * 60_000); // 1 pm IST-ish
    const live = await w.create(RAVI, { hostName: 'Ravi', name: 'Kitty Party', hostPlays: false, prizes: ['top', 'full'] });
    await w.act(live, MEERA, { type: 'join', name: 'Meera Aunty' });
    await w.act(live, RAVI, { type: 'start' });
    await w.act(live, RAVI, { type: 'draw' });
    // 3. a lobby, created yesterday
    const lobbyWorldTime = w.now();
    const lobby = await w.create(NANI, { hostName: 'Nani', prizes: ['full'] });
    await saveNotifyNumber('9810011001', w.deps);

    const now = w.now();
    const range = rangeFor('7d', now);
    const rows = (await w.store.adminGamesInRange({ from: range.from, to: range.to })).rows;
    const s = dashboardStats(rows, range.days, now);
    expect(s.gamesCreated).toBe(3);
    expect(s.gamesStarted).toBe(2);
    expect(s.gamesFinished).toBe(1);
    expect(s.totalPlayers).toBe(3 + 1 + 1);
    expect(s.uniqueDevices).toBe(4);
    expect(s.avgPlayers).toBeCloseTo(5 / 3);
    expect(s.finishedRounds).toBe(1);
    expect(s.avgCalled).toBe(calledDone);
    expect(s.pricedGames).toBe(1);
    expect(s.pricedShare).toBeCloseTo(1 / 3);
    expect(s.pot).toBe(150); // ₹50 × 3 players, recorded only
    expect(s.daily).toHaveLength(7);
    expect(s.daily[6]).toEqual({ day: '2026-11-12', games: 3, players: 5 });
    expect(s.daily.slice(0, 6).every((d) => d.games === 0 && d.players === 0)).toBe(true);
    expect(s.hours.reduce((a, b) => a + b, 0)).toBe(3);
    expect(s.hours[10]).toBe(1);
    expect(s.hours[istHour(lobbyWorldTime)]).toBe(2);
    expect(s.picked).toEqual([{ rule: 'full', label: 'Full House', count: 2 }, { rule: 'top', label: 'Top Line', count: 2 }]);
    expect(s.won).toEqual([{ rule: 'top', label: 'Top Line', count: 1 }]);
    expect(await w.store.adminCountNotifyNumbers(range.from, range.to)).toBe(1);
    expect(await w.store.adminCountNotifyNumbers(range.from, range.from + 1)).toBe(0);

    // facts of single games
    const byCode = new Map(rows.map((r) => [r.code, gameFacts(r, now)]));
    expect(byCode.get(done)).toMatchObject({ status: 'done', players: 3, called: calledDone, prizesWon: 1, prizesTotal: 1, price: 50, pot: 150, started: true, finished: true });
    expect(byCode.get(done)!.durationMs).toBeGreaterThan(0);
    expect(byCode.get(live)).toMatchObject({ status: 'live', players: 1, called: 1, prizesWon: 0, prizesTotal: 2, pot: 0, started: true, finished: false });
    expect(byCode.get(lobby)).toMatchObject({ status: 'lobby', players: 1, called: 0, started: false, finished: false, startedAt: null, durationMs: null });

    // devices: Meera's phone played twice under two names
    const devices = deviceStats(rows);
    expect(devices).toHaveLength(4);
    const meera = devices.find((d) => d.id === short(MEERA))!;
    expect(meera).toMatchObject({ joined: 2, hosted: 0, prizesWon: 1, amount: 150, names: ['Meera Aunty', 'Meera'] });
    expect(meera.games.map((g) => g.code)).toEqual([live, done]);
    expect(meera.games[1]).toMatchObject({ role: 'player', playedAs: 'Meera', wins: 1, amount: 150, prizeLabels: ['Top Line'] });
    expect(devices.find((d) => d.id === short(RAVI))).toMatchObject({ joined: 0, hosted: 1, names: ['Ravi'] });
    expect(devices.find((d) => d.id === short(RAVI))!.games[0]).toMatchObject({ role: 'host', hasTicket: false });
    expect(devices.find((d) => d.id === short(PRIYA))).toMatchObject({ joined: 0, hosted: 1, prizesWon: 0 });
    expect(devices.find((d) => d.id === short(NANI))).toMatchObject({ joined: 1, hosted: 1, names: ['Nani'] });
    expect(filterDevices(devices, { search: 'aunty' }).map((d) => d.id)).toEqual([short(MEERA)]);
    expect(filterDevices(devices, { search: 'zzz' })).toEqual([]);
    expect(filterDevices(devices, { sort: 'amount' })[0].id).toBe(short(MEERA));
    expect(filterDevices(devices, { sort: 'games', dir: 'desc' }).slice(0, 2).map((d) => d.id).sort()).toEqual([short(MEERA), short(NANI)].sort());
    expect(JSON.stringify(devices)).not.toContain(MEERA);
  });

  it('remembers earlier rounds when the host plays again', async () => {
    const w = world();
    const code = await w.create(PRIYA, { hostName: 'Priya', price: 10, prizes: ['top'] });
    await w.act(code, MEERA, { type: 'join', name: 'Meera' });
    await w.act(code, PRIYA, { type: 'start' });
    const called = await w.winTop(code, PRIYA, MEERA);
    w.tick(5000);
    await w.act(code, PRIYA, { type: 'newRound' });
    const row = (await w.store.adminGetGame(code))!;
    const rounds = roundsOf(row.doc);
    expect(rounds).toHaveLength(2);
    expect(rounds[0]).toMatchObject({ round: 1, called, players: 2, current: false, started: true, finished: true });
    expect(rounds[0].prizes[0]).toMatchObject({ winnerName: 'Meera', amount: 20 });
    expect(rounds[1]).toMatchObject({ round: 2, called: 0, current: true, started: false, finished: false, startedAt: null });
    const s = dashboardStats([row], rangeFor('today', w.now()).days, w.now());
    expect(s).toMatchObject({ gamesCreated: 1, gamesStarted: 1, gamesFinished: 1, finishedRounds: 1, avgCalled: called, pot: 20 });
    expect(s.won).toEqual([{ rule: 'top', label: 'Top Line', count: 1 }]);
    expect(gameFacts(row, w.now())).toMatchObject({ status: 'lobby', round: 2, prizesWon: 0, started: true, finished: true });
    expect(deviceStats([row]).find((d) => d.id === short(MEERA))).toMatchObject({ prizesWon: 1, amount: 20 });
    // the history never goes to a browser
    expect('history' in (await w.view(code, MEERA))).toBe(false);
    expect('history' in (await w.view(code, PRIYA))).toBe(false);
  });

  it('is all zeros for no games', () => {
    const s = dashboardStats([], rangeFor('7d', T0).days, T0);
    expect(s).toMatchObject({ gamesCreated: 0, gamesStarted: 0, totalPlayers: 0, uniqueDevices: 0, avgPlayers: 0, avgCalled: 0, pricedShare: 0, pot: 0, picked: [], won: [] });
    expect(s.daily.every((d) => d.games === 0)).toBe(true);
  });
});

describe('retention in the memory store', () => {
  it('at 24 hours: the game is gone for players, tickets and dabs are erased, the summary stays', async () => {
    const w = world();
    const code = await w.create(PRIYA, { hostName: 'Priya', name: 'Diwali Night', price: 50, prizes: ['top', 'full'] });
    await w.act(code, MEERA, { type: 'join', name: 'Meera' });
    await w.act(code, PRIYA, { type: 'start' });
    await w.winTop(code, PRIYA, MEERA);
    const before = w.store.rawPlayers(code)!;
    expect(before.every((p) => p.ticket.length === 3)).toBe(true);
    expect(before.some((p) => p.marks.length > 0)).toBe(true);

    w.tick(GAME_TTL_MS + 1);
    // the public app: not found, for everyone, for reads and writes
    for (const who of [PRIYA, MEERA, NANI]) expect(await viewGame(code, who, w.deps)).toMatchObject({ ok: false, status: 404, notFound: true });
    expect(await actOnGame(code, PRIYA, { type: 'draw' }, w.deps)).toMatchObject({ ok: false, status: 404 });
    expect(await actOnGame(code, NANI, { type: 'join', name: 'Nani' }, w.deps)).toMatchObject({ ok: false, status: 404 });
    expect(await w.store.load(code)).toBeNull();
    expect(await w.store.commit(code, 1, { doc: null, players: [] })).toBe('conflict');
    await w.store.touch(code); // must not bring it back
    expect(await w.store.load(code)).toBeNull();

    // private data: erased; identity columns: kept
    const after = w.store.rawPlayers(code)!;
    expect(after.map((p) => p.pid)).toEqual(before.map((p) => p.pid));
    expect(after.map((p) => p.tokenHash)).toEqual(before.map((p) => p.tokenHash));
    expect(after.every((p) => p.ticket.length === 0 && p.marks.length === 0)).toBe(true);

    // the admin still has the summary
    const row = (await w.store.adminGetGame(code))!;
    expect(row.erased).toBe(true);
    expect(row.doc).toMatchObject({ name: 'Diwali Night', hostName: 'Priya', price: 50, status: 'live' });
    expect(row.doc.players.map((p) => p.name)).toEqual(['Priya', 'Meera']);
    expect(row.doc.prizes[0]).toMatchObject({ winnerName: 'Meera' });
    expect(row.doc.called.length).toBeGreaterThan(0);
    expect(adminStatus(row, w.now())).toBe('expired');
    expect(Object.values(row.devices).sort()).toEqual([short(PRIYA), short(MEERA)].sort());
  });

  it('purge() erases at 24 hours even if nobody asks for the game again', async () => {
    const w = world();
    const code = await w.create(PRIYA, { hostName: 'Priya', prizes: ['top'] });
    const other = await w.create(RAVI, { hostName: 'Ravi', prizes: ['top'] });
    w.tick(GAME_TTL_MS - 1000);
    await w.store.touch(other);
    expect(await w.store.purge()).toBe(0);
    w.tick(2000);
    expect(w.store.rawPlayers(code)![0].ticket).toHaveLength(3);
    expect(await w.store.purge()).toBe(1);
    expect(w.store.rawPlayers(code)![0]).toMatchObject({ ticket: [], marks: [] });
    expect(w.store.rawPlayers(other)![0].ticket).toHaveLength(3); // still active: untouched
    expect(await w.store.purge()).toBe(0);
    expect((await w.store.load(other))!.players[0].ticket).toHaveLength(3);
  });

  it(`after ${ADMIN_RETENTION_DAYS} days the game is deleted for good`, async () => {
    const w = world();
    const code = await w.create(PRIYA, { hostName: 'Priya', prizes: ['top'] });
    w.tick(ADMIN_RETENTION_MS - 1000);
    expect(await w.store.adminGetGame(code)).not.toBeNull();
    expect((await w.store.adminListGames({ limit: 25, offset: 0 })).total).toBe(1);
    w.tick(2000);
    expect(await w.store.adminGetGame(code)).toBeNull();
    expect(w.store.rawPlayers(code)).toBeNull();
    expect((await w.store.adminListGames({ limit: 25, offset: 0 })).total).toBe(0);
    expect(ADMIN_RETENTION_DAYS).toBe(90);
  });

  it('a new game never takes the code of a retained one', async () => {
    let now = T0;
    const store = new MemoryStore(undefined, () => now);
    const a = await createGameForDevice(PRIYA, { hostName: 'P', hostPlays: false, prizes: ['full'] }, { store, now: () => now, rng: () => 0 });
    expect(a).toMatchObject({ ok: true, code: 'AAAAA' });
    now += GAME_TTL_MS + 1; // expired, but retained
    const seq = [0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const b = await createGameForDevice(RAVI, { hostName: 'R', hostPlays: false, prizes: ['full'] }, { store, now: () => now, rng: () => seq[i++ % seq.length] });
    expect(b).toMatchObject({ ok: true, code: 'SSSSS' });
    expect((await store.adminGetGame('AAAAA'))!.doc.hostName).toBe('P');
    // once the old game is past the retention period its code is free again
    now += ADMIN_RETENTION_MS;
    i = 0;
    const c = await createGameForDevice(RAVI, { hostName: 'New', hostPlays: false, prizes: ['full'] }, { store, now: () => now, rng: () => 0 });
    expect(c).toMatchObject({ ok: true, code: 'AAAAA' });
    expect((await store.adminGetGame('AAAAA'))!.doc.hostName).toBe('New');
  });

  it('notify-me numbers keep the time they were first saved', async () => {
    const w = world();
    await saveNotifyNumber('9810011001', w.deps);
    w.tick(60_000);
    await saveNotifyNumber('9810011002', w.deps);
    await saveNotifyNumber('9810011001', w.deps);
    expect(await w.store.adminListNotifyNumbers({ limit: 100, offset: 0 })).toEqual({
      total: 2,
      rows: [{ phone: '9810011002', createdAt: T0 + 60_000 }, { phone: '9810011001', createdAt: T0 }],
    });
    expect((await w.store.adminListNotifyNumbers({ limit: 1, offset: 1 })).rows).toEqual([{ phone: '9810011001', createdAt: T0 }]);
  });
});

describe('plays filter and export', () => {
  const now = Date.UTC(2026, 10, 12, 16, 11);

  it('cleans up what is typed in the address bar', () => {
    expect(parseGamesFilter({}, now)).toEqual({ q: '', status: '', from: '', to: '', sort: 'created', dir: 'desc', page: 1 });
    expect(parseGamesFilter({ q: '  kitty ', status: 'live', from: '2026-11-01', to: '2026-11-10', sort: 'players', dir: 'asc', page: '3' }, now))
      .toEqual({ q: 'kitty', status: 'live', from: '2026-11-01', to: '2026-11-10', sort: 'players', dir: 'asc', page: 3 });
    expect(parseGamesFilter({ status: 'nope', sort: 'drop table', dir: 'sideways', page: '-4', from: 'x', to: '2026-02-31' }, now))
      .toEqual({ q: '', status: '', from: '', to: '', sort: 'created', dir: 'desc', page: 1 });
    // swapped dates are put in order; dates outside the 90 days are pulled in
    expect(parseGamesFilter({ from: '2026-11-10', to: '2026-11-01' }, now)).toMatchObject({ from: '2026-11-01', to: '2026-11-10' });
    expect(parseGamesFilter({ from: '2020-01-01', to: '2030-01-01' }, now)).toMatchObject({ from: '2026-08-14', to: '2026-11-12' });
    expect(parseGamesFilter(new URLSearchParams('q=a&q=b&status=done'), now)).toMatchObject({ q: 'a', status: 'done' });
    expect(parseGamesFilter({ q: ['x', 'y'] }, now).q).toBe('x');
    expect(parseGamesFilter({ q: 'z'.repeat(500) }, now).q).toHaveLength(60);
  });

  it('never asks the store for more than 90 days or 100 rows', () => {
    const q = gamesQuery(parseGamesFilter({}, now), now);
    expect(q.from).toBeGreaterThanOrEqual(now - 91 * DAY_MS);
    expect(q.limit).toBe(25);
    const dated = gamesQuery(parseGamesFilter({ from: '2026-11-01', to: '2026-11-10', page: '2' }, now), now);
    expect(dated).toMatchObject({ from: parseIstDay('2026-11-01'), to: parseIstDay('2026-11-11'), offset: 25 });
  });

  it('writes the filter back as a query string', () => {
    const f = parseGamesFilter({ q: 'kitty party', status: 'done', sort: 'players' }, now);
    expect(gamesQueryString(f)).toBe('?q=kitty+party&status=done&sort=players');
    expect(gamesQueryString(f, { page: 2 })).toBe('?q=kitty+party&status=done&sort=players&page=2');
    expect(gamesQueryString(parseGamesFilter({}, now))).toBe('');
  });

  it('exports every page of the filter as CSV, defusing spreadsheet formulas', async () => {
    const w = world();
    for (let i = 0; i < 130; i++) {
      await w.create(PRIYA, { hostName: i === 0 ? '=cmd()' : 'Priya', name: i === 1 ? 'Tea, "cake" & more' : `Game ${i}`, price: i === 2 ? 100 : 0, prizes: ['top'] });
      w.tick(1000);
    }
    const rows = await allGames(parseGamesFilter({}, w.now()), w.now(), w.store);
    expect(rows).toHaveLength(130);
    const text = gamesCsv(rows, w.now());
    const lines = text.trimEnd().split('\r\n');
    expect(lines).toHaveLength(131);
    expect(lines[0]).toBe('Created (IST),Code,Game name,Host,Status,Players,Numbers called,Round,Ticket price (INR),Prizes won,Prizes total,Recorded pot (INR),Last activity (IST)');
    expect(lines[130]).toContain(",'=cmd(),Lobby,1,0,1,0,0,1,0,");
    expect(lines[129]).toContain(',"Tea, ""cake"" & more",Priya,Lobby,');
    expect(lines[128]).toContain(',Game 2,Priya,Lobby,1,0,1,100,0,1,0,');
    expect(lines[1]).toMatch(/^"12 Nov 2026, \d+:\d\d [ap]m IST",[A-Z2-9]{5},Game 129,Priya,Lobby,/);
    expect(text).not.toMatch(/marks|tokenHash|\[\[/); // (the only "ticket" in it is the "Ticket price" column)
    expect((await allGames(parseGamesFilter({ q: 'game 12' }, w.now()), w.now(), w.store)).length).toBe(11);
  });

  it('csv cells', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+91')).toBe("'+91");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@x')).toBe("'@x");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(null)).toBe('');
    expect(csv(['a', 'b'], [[1, 'x'], [2, null]])).toBe('a,b\r\n1,x\r\n2,\r\n');
  });
});
