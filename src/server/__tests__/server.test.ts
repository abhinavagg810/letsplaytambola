import { beforeEach, describe, expect, it } from 'vitest';
import { GAME_TTL_MS } from '@/core';
import type { MemberView, VisitorView } from '@/core';
import { actOnGame, createGameForDevice, saveNotifyNumber, viewGame } from '../games';
import { LIMITS, allow, hit, resetRateLimits } from '../rateLimit';
import { broadcastChanged } from '../realtime';
import { MemoryStore } from '../store/memory';
import type { CommitWrite, GameStore } from '../store/types';
import { hashToken, isDeviceToken, tokenHashFrom } from '../tokens';
import { mulberry32 } from '../../core/__tests__/helpers';

const HOST = hashToken('11111111-1111-4111-8111-111111111111');
const MEERA = hashToken('22222222-2222-4222-8222-222222222222');
const NANI = hashToken('33333333-3333-4333-8333-333333333333');

function setup() {
  let now = 1_000_000;
  const clock = { tick: (ms: number) => { now += ms; } };
  const store = new MemoryStore(undefined, () => now);
  const deps = { store, now: () => now, rng: mulberry32(42) };
  return { store, deps, clock };
}
async function must<T extends { ok: boolean }>(p: Promise<T>): Promise<Extract<T, { ok: true }>> {
  const r = await p;
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

describe('tokens', () => {
  it('accepts UUIDs only', () => {
    expect(isDeviceToken('11111111-1111-4111-8111-111111111111')).toBe(true);
    expect(isDeviceToken('11111111-1111-4111-8111-11111111111')).toBe(false);
    expect(isDeviceToken('x'.repeat(36))).toBe(false);
    expect(isDeviceToken(undefined)).toBe(false);
  });

  it('hashes with SHA-256, case-insensitively', () => {
    expect(HOST).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken('ABCDEFAB-1111-4111-8111-111111111111')).toBe(hashToken('abcdefab-1111-4111-8111-111111111111'));
    expect(HOST).not.toBe(MEERA);
  });

  it('reads the header', () => {
    expect(tokenHashFrom(new Headers({ 'x-device-token': '11111111-1111-4111-8111-111111111111' }))).toBe(HOST);
    expect(tokenHashFrom(new Headers({ 'x-device-token': 'nope' }))).toBeNull();
    expect(tokenHashFrom(new Headers())).toBeNull();
  });
});

describe('rate limit', () => {
  beforeEach(() => resetRateLimits());

  it('allows up to max per window, then refuses until the window ends', () => {
    const limit = { max: 3, windowMs: 1000 };
    expect([1, 2, 3, 4, 5].map(() => hit('k', limit, 0))).toEqual([true, true, true, false, false]);
    expect(hit('other', limit, 0)).toBe(true);
    expect(hit('k', limit, 1000)).toBe(true);
  });

  it('limits per device and per address', () => {
    const who = { tokenHash: 'a', ip: '1.2.3.4' };
    for (let i = 0; i < LIMITS.create.token.max; i++) expect(allow('create', who, 0)).toBe(true);
    expect(allow('create', who, 0)).toBe(false);
    expect(allow('create', { tokenHash: 'b', ip: '1.2.3.4' }, 0)).toBe(true);
    expect(allow('act', who, 0)).toBe(true);
  });
});

describe('realtime', () => {
  it('is a no-op without Supabase', async () => {
    expect(await broadcastChanged('K7RQ2', 3)).toBe(false);
  });
});

