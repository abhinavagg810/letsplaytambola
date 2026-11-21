// QA U-12: pasted prices and prize amounts with paise must not grow extra digits.
import { describe, expect, it } from 'vitest';
import { amountsTotal, pickedAmounts, wholeRupees } from '../draft';
import type { HostDraft } from '../draft';

describe('wholeRupees', () => {
  it('keeps digits only, up to the limit', () => {
    expect(wholeRupees('₹1,500', 5)).toBe('1500');
    expect(wholeRupees('12ab3', 5)).toBe('123');
    expect(wholeRupees('1234567', 5)).toBe('12345');
    expect(wholeRupees('abc', 5)).toBe('');
  });

  it('drops paise instead of gluing them on', () => {
    expect(wholeRupees('1500.50', 5)).toBe('1500');
    expect(wholeRupees('₹2,000.00', 6)).toBe('2000');
    expect(wholeRupees('12.5', 6)).toBe('12');
    expect(wholeRupees('99.', 6)).toBe('99');
  });
});

describe('prize amounts in the draft', () => {
  const draft = (over: Partial<HostDraft>): HostDraft => ({ name: 'Priya', gameName: 'x', price: '', hostPlays: true, prizes: ['top', 'full'], amounts: {}, ...over });

  it('counts only picked patterns with an amount above zero', () => {
    const d = draft({ amounts: { top: '500', full: '0', early5: '250' } });
    expect(pickedAmounts(d)).toEqual({ top: 500 });
    expect(amountsTotal(d)).toBe(500);
    expect(amountsTotal(draft({}))).toBe(0);
  });
});
