import {
  AVATAR_COLORS, CALLOUTS, DEFAULT_PRIZES, PRESETS, REACTS, RULES,
  calloutFor, miniCells, ruleDesc, ruleName, speechFor, spokenNumber,
} from '../src/index.ts';

describe('data', () => {
  it('has 90 callouts and 26 rules in prototype order', () => {
    expect(CALLOUTS).toHaveLength(90);
    expect(CALLOUTS.every((c) => typeof c === 'string' && c.length > 0)).toBe(true);
    expect(RULES).toHaveLength(26);
    expect(RULES[0].id).toBe('early5');
    expect(RULES[25].id).toBe('full');
    expect(new Set(RULES.map((r) => r.id)).size).toBe(26);
  });

  it('presets and default prizes only use known rules', () => {
    const ids = RULES.map((r) => r.id);
    for (const p of PRESETS) for (const r of p.rules) expect(ids).toContain(r);
    for (const p of DEFAULT_PRIZES) expect(ids).toContain(p.rule);
    expect(REACTS).toHaveLength(5);
    expect(AVATAR_COLORS).toHaveLength(6);
  });

  it('names and describes rules', () => {
    expect(ruleName('kings')).toBe('King’s Corner');
    expect(ruleDesc('top')).toBe('All 5 numbers of the top line');
    expect(ruleName('nope')).toBe('nope');
  });

  it('builds mini previews', () => {
    expect(miniCells('full')).toEqual(Array(27).fill(true));
    const top = miniCells('top');
    expect(top).toHaveLength(27);
    expect(top.slice(0, 9).every(Boolean)).toBe(true);
    expect(top.slice(9).some(Boolean)).toBe(false);
    expect(miniCells('laddoo').filter(Boolean)).toHaveLength(1);
  });

  it('speaks numbers like the caller', () => {
    expect(calloutFor(1)).toBe("Kelly's eye");
    expect(calloutFor(90)).toBe('Top of the house');
    expect(spokenNumber(7)).toBe('Single number, 7');
    expect(spokenNumber(42)).toBe('4 and 2, 42');
    expect(spokenNumber(90)).toBe('9 and 0, 90');
    expect(speechFor(88)).toBe('Two fat ladies! ... 8 and 8, 88');
  });
});
