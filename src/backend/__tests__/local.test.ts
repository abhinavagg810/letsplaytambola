/// <reference types="jest" />
import type { CreateGameInput, GameView } from '@core/types.ts';
import { kvClear } from '../kv';
import { DEMO_CONTACTS, createLocalBackend, seedDemoData } from '../local';
import type { Backend } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const HOST = '+919900000001';
const ASHA = '+919900000002';
const input = (over: Partial<CreateGameInput> = {}): CreateGameInput => ({
  name: 'Diwali night', maxSeats: 4, price: 50, hostPlays: true,
  prizes: [
    { id: 'early5', label: 'Early Five', rule: 'early5', amt: 50 },
    { id: 'full', label: 'Full House', rule: 'full', amt: 100 },
  ],
  invited: [], contacts: [], ...over,
});

/** Native has one session per device, so "switching phones" is signing in as someone else. */
async function as(b: Backend, phone: string, name?: string) {
  expect(await b.verifyOtp(phone, '123456', name)).toEqual({ ok: true });
  const u = await b.currentUser();
  if (!u) throw new Error('not signed in');
  return u;
}
async function game(b: Backend, code: string): Promise<GameView> {
  const g = await b.getGame(code);
  if (!g) throw new Error('game not found');
  return g;
}

describe('local backend', () => {
  let b: Backend;
  beforeEach(() => { kvClear(); b = createLocalBackend(); });

  test('auth: demo OTP, accounts keyed by phone, usernames, guests', async () => {
    expect(await b.currentUser()).toBeNull();
    expect((await b.sendOtp(HOST)).ok).toBe(true);
    expect(await b.verifyOtp(HOST, '000000')).toEqual({ ok: false, error: 'That code isn’t right — try 123456 in demo mode' });
    expect(await b.signInWithGoogle()).toEqual({ ok: false, error: 'Google sign-in needs the live backend — use your phone number in demo mode' });

    const seen: (string | null)[] = [];
    const off = b.onAuthChange((u) => seen.push(u ? u.uid : null));
    const nani = await as(b, HOST);
    expect(nani).toMatchObject({ name: '', username: null, phone: HOST, isGuest: false });
    expect(nani.color).toMatch(/^#/);

    expect(await b.usernameAvailable('rahul')).toBe(false);           // seeded demo account
    expect(await b.usernameAvailable('Na')).toBe(false);              // too short
    expect(await b.usernameAvailable('nani')).toBe(true);
    expect(await b.updateProfile({ username: 'rahul' })).toEqual({ ok: false, error: '@rahul is taken' });
    expect(await b.updateProfile({ name: 'Nani', username: 'nani' })).toEqual({ ok: true });
    expect(await b.usernameAvailable('nani')).toBe(true);             // it's mine

    await b.signOut();
    expect(await b.currentUser()).toBeNull();
    expect((await as(b, HOST)).uid).toBe(nani.uid);                   // same phone -> same account
    expect((await b.currentUser())?.username).toBe('nani');
    off();
    expect(seen).toEqual([nani.uid, nani.uid, null, nani.uid]);

    await b.signOut();
    expect((await b.signInGuest('Chintu')).ok).toBe(true);
    const guest = await b.currentUser();
    expect(guest).toMatchObject({ name: 'Chintu', isGuest: true, username: null, phone: null });
    // a guest who verifies a phone keeps their uid (and so their games)
    expect((await as(b, '+919900000009')).uid).toBe(guest!.uid);
    expect((await b.currentUser())?.isGuest).toBe(false);
  });

  test('seed data is idempotent and findable', async () => {
    await seedDemoData();
    await seedDemoData();
    await as(b, HOST, 'Nani');
    expect(DEMO_CONTACTS).toHaveLength(24);
    expect(await b.findUser('@Rahul')).toMatchObject({ uid: 'demo_rahul', name: 'Rahul Verma', username: 'rahul' });
    expect(await b.findUser('nobody')).toBeNull();
    const matches = await b.matchContacts(DEMO_CONTACTS);
    expect(matches).toHaveLength(8);
    expect(matches.find((m) => m.user.username === 'kamla')?.contactId).toBe('c4');
    // 10-digit and formatted numbers match too
    expect(await b.matchContacts([{ id: 'x', name: 'Rahul', phone: '98100 11014' }])).toHaveLength(1);
  });

  test('host creates, player joins, draw, dab, claim — and tickets stay private', async () => {
    const asha = await as(b, ASHA, 'Asha');
    const host = await as(b, HOST, 'Nani');

    expect(await b.createGame(input({ prizes: [{ id: 'full', label: 'Full House', rule: 'full', amt: 9999 }] })))
      .toEqual({ ok: false, error: 'Prizes add up to more than the pot' });
    const made = await b.createGame(input({ invited: [{ uid: asha.uid, name: 'Asha', username: null, color: asha.color }],
      contacts: [{ id: 'c0', name: 'Anita Desai', phone: '919810011001', sent: false }] }));
    if (!made.ok) throw new Error(made.error);
    const code = made.code;
    expect(code).toMatch(/^[A-Z0-9]{5}$/);

    let hostView = await game(b, code);
    expect(hostView.players.map((p) => p.uid)).toEqual([host.uid]);
    expect(hostView.me?.ticket.flat().filter(Boolean)).toHaveLength(15);
    expect(hostView.contacts).toHaveLength(1);
    expect(await b.listInvites()).toEqual([]);                        // the host isn't "invited"

    // ---- Asha: sees the invite, peeks, joins
    await as(b, ASHA);
    expect(await b.listInvites()).toEqual([expect.objectContaining({ id: code, name: 'Diwali night', hostName: 'Nani', seatsLeft: 3, fullHouseAmt: 100, status: 'lobby' })]);
    expect(await b.listGames()).toEqual([]);
    expect(await b.peekGame(code.toLowerCase())).toMatchObject({ id: code, price: 50 });
    expect((await b.act(code, { type: 'draw' })).ok).toBe(false);     // host only

    const seen: GameView[] = [];
    const off = b.subscribe(code, (g) => seen.push(g));
    expect(await b.act(code, { type: 'join' })).toEqual({ ok: true });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1].players).toHaveLength(2);

    const ashaView = await game(b, code);
    expect(ashaView.me?.ticket.flat().filter(Boolean)).toHaveLength(15);
    expect(ashaView.me?.ticket).not.toEqual(hostView.me?.ticket);
    expect(ashaView.contacts).toEqual([]);                            // host's phone contacts are stripped
    // nothing in what Asha's device receives carries anyone else's ticket or dabs
    expect(Object.keys(ashaView).filter((k) => /ticket|dab/i.test(k))).toEqual([]);
    expect(JSON.stringify({ ...ashaView, me: null })).not.toMatch(/"ticket"|"dabs"/);
    expect(await b.listInvites()).toEqual([]);
    expect((await b.listGames()).map((g) => g.id)).toEqual([code]);

    // ---- host starts and calls all 90
    await as(b, HOST);
    expect((await b.act(code, { type: 'start' })).ok).toBe(true);
    for (let i = 0; i < 90; i++) expect((await b.act(code, { type: 'draw' })).ok).toBe(true);
    expect(await b.act(code, { type: 'draw' })).toEqual({ ok: false, error: 'All 90 numbers called' });
    hostView = await game(b, code);
    expect(new Set(hostView.called).size).toBe(90);
    expect(seen[seen.length - 1].called).toHaveLength(90);            // subscribers follow along
    expect(seen[seen.length - 1].me).toEqual(hostView.me);            // ...as whoever is signed in on this device

    // ---- Asha dabs and claims
    await as(b, ASHA);
    const nums = ashaView.me!.ticket.flat().filter(Boolean);
    expect((await b.act(code, { type: 'claim', prizeId: 'early5' })).ok).toBe(true);   // nothing dabbed: bogey
    expect((await game(b, code)).feed.some((f) => f.kind === 'bogey')).toBe(true);
    expect((await game(b, code)).claims).toEqual({});
    const before = seen.length;
    for (const n of nums) expect(await b.act(code, { type: 'dab', n })).toEqual({ ok: true });
    expect(seen.length).toBe(before + nums.length);                   // dabs notify the same device
    expect((await game(b, code)).me?.dabs.sort()).toEqual([...nums].sort());
    expect((await b.act(code, { type: 'dab', n: 0 })).ok).toBe(false);

    expect(await b.act(code, { type: 'claim', prizeId: 'early5' })).toEqual({ ok: true });
    expect(await b.act(code, { type: 'claim', prizeId: 'full' })).toEqual({ ok: true });
    const done = await game(b, code);
    expect(done.claims.early5.uid).toBe(asha.uid);
    expect(done.claims.full.uid).toBe(asha.uid);
    expect(done.status).toBe('ended');
    off();

    // ---- the host's dabs were never touched by Asha's, and the late claim loses
    await as(b, HOST);
    hostView = await game(b, code);
    expect(hostView.me?.dabs).toEqual([]);
    expect((await b.act(code, { type: 'claim', prizeId: 'full' })).ok).toBe(false);
    expect((await b.listGames())[0]).toMatchObject({ id: code, status: 'ended' });
    expect(await b.getGame('ZZZZZ')).toBeNull();
    expect(await b.act('ZZZZZ', { type: 'join' })).toEqual({ ok: false, error: 'Game not found' });

    // ---- friends after playing
    const social = await b.getSocial();
    expect(social.friends).toEqual([{ uid: asha.uid, name: 'Asha', username: null, color: asha.color, together: 1 }]);
    await as(b, ASHA);
    expect((await b.getSocial()).friends).toEqual([expect.objectContaining({ uid: host.uid, together: 1 })]);
  });

  test('a full game turns joiners away', async () => {
    await as(b, HOST, 'Nani');
    const made = await b.createGame(input({ maxSeats: 2, price: 0, prizes: [] }));
    if (!made.ok) throw new Error(made.error);
    await as(b, ASHA, 'Asha');
    expect((await b.act(made.code, { type: 'join' })).ok).toBe(true);
    await as(b, '+919900000003', 'Bina');
    expect(await b.act(made.code, { type: 'join' })).toEqual({ ok: false, error: 'Sorry — this game is full' });
    expect((await b.peekGame(made.code))?.seatsLeft).toBe(0);
  });

  test('friends, groups and pending friends that resolve when they sign up', async () => {
    await as(b, HOST, 'Nani');
    const rahul = await b.findUser('rahul');
    await b.addFriend(rahul!.uid);
    await b.addFriend(rahul!.uid);
    await b.addFriend('nope');
    expect((await b.getSocial()).friends).toEqual([{ ...rahul!, together: 0 }]);

    const g1 = await b.saveGroup('Kitty party', [rahul!.uid]);
    const g2 = await b.saveGroup('Kitty party', [rahul!.uid, 'demo_kamla']);
    expect(g2.id).toBe(g1.id);
    await b.saveGroup('Family', ['demo_meera']);
    expect((await b.getSocial()).groups.map((g) => [g.name, g.uids.length])).toEqual([['Kitty party', 2], ['Family', 1]]);
    await b.deleteGroup(g1.id);
    expect((await b.getSocial()).groups.map((g) => g.name)).toEqual(['Family']);

    // Bhavna and Geeta aren't on the app yet
    const [bhavna, geeta] = [DEMO_CONTACTS[1], DEMO_CONTACTS[3]];
    expect(await b.matchContacts([bhavna, geeta])).toEqual([]);
    await b.addPendingFriends([bhavna, geeta]);
    await b.addPendingFriends([bhavna]);                              // no duplicates
    let pending = (await b.getSocial()).pending;
    expect(pending.map((p) => [p.name, p.phone, p.sent])).toEqual([['Bhavna Kapoor', '919810011002', false], ['Geeta Bua', '919810011004', false]]);
    await b.markPendingSent(pending[0].id);
    await b.removePending(pending[1].id);
    pending = (await b.getSocial()).pending;
    expect(pending).toEqual([expect.objectContaining({ name: 'Bhavna Kapoor', sent: true })]);
    const nani = (await b.currentUser())!;

    // Bhavna signs up with that number...
    const bh = await as(b, '+' + bhavna.phone, 'Bhavna');
    expect((await b.getSocial()).friends).toEqual([]);                // nothing on her side until Nani's app looks
    // ...and next time Nani opens Friends she is there, and no longer pending
    await as(b, HOST);
    const social = await b.getSocial();
    expect(social.pending).toEqual([]);
    expect(social.friends.map((f) => f.uid).sort()).toEqual([bh.uid, rahul!.uid].sort());
    await as(b, '+' + bhavna.phone);
    expect((await b.getSocial()).friends.map((f) => f.uid)).toEqual([nani.uid]);
  });

  test('signed-out callers get nothing private', async () => {
    await as(b, HOST, 'Nani');
    const made = await b.createGame(input());
    if (!made.ok) throw new Error(made.error);
    await b.signOut();
    expect(await b.peekGame(made.code)).toMatchObject({ id: made.code, hostName: 'Nani', seatsLeft: 3 });
    expect((await b.getGame(made.code))?.me).toBeNull();
    expect(await b.listGames()).toEqual([]);
    expect(await b.listInvites()).toEqual([]);
    expect((await b.act(made.code, { type: 'join' })).ok).toBe(false);
    expect((await b.createGame(input())).ok).toBe(false);
    expect(await b.getSocial()).toEqual({ friends: [], groups: [], pending: [] });
  });
});
