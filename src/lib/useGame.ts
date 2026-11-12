'use client';
// useGame(code): this device's live view of one game.
//
// One GameSession per game code (shared by every component that calls useGame with that code) keeps the
// view fresh by: an initial fetch; applying the view every action returns; a Supabase Realtime "changed"
// ping when configured; polling (fast without realtime, slow with it); and a refetch whenever the tab
// comes back (focus / online / visible). It never lets an older version replace a newer one.
import { useMemo, useSyncExternalStore } from 'react';
import { COPY, REALTIME_EVENT, isMember, realtimeChannel } from '@/core';
import type { GameAction, GameView } from '@/core';
import * as api from './api';
import type { ApiErrorCode } from './api';

/** Poll this often when there is no realtime connection… */
export const POLL_FAST_MS = 1500;
/** …and this often when realtime is connected (a safety net for a missed ping). */
export const POLL_SLOW_MS = 8000;
/** After a failed fetch, wait a little longer before the next try. */
const POLL_ERROR_MS = 4000;

export type ActResult = { ok: true } | { ok: false; error: string; code: ApiErrorCode };

export interface UseGame {
  /** undefined = still loading; null = no such game (or it expired); otherwise this device's view. */
  game: GameView | null | undefined;
  /** Set while the game cannot be reached (the last good view stays on screen); null when all is well. */
  error: string | null;
  /**
   * Do something in the game. Resolves when the server has answered; the view is already updated by then.
   * Never rejects. On failure `error` is ready to show in a toast.
   * Marking is optimistic: the dab shows at once and is undone if the server refuses.
   */
  act: (action: GameAction) => Promise<ActResult>;
  /** Fetch the latest view now. */
  refresh: () => Promise<void>;
  /** True while the realtime connection is up (updates arrive instantly; otherwise within ~1.5s). */
  realtime: boolean;
  /** The server's clock (epoch ms), for comparing with event times such as a win's `at`. */
  serverNow: () => number;
}

interface Snapshot {
  game: GameView | null | undefined;
  error: string | null;
  realtime: boolean;
}

const LOADING: Snapshot = { game: undefined, error: null, realtime: false };

// ---------------------------------------------------------------- realtime (lazy: supabase-js loads only on a game page)

interface RealtimeChannelLike {
  on(type: 'broadcast', filter: { event: string }, cb: (msg: { payload?: unknown }) => void): RealtimeChannelLike;
  subscribe(cb?: (status: string) => void): RealtimeChannelLike;
}
interface RealtimeClientLike {
  channel(name: string): RealtimeChannelLike;
  removeChannel(channel: RealtimeChannelLike): unknown;
}

let clientPromise: Promise<RealtimeClientLike | null> | null = null;

function realtimeClient(): Promise<RealtimeClientLike | null> | null {
  // Written out in full so Next.js can inline the values at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  clientPromise ??= import('@supabase/supabase-js')
    .then(({ createClient }) =>
      createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      }) as unknown as RealtimeClientLike)
    .catch(() => null);
  return clientPromise;
}

// ---------------------------------------------------------------- one session per game code

const sameYou = (a: GameView, b: GameView) => JSON.stringify(a.you) === JSON.stringify(b.you);

/** Exported for tests; components use the useGame hook. */
export class GameSession {
  private snap: Snapshot = LOADING;
  private readonly listeners = new Set<() => void>();
  /** The last view the server gave us (before optimistic marks). */
  private server: GameView | null | undefined = undefined;
  private error: string | null = null;
  private connected = false;
  /** Marks sent but not yet confirmed: number → wanted state (and how many requests are in flight for it). */
  private readonly pending = new Map<number, { on: boolean; count: number }>();
  /** Actions run one at a time, in the order they were made. */
  private queue: Promise<unknown> = Promise.resolve();
  /** Goes up every time an action finishes; a fetch that started before then may carry stale marks. */
  private actSeq = 0;
  private fetching: Promise<void> | null = null;
  private fetchAgain = false;
  private lastFetchFailed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private channel: RealtimeChannelLike | null = null;
  private clockOffset = 0;

  constructor(private readonly code: string) {}

  // ----- React wiring
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  getSnapshot = (): Snapshot => this.snap;

  serverNow = (): number => Date.now() + this.clockOffset;

  private emit(): void {
    this.snap = { game: this.withPendingMarks(this.server), error: this.error, realtime: this.connected };
    for (const l of [...this.listeners]) l();
  }

  private withPendingMarks(view: GameView | null | undefined): GameView | null | undefined {
    if (!isMember(view) || this.pending.size === 0 || !view.you.marks) return view;
    const marks = new Set(view.you.marks);
    for (const [n, p] of this.pending) {
      if (p.on) marks.add(n);
      else marks.delete(n);
    }
    return { ...view, you: { ...view.you, marks: [...marks] } };
  }

