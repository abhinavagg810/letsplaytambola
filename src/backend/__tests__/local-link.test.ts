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

const TAKEN = { ok: false, error: 'That number already has a Tambola account — sign out and sign in with it instead' };

test('a guest adding a number that is someone else’s account is told so, and stays who they are', async () => {
  const b = createLocalBackend();
  await b.verifyOtp('+919900000013', '123456', 'Asha');
  const asha = (await b.currentUser())!;
  await b.signOut();
  await b.signInGuest('Guest');
  const guest = (await b.currentUser())!;
  const seen: (string | null)[] = [];
  b.onAuthChange((u) => seen.push(u ? u.uid : null));

  expect(await b.sendOtp('+919900000013')).toEqual(TAKEN);
  expect(await b.verifyOtp('+919900000013', '123456')).toEqual(TAKEN);
  expect(await b.verifyOtp('99000 00013', '123456')).toEqual(TAKEN);       // same number, typed differently
  expect(await b.currentUser()).toEqual(guest);                            // still the guest, nothing changed
  expect(seen).toEqual([]);                                                // no sign-in/out happened
  expect(kvGet<User[]>('accounts', []).find((a) => a.uid === asha.uid)).toEqual(asha);

  // a free number still attaches to the guest account
  expect(await b.sendOtp('+919900000014')).toEqual({ ok: true });
  expect(await b.verifyOtp('+919900000014', '123456')).toEqual({ ok: true });
  expect(await b.currentUser()).toMatchObject({ uid: guest.uid, phone: '+919900000014', isGuest: false });
});

test('a Google/Apple account adding a number that is someone else’s account is refused too', async () => {
  const b = createLocalBackend();
  await b.verifyOtp('+919900000015', '123456', 'Asha');
  await b.signOut();
  await b.verifyOtp('+919900000016', '123456', 'Kavya');
  const me = (await b.currentUser())!;
  kvSet('accounts', kvGet<User[]>('accounts', []).map((a) => (a.uid === me.uid ? { ...a, phone: null, email: 'k@example.com' } : a)));
  expect(await b.sendOtp('+919900000015')).toEqual(TAKEN);
  expect(await b.verifyOtp('+919900000015', '123456')).toEqual(TAKEN);
  expect(await b.currentUser()).toMatchObject({ uid: me.uid, phone: null, email: 'k@example.com' });
});

test('signed out, an existing number signs in to its account as before', async () => {
  const b = createLocalBackend();
  await b.verifyOtp('+919900000013', '123456', 'Asha');
  const asha = (await b.currentUser())!;
  await b.signOut();
  expect(await b.sendOtp('+919900000013')).toEqual({ ok: true });
  expect(await b.verifyOtp('+919900000013', '123456')).toEqual({ ok: true });
  expect((await b.currentUser())!.uid).toBe(asha.uid);
});

test('someone signed in with their own number can still switch to another account by number (unchanged)', async () => {
  const b = createLocalBackend();
  await b.verifyOtp('+919900000013', '123456', 'Asha');
  const asha = (await b.currentUser())!;
  await b.verifyOtp('+919900000017', '123456', 'Bina');
  expect(await b.verifyOtp('+919900000013', '123456')).toEqual({ ok: true });
  expect((await b.currentUser())!.uid).toBe(asha.uid);
});
