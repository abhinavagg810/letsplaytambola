// Demo mode: everything lives on this device and the game engine runs in-process.
// On web each tab can be a different person (session in sessionStorage, data in localStorage),
// which is how one laptop demos a host and several players.
import { Platform } from 'react-native';
import { AVATAR_COLORS, DELETED_NAME } from '@core/data.ts';
import { applyAction, createGameDoc, newCode, project, type Ctx } from '@core/engine.ts';
import type { Actor, GameDoc, GameView, InvitedUser, Tickets } from '@core/types.ts';
import { KV_PREFIX, kvGet, kvReady, kvRemove, kvSet } from './kv';
import { PHONE_TAKEN, USERNAME_RE, cleanHandle, phoneDigits, toE164 } from './phone';
import type {
  ActionResult, Backend, ContactMatch, DeviceContact, Friend, Group, PeekGame, PendingFriend, Social, User,
} from './types';

export const DEMO_OTP = '123456';

/** The prototype's sample address book — used on web, where there are no device contacts. */
export const DEMO_CONTACTS: DeviceContact[] = [
  'Anita Desai', 'Bhavna Kapoor', 'Deepa Nair', 'Geeta Bua', 'Kamla Sharma', 'Kavya Menon', 'Lata Aunty',
  'Meena Joshi', 'Meera Iyer', 'Neelam Chachi', 'Padma Rao', 'Pooja Bhabhi', 'Radha Mausi', 'Rahul Verma',
  'Rekha Gupta', 'Ritu Singh', 'Sapna Arora', 'Seema Didi', 'Shalini Mehta', 'Sudha Kulkarni',
  'Sunita Agarwal', 'Usha Pillai', 'Vandana Jain', 'Vikram Rao',
].map((name, i) => ({ id: 'c' + i, name, phone: String(919810011001 + i) }));

/** Contacts that already "have the app" in demo mode, so search and contact matching find someone. */
const SEED_USERNAMES: Record<string, string> = {
  'Rahul Verma': 'rahul', 'Kamla Sharma': 'kamla', 'Meera Iyer': 'meera', 'Vikram Rao': 'vikram',
  'Sunita Agarwal': 'sunita', 'Rekha Gupta': 'rekha', 'Anita Desai': 'anita', 'Deepa Nair': 'deepa',
};

const K = {
  accounts: 'accounts',
  index: 'index',
  session: 'session',
  friends: (uid: string) => `friends:${uid}`,
  groups: (uid: string) => `groups:${uid}`,
  pending: (uid: string) => `pending:${uid}`,
  game: (code: string) => `game:${code}`,
  tickets: (code: string) => `tickets:${code}`,
};

const accounts = (): User[] => kvGet<User[]>(K.accounts, []);
const newId = (p: string): string => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const samePhone = (a: User, digits: string): boolean => !!a.phone && phoneDigits(a.phone) === digits;
const asInvited = (a: User): InvitedUser => ({ uid: a.uid, name: a.name, username: a.username, color: a.color });
const asActor = (a: User): Actor => ({ uid: a.uid, name: a.name, username: a.username, color: a.color });
const ctx = (): Ctx => ({ now: Date.now(), rng: Math.random });

function addAccount(a: Omit<User, 'color'>): User {
  const all = accounts();
  const user: User = { ...a, color: AVATAR_COLORS[all.length % AVATAR_COLORS.length] };
  kvSet(K.accounts, [...all, user]);
  return user;
}

function addFriendId(owner: string, friend: string): void {
  const ids = kvGet<string[]>(K.friends(owner), []);
  if (owner !== friend && !ids.includes(friend)) kvSet(K.friends(owner), [...ids, friend]);
}

/** Idempotently creates the demo accounts. */
export async function seedDemoData(): Promise<void> {
  await kvReady();
  for (const c of DEMO_CONTACTS) {
    const username = SEED_USERNAMES[c.name];
    if (!username || accounts().some((a) => samePhone(a, c.phone) || a.username === username)) continue;
    addAccount({ uid: 'demo_' + username, name: c.name, username, email: null, phone: toE164(c.phone), isGuest: false });
  }
}

export function peekOf(doc: GameDoc): PeekGame {
  const full = doc.prizes.find((p) => p.rule === 'full');
  return {
    id: doc.id, name: doc.name, hostName: doc.hostName, hostColor: doc.hostColor, status: doc.status,
    price: doc.price, seatsLeft: Math.max(0, doc.maxSeats - doc.players.length), fullHouseAmt: full ? full.amt : null,
  };
}

