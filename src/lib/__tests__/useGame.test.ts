import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameView, MemberView } from '@/core';
import { applyAction, createGame, projectView } from '@/core';
import type { Actor, GameAction, GameState } from '@/core';
import { mulberry32 } from '../../core/__tests__/helpers';

vi.mock('../api', () => ({
  NETWORK_ERROR: 'Can’t reach the game — check your internet',
  getGame: vi.fn(),
  act: vi.fn(),
}));
import * as api from '../api';
import { GameSession, POLL_FAST_MS } from '../useGame';

const getGame = vi.mocked(api.getGame);
const act = vi.mocked(api.act);

/** A tiny fake server holding one game. */
function makeServer() {
  const ctx = { now: 1000, rng: mulberry32(3) };
  const made = createGame({ hostName: 'Priya', prizes: ['top', 'full'] }, 'K7RQ2', ctx);
  if (!made.ok) throw new Error(made.error);
  let state: GameState = made.state;
  const host: Actor = { isHost: true, pid: made.pid! };
  const apply = (who: Actor, action: GameAction) => {
    ctx.now += 1;
    const r = applyAction(state, action, who, ctx);
    if (r.ok) state = r.state;
    return r;
  };
  const joined = apply({ isHost: false, pid: null }, { type: 'join', name: 'Meera' });
  if (!joined.ok) throw new Error(joined.error);
  const meera: Actor = { isHost: false, pid: joined.pid! };
  apply(host, { type: 'start' });
  return {
    host, meera, apply,
    view: (who: Actor = meera): GameView => projectView(state, who, ctx.now),
    get state() { return state; },
  };
}
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const member = (s: GameSession) => s.getSnapshot().game as MemberView;

