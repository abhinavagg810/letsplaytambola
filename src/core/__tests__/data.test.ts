import { describe, expect, it } from 'vitest';
import callouts from '../../../docs/design_handoff/data/number-callouts.json';
import {
  AVATAR_COLORS, CALLOUTS, CODE_ALPHABET, GAME_NAME_IDEAS, PRESETS, RULES, RULE_GROUPS,
  calloutFor, genCode, isGameCode, isRuleId, matchPreset, prizeSummary, ruleDesc, ruleName, speechFor, spokenNumber, winText,
} from '../index';
import { mulberry32 } from './helpers';

describe('data', () => {
  it('has the 90 callouts from the seed data', () => {
    expect(CALLOUTS).toHaveLength(90);
    expect(callouts.map((c) => c.number)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(CALLOUTS).toEqual(callouts.map((c) => c.callout));
  });

  it('has 26 rules in 6 groups', () => {
    expect(RULES).toHaveLength(26);
    expect(new Set(RULES.map((r) => r.id)).size).toBe(26);
    expect(RULE_GROUPS).toEqual(['Quick', 'Lines', 'Corners', 'Shapes', 'Number ranges', 'Full ticket']);
    expect(isRuleId('top')).toBe(true);
    expect(isRuleId('nope')).toBe(false);
    expect(isRuleId('constructor')).toBe(false);
  });

  it('has the three presets', () => {
    expect(PRESETS.map((p) => p.name)).toEqual(['Classic', 'Lines + House', 'Just Full House']);
    expect(PRESETS[0].rules).toEqual(['early5', 'top', 'middle', 'bottom', 'corners', 'full']);
    expect(PRESETS[1].rules).toEqual(['top', 'middle', 'bottom', 'full']);
    expect(PRESETS[2].rules).toEqual(['full']);
    for (const p of PRESETS) for (const r of p.rules) expect(isRuleId(r)).toBe(true);
    expect(matchPreset(['full', 'top', 'bottom', 'middle'])?.name).toBe('Lines + House');
    expect(matchPreset(['top'])).toBeNull();
    expect(prizeSummary(PRESETS[0].rules)).toBe('Classic · 6 ways');
    expect(prizeSummary(['full'])).toBe('Just Full House · 1 way');
    expect(prizeSummary(['top', 'star'])).toBe('Your own mix · 2 ways');
  });

  it('has the avatar colours and name ideas', () => {
    expect(AVATAR_COLORS).toEqual([
      'oklch(0.68 0.22 358)', 'oklch(0.83 0.16 78)', 'oklch(0.8 0.13 180)',
      'oklch(0.75 0.14 260)', 'oklch(0.8 0.15 140)', 'oklch(0.75 0.15 30)',
    ]);
    expect(GAME_NAME_IDEAS).toEqual(['Kitty Party', 'Diwali Night', 'Family Sunday', 'Teej Special']);
  });

  it('names and describes rules', () => {
    expect(ruleName('kings')).toBe('King’s Corner');
    expect(ruleDesc('top')).toBe('All 5 numbers of the top line');
    expect(ruleName('nope')).toBe('nope');
  });

  it('speaks like the caller', () => {
    expect(calloutFor(1)).toBe("Kelly's eye");
    expect(calloutFor(90)).toBe('Top of the house');
    expect(spokenNumber(7)).toBe('Single number, 7');
    expect(spokenNumber(42)).toBe('4 and 2, 42');
    expect(spokenNumber(90)).toBe('9 and 0, 90');
    expect(speechFor(88)).toBe('Two fat ladies! ... 8 and 8, 88');
    expect(winText('Meera', 'Top Line')).toBe('Meera wins Top Line!');
  });

  it('makes game codes from the README alphabet', () => {
    expect(CODE_ALPHABET).toBe('ABCDEFGHJKMNPQRSTUVWXYZ23456789');
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const code = genCode(rng);
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
      expect(isGameCode(code)).toBe(true);
    }
    expect(genCode(() => 0.9999999999)).toBe('99999');
    for (const bad of ['K7RQ', 'K7RQ22', 'k7rq2', 'K0RQ2', 'KIRQ2', 'KLRQ2', 'K1RQ2', 'KORQ2', '', null, 12345]) expect(isGameCode(bad)).toBe(false);
  });
});
