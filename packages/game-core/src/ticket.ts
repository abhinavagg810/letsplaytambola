// Ticket generation + validation. Pure: randomness comes from the `rng` argument.
import type { Ticket } from './types.ts';

/** Inclusive number range of a column: col 0 = 1-9, col c = c*10..c*10+9, col 8 = 80-90. */
export function columnRange(c: number): [number, number] {
  return [c === 0 ? 1 : c * 10, c === 8 ? 90 : c * 10 + 9];
}

/** Deal a valid ticket: 3x9, 15 numbers, 5 per row, >=1 per column, columns sorted top to bottom. */
export function genTicket(rng: () => number): Ticket {
  for (;;) {
    const counts: number[] = Array(9).fill(1);
    let extra = 6;
    while (extra) {
      const c = Math.floor(rng() * 9);
      if (counts[c] < 3) { counts[c]++; extra--; }
    }
    const rows = [0, 0, 0];
    const g: number[][] = [0, 1, 2].map(() => Array(9).fill(0));
    // Fullest columns first; ties broken randomly.
    const order = Array.from({ length: 9 }, (_, c) => [c, rng()] as [number, number])
      .sort((a, b) => counts[b[0]] - counts[a[0]] || a[1] - b[1])
      .map((x) => x[0]);
    let fail = false;
    for (const c of order) {
      // Emptiest rows first; ties broken randomly.
      const avail = [0, 1, 2]
        .filter((r) => rows[r] < 5)
        .map((r) => [r, rng()] as [number, number])
        .sort((a, b) => rows[a[0]] - rows[b[0]] || a[1] - b[1])
        .map((x) => x[0]);
      if (avail.length < counts[c]) { fail = true; break; }
      for (const r of avail.slice(0, counts[c])) { g[r][c] = 1; rows[r]++; }
    }
    if (fail || !rows.every((x) => x === 5)) continue;
    for (let c = 0; c < 9; c++) {
      const [lo, hi] = columnRange(c);
      const pool: number[] = [];
      for (let n = lo; n <= hi; n++) pool.push(n);
      const pick: number[] = [];
      while (pick.length < counts[c]) {
        const i = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
        pick.push(pool.splice(i, 1)[0]);
      }
      pick.sort((a, b) => a - b);
      let i = 0;
      for (let r = 0; r < 3; r++) if (g[r][c]) g[r][c] = pick[i++];
    }
    return g;
  }
}

/** Returns null when the ticket is valid, otherwise a human-readable reason. */
export function validateTicket(t: unknown): string | null {
  if (!Array.isArray(t) || t.length !== 3) return 'Ticket must have 3 rows';
  for (let r = 0; r < 3; r++) {
    const row: unknown = t[r];
    if (!Array.isArray(row) || row.length !== 9) return `Row ${r + 1} must have 9 columns`;
    for (const v of row) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 90) return `Row ${r + 1} has an invalid cell`;
    }
  }
  const grid = t as number[][];
  const nums = grid.flat().filter((n) => n !== 0);
  if (nums.length !== 15) return `Ticket must have 15 numbers (has ${nums.length})`;
  if (new Set(nums).size !== nums.length) return 'Ticket has duplicate numbers';
  for (let r = 0; r < 3; r++) {
    const k = grid[r].filter((n) => n !== 0).length;
    if (k !== 5) return `Row ${r + 1} must have 5 numbers (has ${k})`;
  }
  for (let c = 0; c < 9; c++) {
    const col = grid.map((row) => row[c]).filter((n) => n !== 0);
    if (!col.length) return `Column ${c + 1} is empty`;
    const [lo, hi] = columnRange(c);
    for (const n of col) if (n < lo || n > hi) return `${n} is out of range for column ${c + 1} (${lo}-${hi})`;
    for (let i = 1; i < col.length; i++) if (col[i] <= col[i - 1]) return `Column ${c + 1} is not sorted top to bottom`;
  }
  return null;
}

/** The ticket's numbers in reading order (row by row, left to right). */
export function ticketNumbers(t: Ticket): number[] {
  return t.flat().filter((n) => n !== 0);
}
