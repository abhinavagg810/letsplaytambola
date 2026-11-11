import { genTicket, ticketNumbers, validateTicket } from '../src/index.ts';
import type { Ticket } from '../src/index.ts';
import { mulberry32 } from '../test-utils.ts';

const GOOD: Ticket = [
  [4, 0, 21, 0, 42, 0, 61, 0, 80],
  [0, 12, 25, 33, 0, 51, 0, 72, 0],
  [7, 0, 0, 38, 47, 0, 65, 0, 90],
];
const copy = (t: Ticket): Ticket => t.map((r) => r.slice());

describe('genTicket', () => {
  it('deals 2,000 valid tickets', () => {
    const rng = mulberry32(20241101);
    for (let i = 0; i < 2000; i++) {
      const t = genTicket(rng);
      const reason = validateTicket(t);
      if (reason) throw new Error(`ticket ${i} invalid: ${reason}\n${JSON.stringify(t)}`);
    }
  });

  it('is deterministic for a given seed and varies between seeds', () => {
    expect(genTicket(mulberry32(1))).toEqual(genTicket(mulberry32(1)));
    expect(genTicket(mulberry32(1))).not.toEqual(genTicket(mulberry32(2)));
  });

  it('survives an rng that returns values right at the edges', () => {
    let i = 0;
    const edgy = () => [0, 0.999999999, 0.5, 0.25, 0.75][i++ % 5];
    expect(validateTicket(genTicket(edgy))).toBeNull();
  });
});

describe('ticketNumbers', () => {
  it('lists the 15 numbers in reading order', () => {
    expect(ticketNumbers(GOOD)).toEqual([4, 21, 42, 61, 80, 12, 25, 33, 51, 72, 7, 38, 47, 65, 90]);
  });
});

describe('validateTicket', () => {
  it('accepts a good ticket', () => {
    expect(validateTicket(GOOD)).toBeNull();
  });

  it('rejects the wrong shape', () => {
    expect(validateTicket(null)).toMatch(/3 rows/);
    expect(validateTicket(GOOD.slice(0, 2))).toMatch(/3 rows/);
    const short = copy(GOOD); short[1] = short[1].slice(0, 8);
    expect(validateTicket(short)).toMatch(/9 columns/);
    const junk = copy(GOOD) as unknown as unknown[][]; junk[0][0] = '4';
    expect(validateTicket(junk)).toMatch(/invalid cell/);
    const big = copy(GOOD); big[2][8] = 91;
    expect(validateTicket(big)).toMatch(/invalid cell/);
  });

  it('rejects a ticket without exactly 15 numbers', () => {
    const fewer = copy(GOOD); fewer[0][2] = 0;
    expect(validateTicket(fewer)).toMatch(/15 numbers/);
    const more = copy(GOOD); more[0][1] = 11;
    expect(validateTicket(more)).toMatch(/15 numbers/);
  });

  it('rejects rows that do not have 5 numbers', () => {
    const t = copy(GOOD); t[0][2] = 0; t[1][0] = 5; // 15 numbers, but rows are 4/6/5
    expect(validateTicket(t)).toMatch(/Row 1 must have 5/);
  });

  it('rejects an empty column', () => {
    const t = copy(GOOD); t[1][1] = 0; t[1][0] = 5; // column 2 (10-19) is now empty
    expect(validateTicket(t)).toMatch(/Column 2 is empty/);
  });

  it('rejects numbers in the wrong column', () => {
    const t = copy(GOOD); t[1][1] = 20;
    expect(validateTicket(t)).toMatch(/out of range for column 2/);
    const first = copy(GOOD); first[0][0] = 10;
    expect(validateTicket(first)).toMatch(/out of range for column 1/);
    const last = copy(GOOD); last[0][8] = 79;
    expect(validateTicket(last)).toMatch(/out of range for column 9/);
  });

  it('allows 90 in the last column', () => {
    expect(validateTicket(GOOD)).toBeNull();
    expect(GOOD[2][8]).toBe(90);
  });

  it('rejects columns that are not sorted top to bottom', () => {
    const t = copy(GOOD); t[0][0] = 7; t[2][0] = 4;
    expect(validateTicket(t)).toMatch(/Column 1 is not sorted/);
  });

  it('rejects duplicates', () => {
    const t = copy(GOOD); t[2][0] = 4;
    expect(validateTicket(t)).toMatch(/duplicate/);
  });
});
