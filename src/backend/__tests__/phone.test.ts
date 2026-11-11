/// <reference types="jest" />
import { USERNAME_RE, cleanHandle, phoneDigits, toE164 } from '../phone';

test('phone numbers are matched as digits with country code', () => {
  expect(phoneDigits('98100 11001')).toBe('919810011001');
  expect(phoneDigits('+91 98100-11001')).toBe('919810011001');
  expect(phoneDigits('09810011001')).toBe('919810011001');
  expect(phoneDigits('0091 98100 11001')).toBe('919810011001');
  expect(phoneDigits('+1 415 555 0100')).toBe('14155550100');
  expect(phoneDigits('')).toBe('');
  expect(toE164('9810011001')).toBe('+919810011001');
});

test('usernames: @ and case are ignored, 3–15 letters, numbers or _', () => {
  expect(cleanHandle(' @Priya_S ')).toBe('priya_s');
  expect(USERNAME_RE.test('priya_s')).toBe(true);
  expect(USERNAME_RE.test('ab')).toBe(false);
  expect(USERNAME_RE.test('a'.repeat(16))).toBe(false);
  expect(USERNAME_RE.test('priya.s')).toBe(false);
});
