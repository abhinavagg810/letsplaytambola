/// <reference types="jest" />
import type { CreateGameInput, GameDoc, GameView, Tickets } from '@core/types.ts';
import { kvClear, kvGet } from '../kv';
import { createLocalBackend, scrubGame } from '../local';
import type { Backend, User } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const NANI = '+919900000021';
const ASHA = '+919900000022';
const BINA = '+919900000023';
const GONE = 'Deleted player';
const input = (over: Partial<CreateGameInput> = {}): CreateGameInput => ({
  name: 'Diwali night', maxSeats: 4, price: 50, hostPlays: true,
  prizes: [{ id: 'early5', label: 'Early Five', rule: 'early5', amt: 50 }, { id: 'full', label: 'Full House', rule: 'full', amt: 100 }],
  invited: [], contacts: [], ...over,
});

let b: Backend;
beforeEach(() => { kvClear(); b = createLocalBackend(); });

async function as(phone: string, name?: string): Promise<User> {
  expect(await b.verifyOtp(phone, '123456', name)).toEqual({ ok: true });
  return (await b.currentUser())!;
}
async function host(over: Partial<CreateGameInput> = {}): Promise<string> {
  const r = await b.createGame(input(over));
  if (!r.ok) throw new Error(r.error);
  return r.code;
}
const view = async (code: string): Promise<GameView> => (await b.getGame(code))!;
const ok = async (code: string, action: Parameters<Backend['act']>[1]) => expect(await b.act(code, action)).toEqual({ ok: true });
/** Asha joins Nani's game, the host calls all 90, Asha wins Early Five, the host ends the round. */
async function playRound(code: string) {
  await as(ASHA);
  await ok(code, { type: 'join' });
  await as(NANI);
  await ok(code, { type: 'start' });
  for (let i = 0; i < 90; i++) await ok(code, { type: 'draw' });
  await as(ASHA);
  for (const n of (await view(code)).me!.ticket.flat().filter(Boolean)) await ok(code, { type: 'dab', n });
  await ok(code, { type: 'claim', prizeId: 'early5' });
  await as(NANI);
  await ok(code, { type: 'end' });
}

test('signed out: nothing to delete', async () => {
  expect(await b.deleteAccount()).toEqual({ ok: false, error: 'Please sign in first' });
});

test('deleting removes the account, its session, friends, groups and pending — and nobody else’s', async () => {
  const asha = await as(ASHA, 'Asha');
  const bina = await as(BINA, 'Bina');
  await b.addFriend(asha.uid);
  await b.saveGroup('Kitty', [asha.uid]);
  const nani = await as(NANI, 'Nani');
  await b.updateProfile({ username: 'nani' });
  await b.addFriend(asha.uid);
  await b.saveGroup('Family', [asha.uid, bina.uid]);
  await b.addPendingFriends([{ id: 'x', name: 'Old friend', phone: '9810099999' }]);
  await as(ASHA);
  await b.addFriend(nani.uid);
  await b.saveGroup('Cousins', [nani.uid, bina.uid]);

  await as(NANI);
  const seen: (string | null)[] = [];
  b.onAuthChange((u) => seen.push(u ? u.uid : null));
  expect(await b.deleteAccount()).toEqual({ ok: true });

  expect(seen).toEqual([null]);                                        // the app is told: signed out
  expect(await b.currentUser()).toBeNull();
  expect(kvGet<User[]>('accounts', []).some((a) => a.uid === nani.uid)).toBe(false);
  for (const k of ['friends', 'groups', 'pending']) expect(kvGet<unknown>(`${k}:${nani.uid}`, null)).toBeNull();
  expect(await b.findUser('nani')).toBeNull();
  expect(await b.usernameAvailable('nani')).toBe(true);
  expect(await b.matchContacts([{ id: 'n', name: 'Nani', phone: NANI }])).toEqual([]);

  // Asha: Nani is gone from her friends and from her group; the group itself and Bina stay
  await as(ASHA);
  const social = await b.getSocial();
  expect(social.friends.map((f) => f.uid)).toEqual([]);
  expect(social.groups).toEqual([expect.objectContaining({ name: 'Cousins', uids: [bina.uid] })]);
  // Bina: untouched
  await as(BINA);
  expect((await b.getSocial()).friends.map((f) => f.uid)).toEqual([asha.uid]);
  expect((await b.getSocial()).groups).toEqual([expect.objectContaining({ name: 'Kitty', uids: [asha.uid] })]);
  expect(await b.currentUser()).toEqual(bina);

  // the number is free again: signing in with it makes a brand-new, empty account
  const again = await as(NANI);
  expect(again.uid).not.toBe(nani.uid);
  expect(again).toMatchObject({ name: '', username: null });
  expect(await b.getSocial()).toEqual({ friends: [], groups: [], pending: [] });
  expect(await b.listGames()).toEqual([]);
});

