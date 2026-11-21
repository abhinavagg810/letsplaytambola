// QA U-02: switching auto-call on must wait a full interval before the first number (docs/qa/QA_REPORT_USER.md).
import { describe, expect, it } from 'vitest';
import { autoCallDelay } from '../useAutoCall';

describe('autoCallDelay', () => {
  const T = 1_000_000;

  it('waits a full interval after auto-call is switched on, however long ago the last number was', () => {
    expect(autoCallDelay(6, T - 60_000, T, T)).toBe(6000); // last number a minute ago
    expect(autoCallDelay(6, 0, T, T)).toBe(6000); // nothing called yet
    expect(autoCallDelay(10, T - 1, T, T)).toBe(10_000);
  });

  it('keeps an even rhythm while it runs: one interval after the last number', () => {
    expect(autoCallDelay(6, T, T - 30_000, T + 250)).toBe(5750); // the view arrived 250 ms after the call
    expect(autoCallDelay(4, T, T - 30_000, T + 3999)).toBe(1);
  });

  it('never waits less than 0 or more than one interval (clock jumps, a host back from sleep)', () => {
    expect(autoCallDelay(6, T, T - 30_000, T + 60_000)).toBe(0);
    expect(autoCallDelay(6, T + 60_000, T, T)).toBe(6000);
  });
});
