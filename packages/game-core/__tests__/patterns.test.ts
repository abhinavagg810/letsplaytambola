import { RULES, checkPattern, patternNumbers, validateTicket } from '../src/index.ts';
import type { RuleId, Ticket } from '../src/index.ts';

//            col: 1-9  10s  20s  30s  40s  50s  60s  70s  80-90
const T: Ticket = [
  /* top    */ [4, 0, 21, 0, 42, 0, 61, 0, 80],
  /* middle */ [0, 12, 25, 33, 0, 51, 0, 72, 0],
  /* bottom */ [7, 0, 0, 38, 47, 0, 65, 0, 90],
];
const ALL = [4, 21, 42, 61, 80, 12, 25, 33, 51, 72, 7, 38, 47, 65, 90];

/** Hand-worked required numbers for every positional / range rule on ticket T. */
const NEED: Partial<Record<RuleId, number[]>> = {
  laddoo: [33],
  temp: [4, 90],
  top: [4, 21, 42, 61, 80],
  middle: [12, 25, 33, 51, 72],
  bottom: [7, 38, 47, 65, 90],
  railway: [4, 7, 80, 90],
  bamboo: [42, 47],
  corners: [4, 80, 7, 90],
  star: [4, 80, 7, 90, 33],
  six: [4, 80, 12, 72, 7, 90],
  kings: [4, 12, 7],
  queens: [80, 72, 90],
  pyramid: [42, 25, 51, 38, 47, 65],
  rpyramid: [21, 42, 61, 25, 51, 47],
  diamond: [42, 12, 72, 47],
  one24: [4, 12, 25, 7, 38, 47, 65],
  breakfast: [4, 21, 12, 25, 7],
  lunch: [42, 33, 51, 38, 47],
  dinner: [61, 80, 72, 65, 90],
  day: [4, 21, 42, 12, 25, 33, 7, 38],
  night: [61, 80, 51, 72, 47, 65, 90],
  full: ALL,
};
const COUNT: Partial<Record<RuleId, number>> = { early5: 5, early7: 7, early9: 9 };

const sorted = (a: number[]) => a.slice().sort((x, y) => x - y);

it('the fixture ticket is valid and every rule has a test', () => {
  expect(validateTicket(T)).toBeNull();
  const covered = [...Object.keys(NEED), ...Object.keys(COUNT), 'lucky3'];
  expect(RULES).toHaveLength(26);
  expect(sorted(covered.map((id) => RULES.findIndex((r) => r.id === id)))).toEqual(RULES.map((_, i) => i));
});

describe.each(Object.entries(NEED) as [RuleId, number[]][])('%s', (rule, need) => {
  it('lists the required numbers', () => {
    expect(sorted(patternNumbers(T, rule) ?? [])).toEqual(sorted(need));
  });

  it('wins when every required number is called and dabbed', () => {
    expect(checkPattern(T, need, need, rule)).toBe(true);
    // extra called numbers / dabs do not hurt
    expect(checkPattern(T, ALL, [...ALL, 1, 2, 3], rule)).toBe(true);
  });

  it('does not win with any one required number un-dabbed', () => {
    for (const miss of need) {
      const dabs = ALL.filter((n) => n !== miss);
      expect(checkPattern(T, dabs, ALL, rule)).toBe(false);
    }
  });

  it('does not count a dab on a number that was never called', () => {
    for (const miss of need) {
      const called = ALL.filter((n) => n !== miss);
      expect(checkPattern(T, ALL, called, rule)).toBe(false);
    }
    expect(checkPattern(T, need, [], rule)).toBe(false);
  });
});