test('a guest can delete their account too', async () => {
  await b.signInGuest('Chintu');
  const guest = (await b.currentUser())!;
  expect(await b.deleteAccount()).toEqual({ ok: true });
  expect(await b.currentUser()).toBeNull();
  expect(kvGet<User[]>('accounts', []).some((a) => a.uid === guest.uid)).toBe(false);
});

test('games the deleted user hosts are removed unless they are finished games others played', async () => {
  await as(ASHA, 'Asha');
  await as(NANI, 'Nani');
  const lobby = await host({ name: 'Lobby' });
  const live = await host({ name: 'Live' });
  const solo = await host({ name: 'Solo' });
  const done = await host({ name: 'Done', contacts: [{ id: 'c0', name: 'Anita Desai', phone: '919810011001', sent: false }] });
  await as(ASHA);
  await ok(lobby, { type: 'join' });
  await ok(live, { type: 'join' });
  await as(NANI);
  await ok(live, { type: 'start' });
  await ok(solo, { type: 'start' });
  await ok(solo, { type: 'end' });
  await playRound(done);
  const nani = (await b.currentUser())!;

  expect(await b.deleteAccount()).toEqual({ ok: true });

  const asha = await as(ASHA);
  for (const code of [lobby, live, solo]) {
    expect(await b.getGame(code)).toBeNull();
    expect(await b.peekGame(code)).toBeNull();
    expect(kvGet<Tickets | null>(`tickets:${code}`, null)).toBeNull();
  }
  expect(kvGet<string[]>('index', [])).toEqual([done]);
  expect((await b.listGames()).map((g) => g.id)).toEqual([done]);

  // the finished game is Asha's history too: it stays, with the host anonymised
  const g = await view(done);
  expect(g).toMatchObject({ status: 'ended', hostUid: nani.uid, hostName: GONE, hostUsername: null });
  expect(g.players.map((p) => [p.uid, p.name])).toEqual([[nani.uid, GONE], [asha.uid, 'Asha']]);
  expect(g.claims.early5).toMatchObject({ uid: asha.uid, name: 'Asha' });
  expect(g.me?.ticket.flat().filter(Boolean)).toHaveLength(15);         // Asha's own ticket is untouched
  expect(kvGet<Tickets>(`tickets:${done}`, {})).not.toHaveProperty(nani.uid);
  expect(kvGet<GameDoc | null>(`game:${done}`, null)?.contacts).toEqual([]);   // the host's address-book picks are gone
  expect(JSON.stringify(kvGet<GameDoc | null>(`game:${done}`, null))).not.toMatch(/Nani/);
  expect((await b.getSocial()).friends).toEqual([]);                    // a deleted co-player is not a friend any more
});