let listeners: Record<string, Array<() => void>>;
beforeEach(() => {
  vi.useFakeTimers();
  listeners = {};
  const add = (type: string, fn: () => void) => { (listeners[type] ??= []).push(fn); };
  const remove = (type: string, fn: () => void) => { listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn); };
  vi.stubGlobal('window', { addEventListener: add, removeEventListener: remove });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: add, removeEventListener: remove });
  getGame.mockReset();
  act.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GameSession', () => {
  it('loads on first subscribe, polls, and stops when the last listener leaves', async () => {
    const server = makeServer();
    getGame.mockImplementation(async () => ({ ok: true, game: server.view() }));
    const s = new GameSession('K7RQ2');
    expect(s.getSnapshot().game).toBeUndefined();
    const seen: unknown[] = [];
    const off = s.subscribe(() => seen.push(s.getSnapshot().game));
    await flush();
    expect(getGame).toHaveBeenCalledTimes(1);
    expect(member(s).you.role).toBe('player');
    expect(seen).toHaveLength(1);

    // an unchanged poll does not produce a new object (no re-render)
    const before = s.getSnapshot();
    await vi.advanceTimersByTimeAsync(POLL_FAST_MS);
    expect(getGame).toHaveBeenCalledTimes(2);
    expect(s.getSnapshot()).toBe(before);

    // a change on the server shows up on the next poll
    server.apply(server.host, { type: 'draw' });
    await vi.advanceTimersByTimeAsync(POLL_FAST_MS);
    expect(member(s).called).toHaveLength(1);

    // coming back to the tab refetches at once
    server.apply(server.host, { type: 'draw' });
    listeners.focus.forEach((fn) => fn());
    await flush();
    expect(member(s).called).toHaveLength(2);

    off();
    const calls = getGame.mock.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_FAST_MS * 5);
    expect(getGame).toHaveBeenCalledTimes(calls);
    expect(listeners.focus).toHaveLength(0);
  });

  it('does not poll while the tab is hidden', async () => {
    const server = makeServer();
    getGame.mockImplementation(async () => ({ ok: true, game: server.view() }));
    const s = new GameSession('K7RQ2');
    const off = s.subscribe(() => undefined);
    await flush();
    (document as unknown as { visibilityState: string }).visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(POLL_FAST_MS * 4);
    expect(getGame).toHaveBeenCalledTimes(1);
    (document as unknown as { visibilityState: string }).visibilityState = 'visible';
    listeners.visibilitychange.forEach((fn) => fn());
    await flush();
    expect(getGame).toHaveBeenCalledTimes(2);
    off();
  });

  it('never replaces a newer version with an older one', async () => {
    const server = makeServer();
    const old = server.view();
    server.apply(server.host, { type: 'draw' });
    const fresh = server.view();
    getGame.mockResolvedValueOnce({ ok: true, game: fresh }).mockResolvedValue({ ok: true, game: old });
    const s = new GameSession('K7RQ2');
    const off = s.subscribe(() => undefined);
    await flush();
    expect(member(s).version).toBe(fresh.version);
    await s.refresh();
    expect(member(s).version).toBe(fresh.version);
    expect(member(s).called).toHaveLength(1);
    off();
  });

  it('reports a missing game as null and a network failure as an error (keeping the last view)', async () => {
    const server = makeServer();
    getGame.mockResolvedValueOnce({ ok: true, game: server.view() });
    const s = new GameSession('K7RQ2');
    const off = s.subscribe(() => undefined);
    await flush();
    getGame.mockResolvedValueOnce({ ok: false, error: 'Can’t reach the game — check your internet', code: 'network', status: 0 });
    await s.refresh();
    expect(s.getSnapshot().error).toBe('Can’t reach the game — check your internet');
    expect(member(s).you.role).toBe('player');
    getGame.mockResolvedValueOnce({ ok: true, game: server.view() });
    await s.refresh();
    expect(s.getSnapshot().error).toBeNull();
    getGame.mockResolvedValue({ ok: false, error: 'We can’t find game K7RQ2', code: 'not_found', status: 404, notFound: true });
    await s.refresh();
    expect(s.getSnapshot().game).toBeNull();
    off();
  });

  it('applies the view an action returns straight away', async () => {
    const server = makeServer();
    getGame.mockImplementation(async () => ({ ok: true, game: server.view(server.host) }));
    act.mockImplementation(async (_code, action) => {
      const r = server.apply(server.host, action);
      return r.ok ? { ok: true, game: server.view(server.host) } : { ok: false, error: r.error, code: r.code, status: 409 };
    });
    const s = new GameSession('K7RQ2');
    const off = s.subscribe(() => undefined);
    await flush();
    expect(await s.act({ type: 'draw' })).toEqual({ ok: true });
    expect(member(s).called).toHaveLength(1);
    expect(getGame).toHaveBeenCalledTimes(1); // no extra fetch needed
    expect(await s.act({ type: 'newRound' })).toEqual({ ok: false, error: 'Finish this round first', code: 'state' });
    off();
  });

  it('marks optimistically, confirms with the server, and undoes a refused mark', async () => {
    const server = makeServer();
    const mine = (server.view() as MemberView).you.ticket!.flat().filter(Boolean);
    while (server.state.doc.called.filter((n) => mine.includes(n)).length < 2) server.apply(server.host, { type: 'draw' });
    const [a, b] = server.state.doc.called.filter((n) => mine.includes(n));
    getGame.mockImplementation(async () => ({ ok: true, game: server.view() }));
    let release: (() => void) | null = null;
    const sent: GameAction[] = [];
    act.mockImplementation(async (_code, action) => {
      sent.push(action);
      await new Promise<void>((res) => { release = res; });
      const r = server.apply(server.meera, action);
      return r.ok ? { ok: true, game: server.view() } : { ok: false, error: r.error, code: r.code, status: 400 };
    });
    const s = new GameSession('K7RQ2');
    const off = s.subscribe(() => undefined);
    await flush();

    // not called yet: answered locally, same words as the server, nothing sent
    const uncalled = mine.find((n) => !server.state.doc.called.includes(n))!;
    expect(await s.act({ type: 'mark', n: uncalled })).toEqual({ ok: false, error: `${uncalled} hasn’t been called yet`, code: 'invalid' });
    expect(act).not.toHaveBeenCalled();

    const p1 = s.act({ type: 'mark', n: a });
    expect(member(s).you.marks).toEqual([a]); // shown before the server answers
    const p2 = s.act({ type: 'mark', n: b });
    expect(member(s).you.marks).toEqual([a, b]);
    await flush();
    expect(sent).toEqual([{ type: 'mark', n: a, on: true }]); // one at a time, in order, explicit on/off
    // a poll that lands while marks are in flight must not wipe the dabs
    await s.refresh();
    expect(member(s).you.marks).toEqual([a, b]);
    release!();
    expect(await p1).toEqual({ ok: true });
    await flush();
    expect(sent).toHaveLength(2);
    release!();
    expect(await p2).toEqual({ ok: true });
    expect(member(s).you.marks).toEqual([a, b]);
    expect(server.state.players[server.meera.pid!].marks).toEqual([a, b]);

    // un-dab, refused by the server (say the connection dropped): the dab comes back
    act.mockImplementationOnce(async () => ({ ok: false, error: 'Can’t reach the game — check your internet', code: 'network', status: 0 }));
    const p3 = s.act({ type: 'mark', n: a });
    expect(member(s).you.marks).toEqual([b]);
    expect(await p3).toMatchObject({ ok: false, code: 'network' });
    expect(member(s).you.marks).toEqual([a, b]);
    off();
  });

  it('a stale fetch cannot undo a mark that the server has already confirmed', async () => {
    const server = makeServer();
    const mine = (server.view() as MemberView).you.ticket!.flat().filter(Boolean);
    while (!server.state.doc.called.some((n) => mine.includes(n))) server.apply(server.host, { type: 'draw' });
    const n = server.state.doc.called.find((x) => mine.includes(x))!;
    const stale = server.view(); // same version, taken before the mark
    getGame.mockResolvedValueOnce({ ok: true, game: stale });
    const s = new GameSession('K7RQ2');
    const off = s.subscribe(() => undefined);
    await flush();

    let finishFetch: (() => void) | null = null;
    getGame.mockImplementationOnce(async () => { await new Promise<void>((res) => { finishFetch = res; }); return { ok: true, game: stale }; });
    getGame.mockImplementation(async () => ({ ok: true, game: server.view() }));
    act.mockImplementation(async (_c, action) => { server.apply(server.meera, action); return { ok: true, game: server.view() }; });
    const slow = s.refresh(); // starts before the mark…
    await flush();
    expect(await s.act({ type: 'mark', n })).toEqual({ ok: true });
    finishFetch!(); // …and answers after it, with the old marks
    await slow;
    expect(member(s).you.marks).toEqual([n]);
    off();
  });
});
