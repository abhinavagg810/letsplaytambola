import type { GameDoc, RuleId } from './types';

/**
 * Prize money is information only — the app never handles payments.
 * When the host sets a ticket price, the pot (price × people with a ticket) is shared between the ways to win
 * by these weights (harder patterns get more; from the design's seed data, `autoSplitWeight`).
 */
export const PRIZE_WEIGHTS: Record<RuleId, number> = {
  early5: 1, early7: 1, early9: 1.2, lucky3: 1, laddoo: 0.8, temp: 1,
  top: 1.5, middle: 1.5, bottom: 1.5, railway: 1.5, bamboo: 1.2,
  corners: 1.5, star: 1.5, six: 1.6, kings: 1.2, queens: 1.2,
  pyramid: 1.8, rpyramid: 1.8, diamond: 1.4, one24: 1.8,
  breakfast: 2, lunch: 2, dinner: 2, day: 2.2, night: 2.2, full: 3,
};

/**
 * Share `pot` between `rules` by weight. Amounts are rounded down to ₹10 (₹1 for small pots) and the remainder
 * goes to the heaviest pattern, so the amounts always add up to exactly `pot`.
 */
export function splitPot(pot: number, rules: readonly RuleId[]): number[] {
  if (!rules.length) return [];
  const total = Math.max(0, Math.floor(pot));
  if (!total) return rules.map(() => 0);
  const weights = rules.map((r) => PRIZE_WEIGHTS[r] ?? 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  const step = total >= rules.length * 20 ? 10 : 1;
  const amounts = weights.map((w) => Math.floor((total * w) / sum / step) * step);
  const used = amounts.reduce((a, b) => a + b, 0);
  let top = 0;
  weights.forEach((w, i) => { if (w > weights[top]) top = i; });
  amounts[top] += total - used;
  return amounts;
}

/**
 * Set the amount on every prize that is still open: the pot (ticket price × players) minus what has already been won,
 * shared between the open prizes. Called when the game starts and again when someone joins a live game,
 * so prizes that were already won never change.
 */
export function assignPrizeAmounts(doc: GameDoc): void {
  const open = doc.prizes.filter((p) => !p.winnerPid);
  if (!doc.price) { for (const p of doc.prizes) p.amount = 0; return; }
  const won = doc.prizes.filter((p) => p.winnerPid).reduce((a, p) => a + (p.amount || 0), 0);
  const amounts = splitPot(doc.price * doc.players.length - won, open.map((p) => p.rule));
  open.forEach((p, i) => { p.amount = amounts[i]; });
}

/** "₹1,250" with Indian digit grouping. */
export function rupees(n: number): string {
  const s = String(Math.abs(Math.round(n)));
  const head = s.length > 3 ? s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' : '';
  return (n < 0 ? '−' : '') + '₹' + head + s.slice(-3);
}

/** Total prize money a player has won so far. */
export const wonTotal = (doc: Pick<GameDoc, 'prizes'>, pid: string): number =>
  doc.prizes.filter((p) => p.winnerPid === pid).reduce((a, p) => a + (p.amount || 0), 0);
