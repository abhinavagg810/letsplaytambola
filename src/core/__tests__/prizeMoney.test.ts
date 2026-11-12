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