/**
 * What is left of a game once `uid` has deleted their account. `null` = remove the game altogether.
 * Mirrors delete_my_account() in supabase/migrations/0002_delete_account.sql — keep the two in step.
 *  - a game they host: removed, unless it is a finished game that other people played (their history)
 *  - a lobby they only sat in (never played a round): their seat is freed
 *  - anything they played: their name becomes "Deleted player", their username goes
 */
export function scrubGame(doc0: GameDoc, uid: string): GameDoc | null {
  const doc = JSON.parse(JSON.stringify(doc0)) as GameDoc;
  const hosts = doc.hostUid === uid;
  const others = doc.players.some((p) => p.uid !== uid);
  if (hosts && (doc.status !== 'ended' || !others)) return null;

  const names = new Set<string>();
  const note = (n?: string): void => { if (n && n !== DELETED_NAME) names.add(n); };
  const fixClaims = (claims: GameDoc['claims']): void => {
    for (const c of Object.values(claims || {})) if (c.uid === uid) { note(c.name); c.name = DELETED_NAME; }
  };
  let changed = false;
  const played = (doc.history || []).some((h) => h.uids.includes(uid));

  if (hosts) {
    doc.hostName = DELETED_NAME;
    doc.hostUsername = null;
    doc.contacts = [];           // the host's own address-book picks go with the host
    doc.feed = (doc.feed || []).map((f) => (f.kind === 'start' ? { ...f, text: `${DELETED_NAME} started the game` } : f));
    changed = true;
  }
  if (doc.invited.some((u) => u.uid === uid)) {
    doc.invited = doc.invited.filter((u) => u.uid !== uid);
    changed = true;
  }
  if (doc.players.some((p) => p.uid === uid)) {
    changed = true;
    if (doc.status === 'lobby' && !played && !hosts) {
      doc.players = doc.players.filter((p) => p.uid !== uid);
    } else {
      for (const p of doc.players) if (p.uid === uid) { note(p.name); p.name = DELETED_NAME; p.username = null; }
    }
  }
  if (played || Object.values(doc.claims || {}).some((c) => c.uid === uid)) changed = true;
  fixClaims(doc.claims);
  for (const h of doc.history || []) fixClaims(h.claims);
  for (const f of doc.feed || []) if (f.uid === uid) { note(f.name); changed = true; }
  // The live feed spells names out in its text ("Full House for Asha").
  doc.feed = (doc.feed || []).map((f) => {
    if (f.uid !== uid) return f;
    let text = f.text;
    for (const n of names) text = text?.split(n).join(DELETED_NAME);
    return { ...f, ...(f.name ? { name: DELETED_NAME } : null), ...(text !== undefined ? { text } : null) };
  });
  if (!changed) return doc0;
  doc.version = (doc.version || 0) + 1;
  return doc;
}

