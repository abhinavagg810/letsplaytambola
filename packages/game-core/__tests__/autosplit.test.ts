import { DEFAULT_PRIZES, RULES, autoSplit, potTotals } from '../src/index.ts';
import type { PrizeCfg } from '../src/index.ts';

const sum = (cfg: PrizeCfg[]) => cfg.filter((p) => p.on).reduce((a, p) => a + p.amt, 0);
const everyRule: PrizeCfg[] = RULES.map((r) => ({ id: r.id, label: r.name, rule: r.id, amt: 0, on: true, custom: false }));

describe('autoSplit', () => {
  it.each([600, 1000, 1250, 70, 995, 3000, 10, 7])('assigns the whole pot of %i', (pot) => {
    expect(sum(autoSplit(DEFAULT_PRIZES, pot))).toBe(pot);
    expect(sum(autoSplit(everyRule, pot))).toBe(pot);
  });

  it('uses multiples of 10, the remainder goes to the heaviest prize (Full House)', () => {
    const out = autoSplit(DEFAULT_PRIZES, 995);
    for (const p of out) if (p.id !== 'full') expect(p.amt % 10).toBe(0);
    const full = out.find((p) => p.id === 'full')!;
    expect(full.amt).toBe(995 - out.filter((p) => p.id !== 'full').reduce((a, p) => a + p.amt, 0));
    expect(full.amt).toBeGreaterThan(Math.max(...out.filter((p) => p.id !== 'full').map((p) => p.amt)));
  });

  it('matches a hand-worked split', () => {
    // weights 1 / 1.5 / 1.5 / 1.5 / 1.5 / 3 = 10; pot 600
    expect(autoSplit(DEFAULT_PRIZES, 600).map((p) => p.amt)).toEqual([60, 90, 90, 90, 90, 180]);
  });

  it('leaves OFF prizes untouched and gives them no share', () => {
    const cfg = DEFAULT_PRIZES.map((p) => (p.id === 'corners' ? { ...p, on: false, amt: 33 } : p));
    const out = autoSplit(cfg, 1000);
    expect(out.find((p) => p.id === 'corners')).toEqual({ ...cfg[4] });
    expect(sum(out)).toBe(1000);
  });

  it('zeroes every amount when there is no pot', () => {
    const cfg = DEFAULT_PRIZES.map((p, i) => ({ ...p, on: i % 2 === 0 }));
    expect(autoSplit(cfg, 0).map((p) => p.amt)).toEqual([0, 0, 0, 0, 0, 0]);
  });

  it('returns the amounts as they are when nothing is ON', () => {
    const cfg = DEFAULT_PRIZES.map((p) => ({ ...p, on: false }));
    expect(autoSplit(cfg, 500)).toEqual(cfg);
    expect(autoSplit([], 500)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(DEFAULT_PRIZES);
    autoSplit(DEFAULT_PRIZES, 1234);
    expect(JSON.stringify(DEFAULT_PRIZES)).toBe(before);
  });
});

describe('potTotals', () => {
  it('reports assigned / left / over / pct', () => {
    expect(potTotals(DEFAULT_PRIZES, 600)).toEqual({ assigned: 600, left: 0, over: 0, pct: 100 });
    expect(potTotals(DEFAULT_PRIZES, 800)).toEqual({ assigned: 600, left: 200, over: 0, pct: 75 });
    expect(potTotals(DEFAULT_PRIZES, 500)).toEqual({ assigned: 600, left: 0, over: 100, pct: 100 });
    expect(potTotals(DEFAULT_PRIZES, 0)).toEqual({ assigned: 600, left: 0, over: 600, pct: 0 });
  });

  it('ignores OFF prizes', () => {
    const cfg = DEFAULT_PRIZES.map((p) => (p.id === 'full' ? { ...p, on: false } : p));
    expect(potTotals(cfg, 600).assigned).toBe(350);
  });
});