describe('game service on the memory store', () => {
  it('create → the creating device is the host; others are visitors until they join', async () => {
    const { deps, store } = setup();
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['top', 'full'] }, deps));
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
    const host = (await must(viewGame(code, HOST, deps))).game as MemberView;
    expect(host.you.role).toBe('host');
    expect(host.you.ticket).toBeDefined();
    expect(host.code).toBe(code);
    expect((await must(viewGame(code.toLowerCase(), HOST, deps))).game.code).toBe(code);

    const visitor = (await must(viewGame(code, MEERA, deps))).game as VisitorView;
    expect(visitor.you).toEqual({ role: 'visitor' });
    expect((await must(viewGame(code, null, deps))).game.you.role).toBe('visitor');

    const joined = (await must(actOnGame(code, MEERA, { type: 'join', name: 'Meera' }, deps)));
    expect(joined.changedVersion).toBe(2);
    expect(joined.game.you).toMatchObject({ role: 'player', name: 'Meera' });
    const again = await must(actOnGame(code, MEERA, { type: 'join', name: 'Meera' }, deps));
    expect(again.changedVersion).toBeNull();
    expect((again.game as MemberView).players).toHaveLength(2);
    // tokens and hashes never appear in what is stored publicly or sent out
    const stored = (await store.load(code))!;
    for (const secret of [HOST, MEERA]) {
      expect(JSON.stringify(stored.doc)).not.toContain(secret);
      expect(JSON.stringify(joined.game)).not.toContain(secret);
      expect(JSON.stringify(host)).not.toContain(secret);
    }
  });

  it('refuses bad input and unknown games with the right status', async () => {
    const { deps } = setup();
    expect(await createGameForDevice(HOST, { hostName: '', prizes: ['full'] }, deps)).toMatchObject({ ok: false, status: 400, error: 'Type your name first' });
    expect(await viewGame('ZZZZZ', HOST, deps)).toMatchObject({ ok: false, status: 404, notFound: true, error: 'We can’t find game ZZZZZ' });
    expect(await viewGame('not a code!', HOST, deps)).toMatchObject({ ok: false, status: 404, notFound: true });
    expect(await actOnGame('ZZZZZ', HOST, { type: 'draw' }, deps)).toMatchObject({ ok: false, status: 404, notFound: true });
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['full'] }, deps));
    expect(await actOnGame(code, MEERA, { type: 'start' }, deps)).toMatchObject({ ok: false, status: 403, code: 'forbidden' });
    expect(await actOnGame(code, HOST, { type: 'dance' }, deps)).toMatchObject({ ok: false, status: 400 });
    expect(await actOnGame(code, HOST, { type: 'draw' }, deps)).toMatchObject({ ok: false, status: 409, code: 'state' });
  });

  it('marks are private commits: no version change, no ping', async () => {
    const { deps } = setup();
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['full'] }, deps));
    await must(actOnGame(code, MEERA, { type: 'join', name: 'Meera' }, deps));
    await must(actOnGame(code, HOST, { type: 'start' }, deps));
    let view = (await must(viewGame(code, MEERA, deps))).game as MemberView;
    const mine = view.you.ticket!.flat().filter(Boolean);
    while (!view.called.some((n) => mine.includes(n))) view = (await must(actOnGame(code, HOST, { type: 'draw' }, deps))).game as MemberView;
    const n = view.called.find((x) => mine.includes(x))!;
    const before = (await must(viewGame(code, MEERA, deps))).game.version;
    const marked = await must(actOnGame(code, MEERA, { type: 'mark', n }, deps));
    expect(marked.changedVersion).toBeNull();
    expect(marked.game.version).toBe(before);
    expect((marked.game as MemberView).you.marks).toEqual([n]);
    expect(((await must(viewGame(code, MEERA, deps))).game as MemberView).you.marks).toEqual([n]);
    // rapid taps one after another keep every dab (row revisions move on)
    await must(actOnGame(code, MEERA, { type: 'mark', n, on: false }, deps));
    await must(actOnGame(code, MEERA, { type: 'mark', n, on: true }, deps));
    expect(((await must(viewGame(code, MEERA, deps))).game as MemberView).you.marks).toEqual([n]);
  });

  it('two simultaneous claims for one prize: exactly one wins', async () => {
    const { deps } = setup();
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', hostPlays: false, prizes: ['early5', 'full'] }, deps));
    await must(actOnGame(code, MEERA, { type: 'join', name: 'Meera' }, deps));
    await must(actOnGame(code, NANI, { type: 'join', name: 'Nani' }, deps));
    await must(actOnGame(code, HOST, { type: 'start' }, deps));
    for (let i = 0; i < 60; i++) await must(actOnGame(code, HOST, { type: 'draw' }, deps));
    for (const who of [MEERA, NANI]) {
      const v = (await must(viewGame(code, who, deps))).game as MemberView;
      const hits = v.you.ticket!.flat().filter((n) => n && v.called.includes(n)).slice(0, 5);
      expect(hits).toHaveLength(5);
      for (const n of hits) await must(actOnGame(code, who, { type: 'mark', n, on: true }, deps));
    }
    const [a, b] = await Promise.all([
      actOnGame(code, MEERA, { type: 'claim', prizeId: 'early5' }, deps),
      actOnGame(code, NANI, { type: 'claim', prizeId: 'early5' }, deps),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const loser = a.ok ? b : a;
    const winnerName = a.ok ? 'Meera' : 'Nani';
    expect(loser).toMatchObject({ ok: false, status: 200, code: 'taken', error: `${winnerName} already won Early Five` });
    const final = (await must(viewGame(code, HOST, deps))).game as MemberView;
    expect(final.prizes[0].winnerName).toBe(winnerName);
    expect(final.events.filter((e) => e.kind === 'win')).toHaveLength(1);
  });

  it('retries when the store reports a conflict, and gives up politely after 5 tries', async () => {
    const { deps, store } = setup();
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['full'] }, deps));
    let failures = 2;
    let commits = 0;
    const flaky: GameStore = {
      kind: 'memory',
      create: (g, rng) => store.create(g, rng),
      load: (c) => store.load(c),
      touch: (c) => store.touch(c),
      saveNotifyNumber: (p) => store.saveNotifyNumber(p),
      commit: async (c: string, v: number, w: CommitWrite) => {
        commits++;
        if (failures > 0) { failures--; return 'conflict'; }
        return store.commit(c, v, w);
      },
    };
    const ok = await must(actOnGame(code, HOST, { type: 'start' }, { ...deps, store: flaky }));
    expect(commits).toBe(3);
    expect(ok.game.status).toBe('live');

    failures = 99;
    commits = 0;
    expect(await actOnGame(code, HOST, { type: 'draw' }, { ...deps, store: flaky })).toMatchObject({ ok: false, status: 503, code: 'busy' });
    expect(commits).toBe(5);
    expect(((await must(viewGame(code, HOST, deps))).game as MemberView).called).toEqual([]);
  });

  it('a stale commit is rejected by the store', async () => {
    const { deps, store } = setup();
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['full'] }, deps));
    const g = (await store.load(code))!;
    expect(await store.commit(code, g.version, { doc: { ...g.doc, version: 2, name: 'first' }, players: [] })).toBe('ok');
    expect(await store.commit(code, g.version, { doc: { ...g.doc, version: 2, name: 'second' }, players: [] })).toBe('conflict');
    expect((await store.load(code))!.doc).toMatchObject({ name: 'first', version: 2 });
    // a stale player rev is rejected too, and the document that came with it is not written
    const row = (await store.load(code))!.players[0];
    expect(await store.commit(code, 2, { doc: null, players: [{ pid: row.pid, ticket: row.ticket, marks: [5], rev: row.rev }] })).toBe('ok');
    expect(await store.commit(code, 2, { doc: { ...g.doc, version: 3, name: 'third' }, players: [{ pid: row.pid, ticket: row.ticket, marks: [6], rev: row.rev }] })).toBe('conflict');
    const after = (await store.load(code))!;
    expect(after.doc.name).toBe('first');
    expect(after.players[0]).toMatchObject({ marks: [5], rev: row.rev + 1 });
    // one seat per device
    expect(await store.commit(code, 2, { doc: null, players: [{ pid: 'pzz', ticket: row.ticket, marks: [], rev: null, tokenHash: row.tokenHash }] })).toBe('conflict');
  });

  it('what the store hands out is a copy', async () => {
    const { deps, store } = setup();
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['full'] }, deps));
    const g = (await store.load(code))!;
    g.doc.name = 'changed';
    g.players[0].marks.push(1);
    expect((await store.load(code))!.doc.name).toBe('Tambola Night');
    expect((await store.load(code))!.players[0].marks).toEqual([]);
  });

  it('games expire 24 hours after the last activity', async () => {
    const { deps, store, clock } = setup();
    const { code } = await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['full'] }, deps));
    clock.tick(GAME_TTL_MS - 1000);
    expect((await viewGame(code, MEERA, deps)).ok).toBe(true); // a visitor looking does not keep it alive…
    await must(actOnGame(code, MEERA, { type: 'join', name: 'Meera' }, deps)); // …an action does
    clock.tick(GAME_TTL_MS - 1000);
    expect((await viewGame(code, HOST, deps)).ok).toBe(true); // …and so does a member having it open
    clock.tick(GAME_TTL_MS - 1000);
    expect((await viewGame(code, MEERA, deps)).ok).toBe(true);
    clock.tick(GAME_TTL_MS + 1);
    expect(await viewGame(code, HOST, deps)).toMatchObject({ ok: false, status: 404, notFound: true });
    expect(await actOnGame(code, HOST, { type: 'start' }, deps)).toMatchObject({ ok: false, status: 404 });
    expect(await store.load(code)).toBeNull();
  });

  it('gives every game its own code', async () => {
    const { deps } = setup();
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) codes.add((await must(createGameForDevice(HOST, { hostName: 'Priya', prizes: ['full'] }, deps))).code);
    expect(codes.size).toBe(200);
    // even when the random source keeps suggesting a code that is taken
    const store = new MemoryStore();
    const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const rng = () => seq[i++ % seq.length];
    const a = await createGameForDevice(HOST, { hostName: 'P', hostPlays: false, prizes: ['full'] }, { store, rng: () => 0 });
    i = 0;
    const b = await createGameForDevice(HOST, { hostName: 'P', hostPlays: false, prizes: ['full'] }, { store, rng });
    expect(a).toMatchObject({ ok: true, code: 'AAAAA' });
    expect(b).toMatchObject({ ok: true, code: 'SSSSS' });
  });

  it('saves notify-me numbers (10 digits)', async () => {
    const { deps, store } = setup();
    expect(await saveNotifyNumber('98100 11001', deps)).toEqual({ ok: true });
    expect(await saveNotifyNumber('9810011001', deps)).toEqual({ ok: true });
    expect(store.notifyNumbers).toEqual(['9810011001']);
    for (const bad of ['981001100', '98100110011', 'abcdefghij', '', null, 9810011001]) {
      expect(await saveNotifyNumber(bad, deps)).toMatchObject({ ok: false, status: 400, error: 'Type your 10-digit WhatsApp number' });
    }
  });
});
