// Pattern pictures for the "Ways to win" guide (/ways-to-win): which cells of an example ticket a pattern needs.
// Worked out with patternNumbers() — the same code that checks claims — so a picture can never disagree with the game.
import { patternNumbers } from './patterns';
import type { RuleId, Ticket } from './types';

/**
 * The example ticket every picture uses: a valid ticket (3 × 9, 5 numbers a row, every column used, columns in order)
 * with two numbers in the 40s, so Bamboo has something to show.
 */
export const EXAMPLE_TICKET: Ticket = [
  [3, 0, 21, 0, 44, 0, 62, 0, 85],
  [0, 14, 0, 37, 48, 0, 0, 76, 88],
  [7, 0, 26, 0, 0, 53, 69, 0, 90],
];

/** For the "any N numbers" rules there is no fixed set: these are just one way to get there. */
const ANY_OF: Partial<Record<RuleId, number[]>> = {
  early5: [3, 37, 53, 69, 88],
  early7: [3, 21, 37, 53, 69, 76, 88],
  early9: [3, 21, 62, 14, 37, 76, 7, 53, 90],
  lucky3: [21, 48, 69],
};

export interface MiniCells {
  ticket: Ticket;
  /** The numbers dabbed in the picture. */
  numbers: number[];
  /** 27 cells in reading order: 'need' (part of the pattern), 'number' (on the ticket, not needed), 'blank'. */
  cells: ('need' | 'number' | 'blank')[];
  /** True for the rules where ANY such numbers count (Early Five, Seven, Nine; Lucky Three): the picture is one example. */
  example: boolean;
}

/** The picture of one way to win on EXAMPLE_TICKET. */
export function miniCells(rule: RuleId, ticket: Ticket = EXAMPLE_TICKET): MiniCells {
  const fixed = patternNumbers(ticket, rule);
  const numbers = (fixed ?? ANY_OF[rule] ?? []).filter(Boolean);
  const need = new Set(numbers);
  return {
    ticket,
    numbers,
    cells: ticket.flat().map((n) => (!n ? 'blank' : need.has(n) ? 'need' : 'number')),
    example: fixed === null,
  };
}

const ROWS = ['top', 'middle', 'bottom'] as const;

/** "21 (top line), 37 and 48 (middle line)" — where the dabbed numbers sit, for the text beside each picture. */
export function describeCells(m: MiniCells): string {
  const parts: string[] = [];
  m.ticket.forEach((row, r) => {
    const here = row.filter((n) => n && m.numbers.includes(n));
    if (!here.length) return;
    const list = here.length === 1 ? String(here[0]) : `${here.slice(0, -1).join(', ')} and ${here[here.length - 1]}`;
    parts.push(`${list} (${ROWS[r]} line)`);
  });
  return parts.join('; ');
}