export function createLocalBackend(): Backend {
  const isWeb = Platform.OS === 'web';
  const ss: Storage | null = isWeb && typeof sessionStorage !== 'undefined' ? sessionStorage : null;
  const authSubs = new Set<(u: User | null) => void>();
  const gameSubs = new Map<string, Set<(g: GameView) => void>>();
  const ready = seedDemoData();

  // ---- session
  const sessionUid = (): string | null => (ss ? ss.getItem(KV_PREFIX + K.session) : kvGet<string | null>(K.session, null));
  const me = (): User | null => {
    const uid = sessionUid();
    return (uid && accounts().find((a) => a.uid === uid)) || null;
  };
  const setSession = (user: User | null): void => {
    if (ss) user ? ss.setItem(KV_PREFIX + K.session, user.uid) : ss.removeItem(KV_PREFIX + K.session);
    else user ? kvSet(K.session, user.uid) : kvRemove(K.session);
    authSubs.forEach((cb) => cb(user));
  };
  const saveAccount = (user: User): void => {
    kvSet(K.accounts, accounts().map((a) => (a.uid === user.uid ? user : a)));
    authSubs.forEach((cb) => cb(user));
  };

  /** Signed in without a number (guest, Google/Apple) and trying to add one that is already another account. */
  const takenByOther = (digits: string): boolean => {
    const cur = me();
    return !!cur && !cur.phone && accounts().some((a) => a.uid !== cur.uid && samePhone(a, digits));
  };

  // ---- games
  const readDoc = (code: string): GameDoc | null => kvGet<GameDoc | null>(K.game(code), null);
  const readTickets = (code: string): Tickets => kvGet<Tickets>(K.tickets(code), {});
  const allDocs = (): GameDoc[] =>
    kvGet<string[]>(K.index, []).map(readDoc).filter((d): d is GameDoc => !!d).sort((a, b) => b.createdAt - a.createdAt);
  const viewOf = (code: string): GameView | null => {
    const doc = readDoc(code);
    return doc ? project(doc, readTickets(code), sessionUid()) : null;
  };
  const isMember = (doc: GameDoc, uid: string): boolean => doc.hostUid === uid || doc.players.some((p) => p.uid === uid);
  const norm = (code: string): string => (code || '').trim().toUpperCase();

  const notify = (code: string): void => {
    const subs = gameSubs.get(code);
    if (!subs || !subs.size) return;
    const view = viewOf(code);
    if (view) [...subs].forEach((cb) => cb(view));
  };

  // ---- cross-tab realtime (web only)
  const channel = isWeb && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tambola') : null;
  if (channel) channel.onmessage = (e: MessageEvent<{ code?: string }>) => { if (e.data?.code) notify(e.data.code); };
  if (isWeb && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const gamePrefix = KV_PREFIX + K.game('');
    window.addEventListener('storage', (e) => { if (e.key?.startsWith(gamePrefix)) notify(e.key.slice(gamePrefix.length)); });
  }
  const changed = (code: string): void => {
    notify(code);
    channel?.postMessage({ code });
  };

  // Two tabs acting in the same instant would both read the old game and the second write would undo the first
  // (two players racing for a prize would both be told they won). Where the browser has Web Locks, actions on
  // one game run strictly one after another across tabs. Native and tests have a single writer already.
  const locks: LockManager | null = isWeb && typeof navigator !== 'undefined' && navigator.locks ? navigator.locks : null;
  const exclusive = <T,>(code: string, fn: () => T): Promise<T> =>
    locks ? (locks.request(KV_PREFIX + K.game(code), fn) as Promise<T>) : Promise.resolve(fn());

  const signedOut: ActionResult = { ok: false, error: 'Please sign in first' };
  const liveOnly = (provider: string): ActionResult =>
    ({ ok: false, error: `${provider} sign-in needs the live backend — use your phone number in demo mode` });

  return {
    mode: 'local',

    // ---- auth
    async currentUser() { await ready; return me(); },
    onAuthChange(cb) { authSubs.add(cb); return () => { authSubs.delete(cb); }; },
    async sendOtp(phone) {
      await ready;
      if (phoneDigits(phone).length < 10) return { ok: false, error: 'Enter your mobile number with country code' };
      return takenByOther(phoneDigits(phone)) ? { ok: false, error: PHONE_TAKEN } : { ok: true };
    },
    async verifyOtp(phone, code, name) {
      await ready;
      if (code.trim() !== DEMO_OTP) return { ok: false, error: `That code isn’t right — try ${DEMO_OTP} in demo mode` };
      const digits = phoneDigits(phone);
      // Never switch someone who is adding a number into a different account: they would lose sight of this one.
      if (takenByOther(digits)) return { ok: false, error: PHONE_TAKEN };
      const cur = me();
      let user = accounts().find((a) => samePhone(a, digits));
      if (!user && cur && !cur.phone) {
        // A guest saving their account — or someone adding a number after Google/Apple sign-in — keeps their uid,
        // and with it their games and friends.
        user = { ...cur, phone: toE164(digits), isGuest: false, name: cur.name || (name ?? '').trim() };
        kvSet(K.accounts, accounts().map((a) => (a.uid === user!.uid ? user! : a)));
      }
      user ??= addAccount({ uid: newId('u_'), name: (name ?? '').trim(), username: null, email: null, phone: toE164(digits), isGuest: false });
      setSession(user);
      return { ok: true };
    },
    async signInWithGoogle() { return liveOnly('Google'); },
    async signInWithApple() { return liveOnly('Apple'); },
    async signInGuest(name) {
      await ready;
      if (!name.trim()) return { ok: false, error: 'Tell us your name first' };
      setSession(addAccount({ uid: newId('g_'), name: name.trim(), username: null, email: null, phone: null, isGuest: true }));
      return { ok: true };
    },
    async signOut() { setSession(null); },
    async deleteAccount() {
      await ready;
      const user = me();
      if (!user) return signedOut;
      const uid = user.uid;
      for (const code of kvGet<string[]>(K.index, [])) {
        await exclusive(code, () => {
          const doc = readDoc(code);
          if (!doc) return;
          const next = scrubGame(doc, uid);
          const tickets = readTickets(code);
          if (!next) {
            kvRemove(K.game(code));
            kvRemove(K.tickets(code));
            kvSet(K.index, kvGet<string[]>(K.index, []).filter((c) => c !== code));
          } else {
            if (next !== doc) kvSet(K.game(code), next);
            if (uid in tickets) { delete tickets[uid]; kvSet(K.tickets(code), tickets); }
            if (next !== doc) changed(code);
          }
        });
      }
      kvRemove(K.friends(uid));
      kvRemove(K.groups(uid));
      kvRemove(K.pending(uid));
      for (const a of accounts()) {
        if (a.uid === uid) continue;
        const friends = kvGet<string[]>(K.friends(a.uid), []);
        if (friends.includes(uid)) kvSet(K.friends(a.uid), friends.filter((f) => f !== uid));
        const groups = kvGet<Group[]>(K.groups(a.uid), []);
        if (groups.some((g) => g.uids.includes(uid))) kvSet(K.groups(a.uid), groups.map((g) => ({ ...g, uids: g.uids.filter((u) => u !== uid) })));
      }
      kvSet(K.accounts, accounts().filter((a) => a.uid !== uid));
      setSession(null);
      return { ok: true };
    },
    async usernameAvailable(handle) {
      await ready;
      const h = cleanHandle(handle);
      const uid = sessionUid();
      return USERNAME_RE.test(h) && !accounts().some((a) => a.username === h && a.uid !== uid);
    },
    async updateProfile(patch) {
      await ready;
      const user = me();
      if (!user) return signedOut;
      const next = { ...user };
      if (patch.name !== undefined) {
        if (!patch.name.trim()) return { ok: false, error: 'Name can’t be empty' };
        next.name = patch.name.trim();
      }
      if (patch.username !== undefined) {
        const h = cleanHandle(patch.username);
        if (!USERNAME_RE.test(h)) return { ok: false, error: '3–15 letters, numbers or _' };
        if (accounts().some((a) => a.username === h && a.uid !== user.uid)) return { ok: false, error: `@${h} is taken` };
        next.username = h;
      }
      saveAccount(next);
      return { ok: true };
    },

    // ---- social
    async getSocial(): Promise<Social> {
      await ready;
      const user = me();
      if (!user) return { friends: [], groups: [], pending: [] };
      const accts = accounts();
      // Invited contacts who have since signed up become friends (both ways).
      const pending = kvGet<PendingFriend[]>(K.pending(user.uid), []).filter((p) => {
        const a = accts.find((x) => x.uid !== user.uid && samePhone(x, phoneDigits(p.phone)));
        if (a) { addFriendId(user.uid, a.uid); addFriendId(a.uid, user.uid); }
        return !a;
      });
      kvSet(K.pending(user.uid), pending);
      // Friends = people I added ∪ everyone I've shared a game with.
      const together = new Map<string, number>();
      for (const doc of allDocs()) {
        if (!isMember(doc, user.uid)) continue;
        for (const uid of new Set([doc.hostUid, ...doc.players.map((p) => p.uid)])) {
          if (uid !== user.uid) together.set(uid, (together.get(uid) ?? 0) + 1);
        }
      }
      for (const uid of kvGet<string[]>(K.friends(user.uid), [])) if (!together.has(uid)) together.set(uid, 0);
      const friends: Friend[] = [];
      for (const [uid, n] of together) {
        const a = accts.find((x) => x.uid === uid);
        if (a) friends.push({ ...asInvited(a), together: n });
      }
      return { friends, groups: kvGet<Group[]>(K.groups(user.uid), []), pending };
    },
    async findUser(handle) {
      await ready;
      const h = cleanHandle(handle);
      const a = h ? accounts().find((x) => x.username === h) : undefined;
      return a ? asInvited(a) : null;
    },
    async addFriend(uid) {
      await ready;
      const user = me();
      if (user && accounts().some((a) => a.uid === uid)) addFriendId(user.uid, uid);
    },
    async saveGroup(name, uids) {
      await ready;
      const user = me();
      if (!user) throw new Error('Please sign in first');
      const clean = name.trim();
      const groups = kvGet<Group[]>(K.groups(user.uid), []);
      const old = groups.find((g) => g.name.toLowerCase() === clean.toLowerCase());
      const group: Group = { id: old?.id ?? newId('gr_'), name: clean, uids: [...new Set(uids)] };
      kvSet(K.groups(user.uid), [...groups.filter((g) => g !== old), group]);
      return group;
    },
    async deleteGroup(id) {
      await ready;
      const user = me();
      if (user) kvSet(K.groups(user.uid), kvGet<Group[]>(K.groups(user.uid), []).filter((g) => g.id !== id));
    },
    async matchContacts(contacts) {
      await ready;
      const uid = sessionUid();
      const accts = accounts();
      const out: ContactMatch[] = [];
      for (const c of contacts) {
        const a = accts.find((x) => x.uid !== uid && samePhone(x, phoneDigits(c.phone)));
        if (a) out.push({ contactId: c.id, user: asInvited(a) });
      }
      return out;
    },
    async addPendingFriends(contacts) {
      await ready;
      const user = me();
      if (!user) return;
      const pending = kvGet<PendingFriend[]>(K.pending(user.uid), []);
      for (const c of contacts) {
        const phone = phoneDigits(c.phone);
        if (phone && !pending.some((p) => p.phone === phone)) pending.push({ id: newId('p_'), name: c.name, phone, sent: false });
      }
      kvSet(K.pending(user.uid), pending);
    },
    async markPendingSent(id) {
      await ready;
      const uid = sessionUid();
      if (uid) kvSet(K.pending(uid), kvGet<PendingFriend[]>(K.pending(uid), []).map((p) => (p.id === id ? { ...p, sent: true } : p)));
    },
    async removePending(id) {
      await ready;
      const uid = sessionUid();
      if (uid) kvSet(K.pending(uid), kvGet<PendingFriend[]>(K.pending(uid), []).filter((p) => p.id !== id));
    },

    // ---- games
    async listGames() {
      await ready;
      const uid = sessionUid();
      if (!uid) return [];
      return allDocs().filter((d) => isMember(d, uid)).map((d) => project(d, readTickets(d.id), uid));
    },
    async listInvites() {
      await ready;
      const uid = sessionUid();
      if (!uid) return [];
      return allDocs()
        .filter((d) => d.invited.some((u) => u.uid === uid) && !isMember(d, uid) && d.status !== 'ended' && d.players.length < d.maxSeats)
        .map(peekOf);
    },
    async peekGame(code) {
      await ready;
      const doc = readDoc(norm(code));
      return doc ? peekOf(doc) : null;
    },
    async createGame(input) {
      await ready;
      const user = me();
      if (!user) return signedOut;
      let code = newCode(Math.random);
      while (readDoc(code)) code = newCode(Math.random);
      const { doc, tickets, error } = createGameDoc(input, asActor(user), code, ctx());
      if (error) return { ok: false, error };
      kvSet(K.game(code), doc);
      kvSet(K.tickets(code), tickets);
      kvSet(K.index, [code, ...kvGet<string[]>(K.index, [])]);
      return { ok: true, code };
    },
    async getGame(code) {
      await ready;
      return viewOf(norm(code));
    },
    async act(code, action) {
      await ready;
      const user = me();
      if (!user) return signedOut;
      const id = norm(code);
      return exclusive(id, (): ActionResult => {
        const doc = readDoc(id);
        if (!doc) return { ok: false, error: 'Game not found' };
        const r = applyAction(doc, readTickets(id), action, asActor(user), ctx());
        if (r.docChanged) kvSet(K.game(id), r.doc);
        if (r.touched.length) kvSet(K.tickets(id), r.tickets);
        if (r.docChanged || r.touched.length) changed(id);
        return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'Something went wrong' };
      });
    },
    subscribe(code, cb) {
      const id = norm(code);
      const subs = gameSubs.get(id) ?? new Set();
      gameSubs.set(id, subs);
      subs.add(cb);
      // Deliver the current state once, so a subscriber never misses a change made while it was mounting.
      void ready.then(() => { const view = viewOf(id); if (view && subs.has(cb)) cb(view); });
      return () => { subs.delete(cb); };
    },
  };
}
