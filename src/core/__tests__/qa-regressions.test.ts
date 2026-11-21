// Regression tests for bugs found in the QA pass of the player side (docs/qa/QA_REPORT_USER.md).
import { describe, expect, it } from 'vitest';
import { COPY, RULES, cleanName, isIndianMobile, mobileDigits, ruleDesc } from '../index';
import { Table } from './helpers';

describe('U-01 draw is safe to repeat (two host tabs, double taps, retries)', () => {
  const live = () => {
    const t = new Table();
    t.join('Meera');
    t.ok(t.host, { type: 'start' });
    return t;
  };

  it('calls a number only when `after` matches how many have been called', () => {
    const t = live();
    // Two tabs both saw 0 numbers and both ask for the next one.
    const first = t.ok(t.host, { type: 'draw', after: 0 });
    const second = t.ok(t.host, { type: 'draw', after: 0 });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(t.doc.called).toHaveLength(1);
    // The tab that is up to date carries on.
    t.ok(t.host, { type: 'draw', after: 1 });
    expect(t.doc.called).toHaveLength(2);
    // A tab that is somehow ahead does nothing either.
    expect(t.ok(t.host, { type: 'draw', after: 5 }).changed).toBe(false);
    expect(t.doc.called).toHaveLength(2);
  });

  it('still draws without `after` (older clients, the smoke script)', () => {
    const t = live();
    t.ok(t.host, { type: 'draw' });
    t.ok(t.host, { type: 'draw' });
    expect(t.doc.called).toHaveLength(2);
  });

  it('refuses a malformed `after` and keeps host-only and status checks first', () => {
    const t = live();
    for (const bad of [-1, 91, 1.5, '0', null, NaN]) {
      expect(t.act(t.host, { type: 'draw', after: bad as unknown as number })).toMatchObject({ ok: false, code: 'invalid' });
    }
    expect(t.doc.called).toHaveLength(0);
    const meera = { isHost: false, pid: t.doc.players[1].pid };
    expect(t.act(meera, { type: 'draw', after: 0 })).toMatchObject({ ok: false, code: 'forbidden', error: COPY.hostOnly });
  });

  it('the 90th number with `after: 89` ends the round exactly once', () => {
    const t = live();
    for (let i = 0; i < 89; i++) t.ok(t.host, { type: 'draw', after: i });
    expect(t.doc.status).toBe('live');
    t.ok(t.host, { type: 'draw', after: 89 });
    expect(t.doc).toMatchObject({ status: 'done', auto: 0 });
    expect(new Set(t.doc.called).size).toBe(90);
    expect(t.act(t.host, { type: 'draw', after: 89 })).toMatchObject({ ok: false, code: 'state' });
  });
});

describe('U-04 Full House rule text', () => {
  it('does not promise a "Second House" (a pattern can be picked once)', () => {
    expect(ruleDesc('full')).toBe('All 15 numbers');
    for (const r of RULES) expect(r.rule).not.toMatch(/second house|add again/i);
  });
});

describe('U-09 names: invisible and text-flipping characters', () => {
  it('drops control, zero-width and direction-override characters', () => {
    expect(cleanName('Mee​ra')).toBe('Meera');
    expect(cleanName('‮areeM‬')).toBe('areeM');
    expect(cleanName('Meera\u0000\u0007')).toBe('Meera');
    expect(cleanName('Line1\nLine2\tx')).toBe('Line1 Line2 x');
    expect(cleanName('﻿Priya⁠')).toBe('Priya');
  });

  it('treats a name with nothing visible as empty', () => {
    for (const blank of ['​', '​​ ', '‍', '‌‍', '‮', '⁠﻿', '   ']) {
      expect(cleanName(blank), JSON.stringify(blank)).toBe('');
    }
    const t = new Table();
    expect(t.act({ isHost: false, pid: null }, { type: 'join', name: '​​' })).toMatchObject({ ok: false, error: COPY.nameToJoin });
  });

  it('keeps real names in Indian scripts, joiners inside words, and emoji', () => {
    expect(cleanName('  मीरा   देवी ')).toBe('मीरा देवी');
    expect(cleanName('क्‍ष')).toBe('क्‍ष'); // joiner used by Devanagari
    expect(cleanName('Nani 👵🏽')).toBe('Nani 👵🏽');
    expect(cleanName('👩‍👩‍👧')).toBe('👩‍👩‍👧');
    expect(cleanName('مريم')).toBe('مريم');
  });

  it('removes half an emoji left behind when a name is cut at 24 characters', () => {
    const cut = ('a'.repeat(23) + '😀').slice(0, 24); // ends with a lone surrogate
    expect(cleanName(cut)).toBe('a'.repeat(23));
  });
});

describe('U-07/U-08 notify-me numbers', () => {
  it('cleans what was typed or pasted', () => {
    expect(mobileDigits('+91 98100-11001')).toBe('9810011001');
    expect(mobileDigits('09810011001')).toBe('9810011001');
    expect(mobileDigits('0091 9810011001')).toBe('9810011001');
    expect(mobileDigits('98100 11001')).toBe('9810011001');
    expect(mobileDigits('9198100110')).toBe('9198100110'); // a 10-digit number that happens to start with 91 is left alone
    expect(mobileDigits('98100110011')).toBe('98100110011'); // too long stays too long
    expect(mobileDigits(undefined)).toBe('');
  });

  it('accepts only 10 digits starting 6–9', () => {
    for (const ok of ['9810011001', '6000000000', '7999999999', '8123456789']) expect(isIndianMobile(ok), ok).toBe(true);
    for (const bad of ['1234567890', '5999999999', '0981001100', '981001100', '98100110011', '', '98100 11001']) expect(isIndianMobile(bad), bad).toBe(false);
  });
});

describe('voice caller text for all 90 numbers (QA LIVE-04)', () => {
  it('is "<rhyme>! ... Single number, N" below 10 and "<rhyme>! ... T and U, N" from 10', async () => {
    const { speechFor } = await import('../index');
    const { readFileSync } = await import('node:fs');
    const seed = JSON.parse(readFileSync(new URL('../../../docs/design_handoff/data/number-callouts.json', import.meta.url), 'utf8')) as { number: number; callout: string }[];
    expect(seed).toHaveLength(90);
    for (const { number: n, callout } of seed) {
      const want = n < 10 ? `${callout}! ... Single number, ${n}` : `${callout}! ... ${Math.floor(n / 10)} and ${n % 10}, ${n}`;
      expect(speechFor(n), `number ${n}`).toBe(want);
    }
    expect(speechFor(7)).toBe('Lucky seven, straight to heaven! ... Single number, 7');
    expect(speechFor(10)).toContain('1 and 0, 10');
    expect(speechFor(88)).toBe('Two fat ladies! ... 8 and 8, 88');
    expect(speechFor(90)).toContain('9 and 0, 90');
  });
});
