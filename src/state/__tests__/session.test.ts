/// <reference types="jest" />
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PENDING_KEY, needsUsername, session, setPendingCode } from '../session';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const flush = () => new Promise((r) => setTimeout(r, 0));

test('the invite code is remembered on the device and forgotten once used', async () => {
  setPendingCode('ab2cd');
  expect(session.get().pendingCode).toBe('AB2CD');
  await flush();
  expect(await AsyncStorage.getItem(PENDING_KEY)).toBe('AB2CD');
  setPendingCode(null);
  expect(session.get().pendingCode).toBeNull();
  await flush();
  expect(await AsyncStorage.getItem(PENDING_KEY)).toBeNull();
});

test('junk is never stored as a code', () => {
  setPendingCode('../../etc');
  expect(session.get().pendingCode).toBeNull();
});

test('only signed-in, non-guest users without a handle are asked for a username', () => {
  const base = { uid: 'u', name: 'Asha', email: null, phone: null, color: '#fff' };
  expect(needsUsername(null)).toBe(false);
  expect(needsUsername({ ...base, username: null, isGuest: true })).toBe(false);
  expect(needsUsername({ ...base, username: null, isGuest: false })).toBe(true);
  expect(needsUsername({ ...base, username: 'asha', isGuest: false })).toBe(false);
});
