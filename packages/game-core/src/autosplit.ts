// Prize auto-split. Ported from the prototype's `applyAuto`.
import type { PrizeCfg } from './types.ts';
import { ruleWeight } from './data.ts';

/**
 * Split `pot` across the ON prizes by pattern weight, each floored to a multiple of 10;
 * the remainder goes to the highest-weight ON prize. OFF prizes keep their amount.
 * With no pot every amount becomes 0. Never mutates `cfg`.
 */
export function autoSplit(cfg: PrizeCfg[], pot: number): PrizeCfg[] {
  const on = cfg.filter((p) => p.on);
  if (!on.length || !pot) return cfg.map((p) => ({ ...p, amt: pot ? p.amt : 0 }));
  const W = on.reduce((a, p) => a + ruleWeight(p.rule), 0);
  const amts: Record<string, number> = {};
  let used = 0;
  for (const p of on) {
    amts[p.id] = Math.floor((pot * ruleWeight(p.rule)) / W / 10) * 10;
    used += amts[p.id];
  }
  const top = on.slice().sort((a, b) => ruleWeight(b.rule) - ruleWeight(a.rule))[0];
  amts[top.id] += pot - used;
  return cfg.map((p) => ({ ...p, amt: p.on ? amts[p.id] : p.amt }));
}

/** Meter numbers for the prize editor: how much of the pot the ON prizes use. */
export function potTotals(cfg: PrizeCfg[], pot: number): { assigned: number; left: number; over: number; pct: number } {
  const assigned = cfg.filter((p) => p.on).reduce((a, p) => a + (Number(p.amt) || 0), 0);
  return {
    assigned,
    left: Math.max(0, pot - assigned),
    over: Math.max(0, assigned - pot),
    pct: pot ? Math.min(100, Math.round((assigned / pot) * 100)) : 0,
  };
}