describe.each(Object.entries(COUNT) as [RuleId, number][])('%s', (rule, k) => {
  it('is count-based', () => {
    expect(patternNumbers(T, rule)).toBeNull();
  });

  it(`wins with any ${k} called numbers dabbed`, () => {
    expect(checkPattern(T, ALL.slice(0, k), ALL, rule)).toBe(true);
    expect(checkPattern(T, ALL.slice(-k), ALL, rule)).toBe(true);
    expect(checkPattern(T, ALL, ALL, rule)).toBe(true);
  });

  it(`does not win with ${k - 1}`, () => {
    expect(checkPattern(T, ALL.slice(0, k - 1), ALL, rule)).toBe(false);
  });

  it('does not count dabs of uncalled numbers', () => {
    expect(checkPattern(T, ALL.slice(0, k), ALL.slice(0, k - 1), rule)).toBe(false);
    expect(checkPattern(T, ALL, [], rule)).toBe(false);
  });

  it('does not count dabs of numbers that are not on the ticket', () => {
    const off = [1, 2, 3, 5, 6, 8, 9, 10, 11];
    expect(checkPattern(T, off, off, rule)).toBe(false);
  });
});

describe('lucky3', () => {
  it('is count-based', () => {
    expect(patternNumbers(T, 'lucky3')).toBeNull();
  });

  it('wins with 3 ticket numbers among the first five called', () => {
    expect(checkPattern(T, [4, 12, 7], [4, 1, 12, 2, 7], 'lucky3')).toBe(true);
    expect(checkPattern(T, [4, 12, 7], [4, 1, 12, 2, 7, 3, 5, 6], 'lucky3')).toBe(true);
  });

  it('does not win with only 2 of them dabbed', () => {
    expect(checkPattern(T, [4, 12], [4, 1, 12, 2, 7], 'lucky3')).toBe(false);
  });

  it('only counts the first five called', () => {
    // 7 was the sixth number out
    expect(checkPattern(T, [4, 12, 7], [4, 1, 12, 2, 3, 7], 'lucky3')).toBe(false);
    expect(checkPattern(T, ALL, [1, 2, 3, 5, 6, ...ALL], 'lucky3')).toBe(false);
  });

  it('does not count dabs of uncalled numbers', () => {
    expect(checkPattern(T, [4, 12, 7], [4, 12], 'lucky3')).toBe(false);
  });
});

describe('edge cases', () => {
  it('temp is the smallest and the biggest number on the ticket', () => {
    expect(patternNumbers(T, 'temp')).toEqual([4, 90]);
    expect(checkPattern(T, [4, 90], [4, 90], 'temp')).toBe(true);
    expect(checkPattern(T, [7, 90], [4, 7, 90], 'temp')).toBe(false);
    expect(checkPattern(T, [4, 80], [4, 80, 90], 'temp')).toBe(false);
  });

  it('a ticket with no numbers in the 40s can never win Bamboo', () => {
    // Hand-made grid: a real ticket always has a 40s number, but the rule must still hold.
    const no40s: Ticket = [
      [4, 0, 21, 0, 0, 50, 61, 0, 80],
      [0, 12, 25, 33, 0, 51, 0, 72, 0],
      [7, 0, 0, 38, 0, 59, 65, 0, 90],
    ];
    const nums = no40s.flat().filter(Boolean);
    const everything = Array.from({ length: 90 }, (_, i) => i + 1);
    expect(patternNumbers(no40s, 'bamboo')).toEqual([]);
    expect(checkPattern(no40s, nums, everything, 'bamboo')).toBe(false);
    expect(checkPattern(no40s, everything, everything, 'bamboo')).toBe(false);
    // ...while the same full dab does win a pattern it has numbers for
    expect(checkPattern(no40s, nums, everything, 'full')).toBe(true);
  });

  it('full house needs all 15', () => {
    expect(checkPattern(T, ALL.slice(0, 14), ALL, 'full')).toBe(false);
    expect(checkPattern(T, ALL, ALL, 'full')).toBe(true);
  });

  it('an unknown rule never wins', () => {
    expect(checkPattern(T, ALL, ALL, 'nope' as RuleId)).toBe(false);
  });
});
