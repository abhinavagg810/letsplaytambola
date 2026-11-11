/// <reference types="jest" />
import { kvClear, kvGet, kvSet } from '../kv';
import { createLocalBackend } from '../local';
import type { User } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

beforeEach(() => kvClear());

test('a guest who adds a phone number keeps the same account', async () => {
  const b = createLocalBackend();
  await b.signInGuest('Bina');
  const guest = (await b.currentUser())!;
  expect(guest.isGuest).toBe(true);
  expect(await b.verifyOtp('+919900000010', '123456')).toEqual({ ok: true });
  const user = (await b.currentUser())!;
  expect(user).toMatchObject({ uid: guest.uid, name: 'Bina', isGuest: false, phone: '+919900000010' });
});

test('someone signed in without a number (Google/Apple) adds one to the same account', async () => {
  const b = createLocalBackend();
  await b.verifyOtp('+919900000011', '123456', 'Kavya');
  await b.updateProfile({ username: 'kavya' });
  const me = (await b.currentUser())!;
  // Demo mode has no Google sign-in, so make this account look like one: an email, no phone.
  kvSet('accounts', kvGet<User[]>('accounts', []).map((a) => (a.uid === me.uid ? { ...a, phone: null, email: 'k@example.com' } : a)));
  expect((await b.currentUser())!.phone).toBeNull();
  expect(await b.verifyOtp('+919900000012', '123456')).toEqual({ ok: true });
  expect(await b.currentUser()).toMatchObject({ uid: me.uid, username: 'kavya', phone: '+919900000012', email: 'k@example.com' });
});

test('a number that already has an account signs in to that account instead', async () => {
  const b = createLocalBackend();
  await b.verifyOtp('+919900000013', '123456', 'Asha');
  const asha = (await b.currentUser())!;
  await b.signOut();
  await b.signInGuest('Guest');
  expect(await b.verifyOtp('+919900000013', '123456')).toEqual({ ok: true });
  expect((await b.currentUser())!.uid).toBe(asha.uid);
});