  // ----- lifecycle
  private start(): void {
    if (this.running || typeof window === 'undefined') return;
    this.running = true;
    window.addEventListener('focus', this.wake);
    window.addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.wake);
    void this.refresh();
    this.schedule();
    this.connect();
  }

  private stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    window.removeEventListener('focus', this.wake);
    window.removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
    this.disconnect();
  }

  private wake = (): void => {
    if (document.visibilityState === 'visible') void this.refresh();
  };

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    if (!this.running) return;
    const delay = this.lastFetchFailed ? POLL_ERROR_MS : this.connected ? POLL_SLOW_MS : POLL_FAST_MS;
    this.timer = setTimeout(() => {
      this.timer = null;
      // A hidden tab does not poll (it catches up the moment it is shown again); nor does a game that is not there.
      const idle = document.visibilityState !== 'visible' || this.server === null;
      (idle ? Promise.resolve() : this.refresh()).finally(() => this.schedule());
    }, delay);
  }

  private connect(): void {
    const client = realtimeClient();
    if (!client) return;
    void client.then((supabase) => {
      if (!supabase || !this.running || this.channel) return;
      this.channel = supabase
        .channel(realtimeChannel(this.code))
        .on('broadcast', { event: REALTIME_EVENT }, (msg) => {
          const v = (msg.payload as { v?: unknown } | undefined)?.v;
          const have = this.server ? this.server.version : -1;
          if (typeof v !== 'number' || v > have) void this.refresh();
        })
        .subscribe((status) => {
          const up = status === 'SUBSCRIBED';
          if (up === this.connected) return;
          this.connected = up;
          this.emit();
          if (up) void this.refresh(); // catch anything missed while connecting
          this.schedule();
        });
    });
  }

  private disconnect(): void {
    const channel = this.channel;
    this.channel = null;
    this.connected = false;
    if (channel) void realtimeClient()?.then((supabase) => supabase?.removeChannel(channel));
  }

  // ----- reading
  /** Take a view from the server. Returns false when it was ignored as out of date. */
  private accept(view: GameView, from: 'act' | 'fetch', actSeqAtStart: number): boolean {
    this.clockOffset = view.now - Date.now();
    const cur = this.server;
    if (cur) {
      // Never go back in time.
      if (view.version < cur.version) return false;
      // Marks do not change the version, so a fetch that began before an action finished may be behind on them.
      if (from === 'fetch' && view.version === cur.version && actSeqAtStart !== this.actSeq) return false;
      if (view.version === cur.version && sameYou(cur, view)) {
        if (this.error) {
          this.error = null;
          this.emit();
        }
        return true; // nothing new: keep the same object so React does not re-render
      }
    }
    this.server = view;
    this.error = null;
    this.emit();
    return true;
  }

  refresh = (): Promise<void> => {
    if (this.fetching) {
      this.fetchAgain = true;
      return this.fetching;
    }
    const run = async (): Promise<void> => {
      do {
        this.fetchAgain = false;
        const seq = this.actSeq;
        const r = await api.getGame(this.code);
        if (r.ok) {
          this.lastFetchFailed = false;
          this.accept(r.game, 'fetch', seq);
          // An action finished while we were fetching: private state in this answer may be stale, so look again.
          if (seq !== this.actSeq) this.fetchAgain = true;
        } else if (r.notFound) {
          this.lastFetchFailed = false;
          this.server = null;
          this.error = null;
          this.pending.clear();
          this.emit();
        } else {
          this.lastFetchFailed = true;
          if (this.error !== r.error) {
            this.error = r.error;
            this.emit();
          }
        }
      } while (this.fetchAgain);
    };
    this.fetching = run().finally(() => {
      this.fetching = null;
    });
    return this.fetching;
  };

  // ----- acting
  act = (action: GameAction): Promise<ActResult> => {
    let sent = action;
    let markedN: number | null = null;

    if (action.type === 'mark') {
      const view = this.snap.game;
      if (isMember(view) && view.you.marks && view.status === 'live') {
        // Same rule and same words as the server, without the round trip.
        if (!view.called.includes(action.n)) {
          return Promise.resolve({ ok: false, error: COPY.notCalled(action.n), code: 'invalid' });
        }
        const on = action.on ?? !view.you.marks.includes(action.n);
        sent = { type: 'mark', n: action.n, on }; // explicit, so a retry can never flip it back
        markedN = action.n;
        const p = this.pending.get(action.n);
        this.pending.set(action.n, { on, count: (p?.count ?? 0) + 1 });
        this.emit(); // the dab shows now
      }
    }

    const run = async (): Promise<ActResult> => {
      const r = await api.act(this.code, sent);
      this.actSeq += 1;
      if (markedN !== null) {
        const p = this.pending.get(markedN);
        if (p && p.count > 1) p.count -= 1;
        else this.pending.delete(markedN);
      }
      if (r.ok) {
        const cur = this.server;
        if (!this.accept(r.game, 'act', this.actSeq) && isMember(cur) && isMember(r.game) && cur.round === r.game.round) {
          // A newer public view arrived while this action was in flight. Keep it, but take our own
          // ticket and marks from this answer (they are at least as fresh), then confirm with a fetch.
          this.server = { ...cur, you: r.game.you };
          void this.refresh();
        }
        this.emit();
        return { ok: true };
      }
      if (r.notFound) {
        this.server = null;
        this.pending.clear();
      }
      this.emit(); // drops the optimistic dab if there was one
      return { ok: false, error: r.error, code: r.code };
    };

    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result.catch((): ActResult => ({ ok: false, error: api.NETWORK_ERROR, code: 'network' }));
  };
}

const sessions = new Map<string, GameSession>();

function sessionFor(code: string): GameSession {
  let s = sessions.get(code);
  if (!s) {
    s = new GameSession(code);
    sessions.set(code, s);
  }
  return s;
}

const getServerSnapshot = (): Snapshot => LOADING;

/** This device's live view of game `code`, plus `act` to do things in it. See the UseGame type. */
export function useGame(code: string): UseGame {
  const session = sessionFor(code.trim().toUpperCase());
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot, getServerSnapshot);
  return useMemo(
    () => ({
      game: snap.game,
      error: snap.error,
      realtime: snap.realtime,
      act: session.act,
      refresh: session.refresh,
      serverNow: session.serverNow,
    }),
    [snap, session],
  );
}
