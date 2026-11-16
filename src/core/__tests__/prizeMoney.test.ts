import { describe, expect, it } from 'vitest';
import { PRESETS, RULES, assignPrizeAmounts, rupees, splitPot } from '..';
import type { GameDoc, RuleId } from '..';

const classic = PRESETS[0].rules as RuleId[];
const doc = (price: number, players: number, rules: RuleId[]): GameDoc => ({
  price, players: Array.from({ length: players }, (_, i) => ({ pid: 'p' + i, name: 'P' + i, color: '', joinedAt: 0 })),
  prizes: rules.map((rule) => ({ id: rule, rule, label: rule, winnerPid: null, winnerName: null, wonAt: null, amount: 0 })),
} as unknown as GameDoc);

describe('prize money', () => {
  it('always adds up to the pot, for every pot and every set of patterns', () => {
    const all = RULES.map((r) => r.id as RuleId);
    for (const rules of [classic, ['full'] as RuleId[], all, all.slice(0, 3)]) {
      for (const pot of [0, 1, 7, 30, 99, 100, 600, 1250, 99999]) {
        const a = splitPot(pot, rules);
        expect(a).toHaveLength(rules.length);
        expect(a.reduce((x, y) => x + y, 0)).toBe(pot);
        expect(a.every((x) => x >= 0 && Number.isInteger(x))).toBe(true);
      }
    }
  });
  it('rounds to ₹10 for normal pots and gives Full House the most', () => {
    const a = splitPot(600, classic);
    expect(a.slice(0, -1).every((x) => x % 10 === 0)).toBe(true);
    expect(Math.max(...a)).toBe(a[classic.indexOf('full')]);
  });
  it('small pots still give every prize something where possible', () => {
    expect(splitPot(30, classic).filter((x) => x > 0).length).toBeGreaterThanOrEqual(5);
  });
  it('free games have no amounts', () => {
    const d = doc(0, 4, classic); assignPrizeAmounts(d);
    expect(d.prizes.every((p) => p.amount === 0)).toBe(true);
  });
  it('a late joiner only raises prizes that are still open', () => {
    const d = doc(100, 3, classic); assignPrizeAmounts(d);
    expect(d.prizes.reduce((a, p) => a + p.amount, 0)).toBe(300);
    const first = d.prizes[0]; first.winnerPid = 'p0'; const wonAmount = first.amount;
    d.players.push({ pid: 'p3', name: 'Late', color: '', joinedAt: 1 });
    assignPrizeAmounts(d);
    expect(first.amount).toBe(wonAmount);
    expect(d.prizes.reduce((a, p) => a + p.amount, 0)).toBe(400);
  });
  it('formats rupees the Indian way', () => {
    expect(rupees(0)).toBe('₹0'); expect(rupees(950)).toBe('₹950'); expect(rupees(1250)).toBe('₹1,250'); expect(rupees(125000)).toBe('₹1,25,000');
  });
});

import { applyAction, createGame } from '..';
import type { Actor, GameState } from '..';

describe('prize amounts typed by the host', () => {
  const ctx = { now: 1_700_000_000_000, rng: (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })() };
  const host: Actor = { isHost: true, pid: null } as unknown as Actor;
  const make = (input: Record<string, unknown>) => createGame({ hostName: 'Priya', prizes: ['early5', 'top', 'full'], ...input } as never, 'ABCDE', ctx);

  it('keeps the typed amounts, marks them fixed, and ignores unpicked patterns', () => {
    const r = make({ amounts: { early5: 100, full: 500, middle: 999 } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.doc.fixedAmounts).toBe(true);
    expect(r.state.doc.prizes.map((p) => p.amount)).toEqual([100, 0, 500]);
  });
  it('does not re-split typed amounts at start, even with a ticket price, and keeps them for the next round', () => {
    const r = make({ price: 100, amounts: { early5: 100, top: 150, full: 500 } });
    if (!r.ok) throw new Error('create failed');
    let state: GameState = r.state;
    const hostActor = { ...host, pid: state.doc.hostPid } as Actor;
    const s = applyAction(state, { type: 'start' }, hostActor, ctx);
    if (!s.ok) throw new Error('start failed');
    state = s.state;
    expect(state.doc.prizes.map((p) => p.amount)).toEqual([100, 150, 500]);
    state = { ...state, doc: { ...state.doc, status: 'done' } };
    const n = applyAction(state, { type: 'newRound' }, hostActor, ctx);
    if (!n.ok) throw new Error('newRound failed');
    expect(n.state.doc.prizes.map((p) => p.amount)).toEqual([100, 150, 500]);
  });
  it('with no typed amounts nothing is fixed (ticket money is split at start as before)', () => {
    const r = make({ price: 100, amounts: { early5: 0 } });
    if (!r.ok) throw new Error('create failed');
    expect(r.state.doc.fixedAmounts).toBeUndefined();
    expect(r.state.doc.prizes.every((p) => p.amount === 0)).toBe(true);
  });
  it('rejects bad amounts', () => {
    for (const bad of [{ early5: -1 }, { early5: 1.5 }, { early5: '100' }, { early5: 1_000_000 }, [100]]) {
      expect(make({ amounts: bad }).ok).toBe(false);
    }
  });
});
