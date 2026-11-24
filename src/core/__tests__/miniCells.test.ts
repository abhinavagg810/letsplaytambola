import { describe, expect, it } from 'vitest';
import { RULES } from '../data';
import { EXAMPLE_TICKET, describeCells, miniCells } from '../miniCells';
import { checkPattern } from '../patterns';
import { validateTicket } from '../ticket';

const CALL_ALL = Array.from({ length: 90 }, (_, i) => i + 1);

describe('miniCells — the pattern pictures of /ways-to-win', () => {
  it('uses a valid ticket', () => {
    expect(validateTicket(EXAMPLE_TICKET)).toBeNull();
  });

  it.each(RULES.map((r) => [r.id, r.name] as const))('%s: dabbing exactly the pictured numbers wins it, and one fewer does not', (id) => {
    const m = miniCells(id);
    expect(m.cells).toHaveLength(27);
    expect(m.numbers.length).toBeGreaterThan(0);
    expect(m.cells.filter((c) => c === 'need')).toHaveLength(m.numbers.length);
    // Lucky Three needs its numbers among the first five called: call the pictured ones first.
    const called = id === 'lucky3' ? [...m.numbers, ...CALL_ALL.filter((n) => !m.numbers.includes(n))] : CALL_ALL;
    expect(checkPattern(EXAMPLE_TICKET, m.numbers, called, id)).toBe(true);
    expect(checkPattern(EXAMPLE_TICKET, m.numbers.slice(1), called, id)).toBe(false);
  });

  it('marks the any-N rules as examples and the rest as exact', () => {
    expect(RULES.filter((r) => miniCells(r.id).example).map((r) => r.id)).toEqual(['early5', 'early7', 'early9', 'lucky3']);
  });

  it('describes where the numbers are', () => {
    expect(describeCells(miniCells('corners'))).toBe('3 and 85 (top line); 7 and 90 (bottom line)');
    expect(describeCells(miniCells('laddoo'))).toBe('48 (middle line)');
  });
});
