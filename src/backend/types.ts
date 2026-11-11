import type { ContactInvite, CreateGameInput, GameAction, GameView, InvitedUser } from '@core/types';

export interface User {
  uid: string; name: string; username: string | null; email: string | null;
  phone: string | null; color: string; isGuest: boolean;
}
export interface Friend { uid: string; name: string; username: string | null; color: string; together: number }
export interface Group { id: string; name: string; uids: string[] }
export interface PendingFriend { id: string; name: string; phone: string; sent: boolean }
export interface Social { friends: Friend[]; groups: Group[]; pending: PendingFriend[] }
export interface DeviceContact { id: string; name: string; phone: string }      // phone = digits with country code
export interface ContactMatch { contactId: string; user: InvitedUser }
export interface PeekGame {
  id: string; name: string; hostName: string; hostColor: string; status: 'lobby' | 'live' | 'ended';
  price: number; seatsLeft: number; fullHouseAmt: number | null;
}
export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * The single seam between UI and data. Two implementations:
 *  - local  (src/backend/local.ts): demo mode, on-device storage, runs the game-core engine in-process
 *  - supabase (src/backend/supabase.ts): production
 * Chosen in src/backend/index.ts by whether EXPO_PUBLIC_SUPABASE_URL is set.
 */
export interface Backend {
  mode: 'local' | 'supabase';
  // ---- auth
  currentUser(): Promise<User | null>;
  onAuthChange(cb: (u: User | null) => void): () => void;
  sendOtp(phone: string): Promise<ActionResult>;                 // E.164, e.g. +919810011001
  verifyOtp(phone: string, code: string, name?: string): Promise<ActionResult>;
  signInWithGoogle(): Promise<ActionResult>;
  signInWithApple(): Promise<ActionResult>;
  signInGuest(name: string): Promise<ActionResult>;
  signOut(): Promise<void>;
  usernameAvailable(handle: string): Promise<boolean>;
  updateProfile(patch: { name?: string; username?: string }): Promise<ActionResult>;
  // ---- social
  getSocial(): Promise<Social>;
  findUser(handle: string): Promise<InvitedUser | null>;
  addFriend(uid: string): Promise<void>;
  saveGroup(name: string, uids: string[]): Promise<Group>;      // replaces a group with the same name
  deleteGroup(id: string): Promise<void>;
  matchContacts(contacts: DeviceContact[]): Promise<ContactMatch[]>;   // hashed matching
  addPendingFriends(contacts: DeviceContact[]): Promise<void>;
  markPendingSent(id: string): Promise<void>;
  removePending(id: string): Promise<void>;
  // ---- games
  listGames(): Promise<GameView[]>;         // games I host or joined, newest first (me = my ticket)
  listInvites(): Promise<PeekGame[]>;       // open games I'm invited to but haven't joined
  peekGame(code: string): Promise<PeekGame | null>;   // works signed-out (invite landing)
  createGame(input: CreateGameInput): Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  getGame(code: string): Promise<GameView | null>;
  act(code: string, action: GameAction): Promise<ActionResult>;
  /** Calls cb with a fresh view whenever the game changes. Returns unsubscribe. */
  subscribe(code: string, cb: (g: GameView) => void): () => void;
}
export type { ContactInvite, InvitedUser };
