// Shared helpers for the core tests (not part of the public API).
import { applyAction, createGame } from '../engine';
import type { Actor, CreateGameInput, Ctx, EngineOk, EngineResult, GameAction, GameState, RuleId } from '../types';

/** Small deterministic PRNG so test runs are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CLASSIC: RuleId[] = ['early5', 'top', 'middle', 'bottom', 'corners', 'full'];
export const VISITOR: Actor = { isHost: false, pid: null };

/** A tiny in-memory "server": holds the state and applies actions to it. */
export class Table {
  state: GameState;
  ctx: Ctx;
  host: Actor;

  constructor(opts: Partial<CreateGameInput> & { seed?: number } = {}) {
    const { seed, ...input } = opts;
    this.ctx = { now: 1000, rng: mulberry32(seed ?? 7) };
    const made = createGame({ hostName: 'Priya', name: 'Diwali Night', price: 100, prizes: CLASSIC, ...input }, 'K7RQ2', this.ctx);
    if (!made.ok) throw new Error(made.error);
    this.state = made.state;
    this.host = { isHost: true, pid: made.pid ?? null };
  }

  get doc() { return this.state.doc; }

  /** Apply an action; state only advances when it succeeded. */
  act(who: Actor, action: GameAction): EngineResult {
    this.ctx.now += 1;
    const r = applyAction(this.state, action, who, this.ctx);
    if (r.ok) this.state = r.state;
    return r;
  }

  /** Apply an action that must succeed. */
  ok(who: Actor, action: GameAction): EngineOk {
    const r = this.act(who, action);
    if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
    return r;
  }

  join(name: string): Actor {
    const r = this.ok(VISITOR, { type: 'join', name });
    return { isHost: false, pid: r.pid! };
  }

  nums(who: Actor): number[] { return this.state.players[who.pid!].ticket.flat().filter(Boolean); }
  row(who: Actor, r: number): number[] { return this.state.players[who.pid!].ticket[r].filter(Boolean); }
  marks(who: Actor): number[] { return this.state.players[who.pid!].marks; }

  /** Host draws until all of `want` have been called (or the game ends). */
  drawUntil(want: number[]): void {
    while (this.doc.status === 'live' && !want.every((n) => this.doc.called.includes(n))) this.ok(this.host, { type: 'draw' });
  }

  drawAll(): void {
    while (this.doc.status === 'live') this.ok(this.host, { type: 'draw' });
  }

  markAll(who: Actor, ns: number[]): void {
    for (const n of ns) this.ok(who, { type: 'mark', n, on: true });
  }
}