test('in other people’s games the history stays, the name becomes “Deleted player” and the ticket is dropped', async () => {
  const bina = await as(BINA, 'Bina');
  await as(ASHA, 'Asha');
  await b.updateProfile({ username: 'asha' });
  const asha = (await b.currentUser())!;
  const nani = await as(NANI, 'Nani');
  const invitee = { uid: asha.uid, name: 'Asha', username: 'asha', color: asha.color };
  const played = await host({ name: 'Played' });
  const seat = await host({ name: 'Seat only' });
  const invited = await host({ name: 'Invited', invited: [invitee, { uid: bina.uid, name: 'Bina', username: null, color: bina.color }] });
  const untouched = await host({ name: 'Not hers' });
  await playRound(played);
  await ok(played, { type: 'nextRound' });                              // round 1 is now history; a fresh ticket is dealt
  await as(ASHA);
  await ok(seat, { type: 'join' });
  const before = kvGet<GameDoc | null>(`game:${untouched}`, null);

  await as(NANI);
  const seen: GameView[] = [];
  const off = b.subscribe(played, (g) => seen.push(g));
  await as(ASHA);
  expect(await b.deleteAccount()).toEqual({ ok: true });
  off();

  await as(NANI);
  const g = await view(played);
  expect(seen[seen.length - 1].players.map((p) => p.name)).toEqual(['Nani', GONE]);   // the host's open screen updates
  expect(g.players).toEqual([expect.objectContaining({ uid: nani.uid, name: 'Nani' }), expect.objectContaining({ uid: asha.uid, name: GONE, username: null })]);
  expect(g.history).toHaveLength(1);
  expect(g.history[0].uids).toEqual([nani.uid, asha.uid]);
  expect(g.history[0].claims.early5).toMatchObject({ uid: asha.uid, name: GONE });   // the win still counts, under the placeholder
  expect(g.history[0].prizes.map((p) => p.amt)).toEqual([50, 100]);
  expect(JSON.stringify(g)).not.toMatch(/Asha|"asha"/);
  expect(Object.keys(kvGet<Tickets>(`tickets:${played}`, {}))).toEqual([nani.uid]);
  expect(g.me?.ticket.flat().filter(Boolean)).toHaveLength(15);

  // a lobby she had only taken a seat in: the seat is free again
  expect((await view(seat)).players.map((p) => p.uid)).toEqual([nani.uid]);
  expect(Object.keys(kvGet<Tickets>(`tickets:${seat}`, {}))).toEqual([nani.uid]);
  // an invite list: she is dropped, the other invitee stays
  expect((await view(invited)).invited.map((u) => u.uid)).toEqual([bina.uid]);
  // a game she had nothing to do with is byte-for-byte the same
  expect(kvGet<GameDoc | null>(`game:${untouched}`, null)).toEqual(before);

  // the game carries on with the placeholder in its seat
  await ok(played, { type: 'start' });
  await ok(played, { type: 'draw' });
  await ok(played, { type: 'restart', fresh: true });
  expect((await view(played)).players.map((p) => p.name)).toEqual(['Nani', GONE]);
});

test('scrubGame: the live feed loses the name as well', () => {
  const doc = {
    id: 'AB2CD', name: 'x', hostUid: 'h', hostName: 'Nani', hostColor: '#fff', hostUsername: null, status: 'live', round: 1, maxSeats: 4, price: 0,
    prizes: [], called: [], claims: { top: { uid: 'a', name: 'Asha Rao', at: 1 } }, invited: [], contacts: [], auto: 0, seq: 4, history: [],
    players: [{ uid: 'a', name: 'Asha Rao', color: '#000', username: 'asha', joinedAt: 1 }, { uid: 'z', name: 'Asha', color: '#000', username: null, joinedAt: 2 }],
    feed: [
      { seq: 1, at: 1, kind: 'join', uid: 'a', name: 'Asha Rao', text: 'Asha Rao grabbed a ticket' },
      { seq: 2, at: 2, kind: 'join', uid: 'z', name: 'Asha', text: 'Asha grabbed a ticket' },
      { seq: 3, at: 3, kind: 'bogey', uid: 'a', text: 'Bogey! Asha Rao’s Top line didn’t check out' },
      { seq: 4, at: 4, kind: 'win', uid: 'a', name: 'Asha Rao', label: 'Top line', amount: 0, text: 'Top line for Asha Rao' },
    ],
    createdAt: 1, endedAt: null, version: 7,
  } as GameDoc;
  const copy = JSON.stringify(doc);
  const out = scrubGame(doc, 'a')!;
  expect(JSON.stringify(doc)).toBe(copy);                               // input not mutated
  expect(out.feed.map((f) => f.text)).toEqual([
    `${GONE} grabbed a ticket`, 'Asha grabbed a ticket', `Bogey! ${GONE}’s Top line didn’t check out`, `Top line for ${GONE}`,
  ]);
  expect(out.feed.map((f) => f.name)).toEqual([GONE, 'Asha', undefined, GONE]);
  expect(out.players[1]).toEqual(doc.players[1]);                       // a namesake is left alone
  expect(out.claims.top.name).toBe(GONE);
  expect(out.version).toBe(8);
  expect(scrubGame(doc, 'nobody')).toBe(doc);                           // not in the game: returned as is
  expect(scrubGame(doc, 'h')).toBeNull();                               // the host of an unfinished game: the game goes
});
