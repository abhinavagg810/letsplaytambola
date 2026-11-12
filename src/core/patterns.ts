// Winning-pattern checks. Ported from the prototype's `check`.
import type { RuleId, Ticket } from './types';

/**
 * The exact numbers a pattern needs on this ticket, or null for count-based rules
 * (early5/7/9 and lucky3), where any qualifying numbers will do.
 * An empty array means the ticket has no numbers for that pattern, so it can never win it.
 */
export function patternNumbers(ticket: Ticket, rule: RuleId): number[] | null {
  const rows = ticket.map((r) => r.filter(Boolean));
  const nums = rows.flat();
  const col = (c: number) => ticket.map((r) => r[c]).filter(Boolean);
  const range = (lo: number, hi: number) => nums.filter((n) => n >= lo && n <= hi);
  const at = (r: number, i: number): number => (rows[r] && rows[r][i]) || 0;
  const c4 = [at(0, 0), at(0, 4), at(2, 0), at(2, 4)];
  switch (rule) {
    case 'early5': case 'early7': case 'early9': case 'lucky3': return null;
    case 'laddoo': return [at(1, 2)];
    case 'temp': return nums.length ? [Math.min(...nums), Math.max(...nums)] : [];
    case 'top': return rows[0] ?? [];
    case 'middle': return rows[1] ?? [];
    case 'bottom': return rows[2] ?? [];
    case 'railway': return [...col(0), ...col(8)];
    case 'bamboo': return range(40, 49);
    case 'corners': return c4;
    case 'star': return [...c4, at(1, 2)];
    case 'six': return [0, 1, 2].flatMap((r) => [at(r, 0), at(r, 4)]);
    case 'kings': return [0, 1, 2].map((r) => at(r, 0));
    case 'queens': return [0, 1, 2].map((r) => at(r, 4));
    case 'pyramid': return [at(0, 2), at(1, 1), at(1, 3), at(2, 1), at(2, 2), at(2, 3)];
    case 'rpyramid': return [at(0, 1), at(0, 2), at(0, 3), at(1, 1), at(1, 3), at(2, 2)];
    case 'diamond': return [at(0, 2), at(1, 0), at(1, 4), at(2, 2)];
    case 'one24': return [at(0, 0), at(1, 0), at(1, 1), at(2, 0), at(2, 1), at(2, 2), at(2, 3)];
    case 'breakfast': return range(1, 29);
    case 'lunch': return range(30, 59);
    case 'dinner': return range(60, 90);
    case 'day': return range(1, 45);
    case 'night': return range(46, 90);
    case 'full': return nums;
  }
  return null;
}

/**
 * Does this ticket win `rule`? Only marks of numbers that were actually called count
 * (valid = marks ∩ called). A pattern whose required set is empty can never win.
 */
export function checkPattern(ticket: Ticket, marks: number[], called: number[], rule: RuleId): boolean {
  const calledSet = new Set(called);
  const nums = ticket.flat().filter(Boolean);
  // Marks only count when the number was called (and is actually on the ticket).
  const v = new Set(marks.filter((n) => calledSet.has(n) && nums.includes(n)));
  switch (rule) {
    case 'early5': return v.size >= 5;
    case 'early7': return v.size >= 7;
    case 'early9': return v.size >= 9;
    case 'lucky3': {
      const first = called.slice(0, 5);
      return nums.filter((n) => first.includes(n) && v.has(n)).length >= 3;
    }
    case 'full': return v.size === 15;
    default: {
      const need = patternNumbers(ticket, rule);
      return !!need && need.length > 0 && need.every((n) => !!n && v.has(n));
    }
  }
}
