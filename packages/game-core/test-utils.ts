// Shared helpers for the game-core tests (not part of the public API).
import type { Actor, ApplyResult, GameAction, GameDoc, Prize, Tickets } from './src/types.ts';
import { applyAction, createGameDoc } from './src/engine.ts';
import type { Ctx } from './src/engine.ts';

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

export const actor = (uid: string, name: string): Actor => ({ uid, name, color: '#FA4A98', username: uid });

export const HOST = actor('h', 'Priya Sharma');
export const MEERA = actor('m', 'Meera Iyer');
export const NANI = actor('n', 'Nani');
export const RAHUL = actor('r', 'Rahul Verma');

export const CLASSIC: Prize[] = [
  { id: 'early5', label: 'Early Five', rule: 'early5', amt: 50 },
  { id: 'top', label: 'Top Line', rule: 'top', amt: 75 },
  { id: 'middle', label: 'Middle Line', rule: 'middle', amt: 75 },
  { id: 'full', label: 'Full House', rule: 'full', amt: 200 },
];

/** A tiny in-memory "server": holds the doc + tickets and applies actions to them. */
export class Table {
  doc: GameDoc;
  tickets: Tickets;
  ctx: Ctx;
  last: ApplyResult | null = null;

  constructor(opts: { prizes?: Prize[]; price?: number; maxSeats?: number; hostPlays?: boolean; seed?: number } = {}) {
    this.ctx = { now: 1000, rng: mulberry32(opts.seed ?? 7) };
    const made = createGameDoc(
      { name: 'Diwali Night', maxSeats: opts.maxSeats ?? 6, price: opts.price ?? 100, hostPlays: opts.hostPlays ?? true,
        prizes: opts.prizes ?? CLASSIC, invited: [], contacts: [] },
      HOST, 'AB2CD', this.ctx,
    );
    if (made.error) throw new Error(made.error);
    this.doc = made.doc;
    this.tickets = made.tickets;
  }

  /** Apply an action; state only advances when it succeeded. */
  act(who: Actor, action: GameAction): ApplyResult {
    this.ctx.now += 1;
    const r = applyAction(this.doc, this.tickets, action, who, this.ctx);
    if (r.ok) { this.doc = r.doc; this.tickets = r.tickets; }
    this.last = r;
    return r;
  }

  /** Apply an action that must succeed. */
  ok(who: Actor, action: GameAction): ApplyResult {
    const r = this.act(who, action);
    if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
    return r;
  }

  nums(who: Actor): number[] {
    return this.tickets[who.uid].ticket.flat().filter(Boolean);
  }

  row(who: Actor, r: number): number[] {
    return this.tickets[who.uid].ticket[r].filter(Boolean);
  }

  /** Host draws until all of `want` have been called (or the bag is empty). */
  drawUntil(want: number[]): void {
    while (!want.every((n) => this.doc.called.includes(n))) this.ok(HOST, { type: 'draw' });
  }

  drawAll(): void {
    while (this.doc.called.length < 90) this.ok(HOST, { type: 'draw' });
  }

  dabAll(who: Actor, ns: number[]): void {
    for (const n of ns) if (!this.tickets[who.uid].dabs.includes(n)) this.ok(who, { type: 'dab', n });
  }

  lastFeed() {
    return this.doc.feed[this.doc.feed.length - 1];
  }
}
