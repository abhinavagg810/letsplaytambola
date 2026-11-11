// Production backend. Reads go straight to Postgres (row-level security decides what comes back);
// every game mutation goes through the `game` Edge Function, which runs the shared engine.
// A player's device only ever receives the public game doc plus their OWN tickets row.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type User as AuthUser } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { AVATAR_COLORS } from '@core/data.ts';
import type { ContactInvite, GameDoc, GameView, InvitedUser, Ticket } from '@core/types.ts';
import { USERNAME_RE, cleanHandle, phoneDigits, toE164 } from './phone';
import type { ActionResult, Backend, ContactMatch, Friend, Group, PeekGame, PendingFriend, User } from './types';

// Row shapes of the few tables/RPCs read here (see supabase/migrations/0001_init.sql).
interface ProfileRow { name: string; username: string | null; email: string | null; color: string; is_guest: boolean }
interface PersonRow { id: string; name: string; username: string | null; color: string }
interface GameRow { code: string; doc: GameDoc }
interface TicketRow { code: string; ticket: Ticket; dabs: number[] }
interface ContactsRow { code: string; contacts: ContactInvite[] }
interface GroupRow { id: string; name: string; member_ids: string[] }
interface PendingRow { id: string; contact_name: string; phone: string; sent_at: string | null }
interface FnResult { ok?: boolean; error?: string; code?: string }

const OFFLINE = 'Couldn’t reach the game server — check your connection';
const SIGNED_OUT: ActionResult = { ok: false, error: 'Please sign in first' };
const sha256 = (s: string): Promise<string> => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, s);
const norm = (code: string): string => (code || '').trim().toUpperCase();
const person = (r: PersonRow): InvitedUser => ({ uid: r.id, name: r.name, username: r.username, color: r.color });
const result = (error: { message: string } | null): ActionResult => (error ? { ok: false, error: error.message } : { ok: true });

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const isWeb = Platform.OS === 'web';
  const sb = createClient(url, anonKey, {
    auth: {
      ...(isWeb ? {} : { storage: AsyncStorage }),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: isWeb,
      flowType: 'pkce',
    },
  });

  // ---- auth plumbing
  const authSubs = new Set<(u: User | null) => void>();
  let emitSeq = 0;
  /** Phone a signed-in guest is in the middle of attaching to their account (OTP sent). */
  let linkingPhone: string | null = null;

  const sessionUser = async (): Promise<AuthUser | null> => (await sb.auth.getSession()).data.session?.user ?? null;
  const myUid = async (): Promise<string | null> => (await sessionUser())?.id ?? null;

  async function toUser(au: AuthUser | null): Promise<User | null> {
    if (!au) return null;
    const { data } = await sb.from('profiles').select('name, username, email, color, is_guest').eq('id', au.id).maybeSingle();
    const p = data as ProfileRow | null;
    return {
      uid: au.id,
      name: p?.name ?? '',
      username: p?.username ?? null,
      email: p?.email ?? au.email ?? null,
      phone: au.phone ? toE164(au.phone) : null,
      color: p?.color ?? AVATAR_COLORS[0],
      isGuest: p?.is_guest ?? !!au.is_anonymous,
    };
  }
  async function emitAuth(au?: AuthUser | null): Promise<void> {
    const n = ++emitSeq;
    const user = await toUser(au === undefined ? await sessionUser() : au).catch(() => null);
    if (n === emitSeq) authSubs.forEach((cb) => cb(user));
  }
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED') return;
    // Never call back into supabase-js from inside this callback (it holds the auth lock) — defer.
    setTimeout(() => void emitAuth(session?.user ?? null), 0);
  });

  async function oauth(provider: 'google' | 'apple'): Promise<ActionResult> {
    try {
      if (isWeb) {
        // Full-page redirect; the session is picked up from the URL when the app reloads.
        const redirectTo = window.location.origin + window.location.pathname;
        return result((await sb.auth.signInWithOAuth({ provider, options: { redirectTo } })).error);
      }
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) return { ok: false, error: error?.message ?? 'Sign-in isn’t available right now' };
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') return { ok: false, error: 'Sign-in cancelled' };
      const params = Linking.parse(res.url).queryParams ?? {};
      if (typeof params.code !== 'string') {
        return { ok: false, error: typeof params.error_description === 'string' ? params.error_description : 'Sign-in didn’t complete' };
      }
      return result((await sb.auth.exchangeCodeForSession(params.code)).error);
    } catch {
      return { ok: false, error: OFFLINE };
    }
  }

  // ---- game plumbing
  /** code -> refetchers of this device's live subscriptions (poked after our own actions). */
  const live = new Map<string, Set<() => void>>();

  async function fetchView(code: string, knownDoc?: GameDoc): Promise<GameView | null> {
    const uid = await myUid();
    if (!uid) return null;
    const [game, ticket, contacts] = await Promise.all([
      knownDoc ? null : sb.from('games').select('doc').eq('code', code).maybeSingle(),
      sb.from('tickets').select('ticket, dabs').eq('code', code).eq('user_id', uid).maybeSingle(),
      sb.from('game_contacts').select('contacts').eq('code', code).maybeSingle(),   // rows exist for the host only
    ]);
    const doc = knownDoc ?? (game?.data as { doc: GameDoc } | null)?.doc;
    if (!doc) return null;
    const t = ticket.data as Omit<TicketRow, 'code'> | null;
    return {
      ...doc,
      contacts: (contacts.data as { contacts: ContactInvite[] } | null)?.contacts ?? [],
      me: t ? { ticket: t.ticket, dabs: t.dabs ?? [] } : null,
    };
  }

  async function callGame(body: Record<string, unknown>): Promise<FnResult> {
    try {
      const { data, error } = await sb.functions.invoke('game', { body });
      if (!error) return (data ?? {}) as FnResult;
      // Non-2xx: the function still answers with { ok:false, error } — surface its message when there is one.
      const ctx = (error as { context?: unknown }).context;
      const parsed = ctx instanceof Response ? ((await ctx.json().catch(() => null)) as FnResult | null) : null;
      return { ok: false, error: parsed?.error ?? OFFLINE };
    } catch {
      return { ok: false, error: OFFLINE };
    }
  }

  return {
    mode: 'supabase',

    // ---- auth
    async currentUser() { return toUser(await sessionUser()); },
    onAuthChange(cb) { authSubs.add(cb); return () => { authSubs.delete(cb); }; },
    async sendOtp(phone) {
      const e164 = toE164(phone);
      if (e164.length < 11) return { ok: false, error: 'Enter your mobile number with country code' };
      linkingPhone = null;
      if ((await sessionUser())?.is_anonymous) {
        // A guest saving their account: attach the number to the same user so their games carry over.
        // If the number already has an account this fails, and we fall back to signing in to that one.
        const { error } = await sb.auth.updateUser({ phone: e164 });
        if (!error) { linkingPhone = e164; return { ok: true }; }
      }
      return result((await sb.auth.signInWithOtp({ phone: e164 })).error);
    },
    async verifyOtp(phone, code, name) {
      const e164 = toE164(phone);
      const { data, error } = await sb.auth.verifyOtp({ phone: e164, token: code.trim(), type: linkingPhone === e164 ? 'phone_change' : 'sms' });
      if (error || !data.user) return { ok: false, error: 'That code isn’t right — check it and try again' };
      linkingPhone = null;
      const uid = data.user.id;
      if (name?.trim()) await sb.from('profiles').update({ name: name.trim().slice(0, 40) }).eq('id', uid).eq('name', '');
      // Idempotent: the auth trigger already stores the hash; the server checks it against the verified phone.
      await sb.rpc('set_my_phone_hash', { client_hash: await sha256(phoneDigits(e164)) });
      void emitAuth();
      return { ok: true };
    },
    signInWithGoogle() { return oauth('google'); },
    async signInWithApple() {
      if (Platform.OS !== 'ios') return oauth('apple');
      try {
        const rawNonce = Crypto.randomUUID();
        const cred = await AppleAuthentication.signInAsync({
          requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
          nonce: await sha256(rawNonce),
        });
        if (!cred.identityToken) return { ok: false, error: 'Apple didn’t return a sign-in token' };
        const { data, error } = await sb.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken, nonce: rawNonce });
        if (error || !data.user) return { ok: false, error: error?.message ?? 'Apple sign-in failed' };
        // Apple shares the name only on the very first sign-in, and not inside the token.
        const full = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ').trim();
        if (full) {
          await sb.from('profiles').update({ name: full.slice(0, 40) }).eq('id', data.user.id).eq('name', '');
          void emitAuth();
        }
        return { ok: true };
      } catch (e) {
        const cancelled = (e as { code?: string }).code === 'ERR_REQUEST_CANCELED';
        return { ok: false, error: cancelled ? 'Sign-in cancelled' : 'Apple sign-in failed' };
      }
    },
    async signInGuest(name) {
      if (!name.trim()) return { ok: false, error: 'Tell us your name first' };
      return result((await sb.auth.signInAnonymously({ options: { data: { name: name.trim().slice(0, 40) } } })).error);
    },
    async signOut() { await sb.auth.signOut(); },
    async usernameAvailable(handle) {
      const h = cleanHandle(handle);
      if (!USERNAME_RE.test(h)) return false;
      const { data, error } = await sb.rpc('username_available', { handle: h });
      return !error && data === true;
    },
    async updateProfile(patch) {
      const uid = await myUid();
      if (!uid) return SIGNED_OUT;
      const next: { name?: string; username?: string } = {};
      if (patch.name !== undefined) {
        if (!patch.name.trim()) return { ok: false, error: 'Name can’t be empty' };
        next.name = patch.name.trim().slice(0, 40);
      }
      if (patch.username !== undefined) {
        next.username = cleanHandle(patch.username);
        if (!USERNAME_RE.test(next.username)) return { ok: false, error: '3–15 letters, numbers or _' };
      }
      const { error } = await sb.from('profiles').update(next).eq('id', uid);
      if (error) return { ok: false, error: error.code === '23505' ? `@${next.username} is taken` : 'Couldn’t save — try again' };
      void emitAuth();
      return { ok: true };
    },

    // ---- social
    async getSocial() {
      const [friends, groups, pending] = await Promise.all([
        sb.rpc('my_friends'),
        sb.from('groups').select('id, name, member_ids').order('name'),
        sb.from('pending_invites').select('id, contact_name, phone, sent_at').order('contact_name'),
      ]);
      return {
        friends: ((friends.data ?? []) as (PersonRow & { together: number })[]).map((r): Friend => ({ ...person(r), together: r.together })),
        groups: ((groups.data ?? []) as GroupRow[]).map((g): Group => ({ id: g.id, name: g.name, uids: g.member_ids })),
        pending: ((pending.data ?? []) as PendingRow[]).map((p): PendingFriend => ({ id: p.id, name: p.contact_name, phone: p.phone, sent: !!p.sent_at })),
      };
    },
    async findUser(handle) {
      const h = cleanHandle(handle);
      if (!h) return null;
      const { data } = await sb.rpc('find_user', { handle: h });
      const row = ((data ?? []) as PersonRow[])[0];
      return row ? person(row) : null;
    },
    async addFriend(uid) {
      const me = await myUid();
      if (!me || me === uid) return;
      await sb.from('friendships').upsert({ user_id: me, friend_id: uid, source: 'username' }, { onConflict: 'user_id,friend_id', ignoreDuplicates: true });
    },
    async saveGroup(name, uids) {
      const me = await myUid();
      if (!me) throw new Error('Please sign in first');
      const { data, error } = await sb.from('groups')
        .upsert({ owner_id: me, name: name.trim(), member_ids: [...new Set(uids)] }, { onConflict: 'owner_id,name' })
        .select('id, name, member_ids').single();
      if (error || !data) throw new Error(error?.message ?? 'Couldn’t save the group');
      const g = data as GroupRow;
      return { id: g.id, name: g.name, uids: g.member_ids };
    },
    async deleteGroup(id) { await sb.from('groups').delete().eq('id', id); },
    async matchContacts(contacts) {
      // Only sha256(digits) leaves the device; the server re-hashes with its own secret before comparing.
      const byHash = new Map<string, string[]>();
      await Promise.all(contacts.map(async (c) => {
        const digits = phoneDigits(c.phone);
        if (digits.length < 8) return;
        const h = await sha256(digits);
        byHash.set(h, [...(byHash.get(h) ?? []), c.id]);
      }));
      const hashes = [...byHash.keys()];
      const out: ContactMatch[] = [];
      for (let i = 0; i < hashes.length; i += 1000) {
        const { data } = await sb.rpc('match_contacts', { hashes: hashes.slice(i, i + 1000) });
        for (const r of (data ?? []) as (PersonRow & { phone_hash: string })[]) {
          for (const contactId of byHash.get(r.phone_hash) ?? []) out.push({ contactId, user: person(r) });
        }
      }
      return out;
    },
    async addPendingFriends(contacts) {
      const rows = contacts.map((c) => ({ contact_name: c.name.slice(0, 80), phone: phoneDigits(c.phone) })).filter((r) => r.phone.length >= 8);
      // The server hashes the phone, skips duplicates, and befriends directly if that person already signed up.
      if (rows.length) await sb.from('pending_invites').insert(rows);
    },
    async markPendingSent(id) { await sb.from('pending_invites').update({ sent_at: new Date().toISOString() }).eq('id', id); },
    async removePending(id) { await sb.from('pending_invites').delete().eq('id', id); },

    // ---- games
    async listGames() {
      const uid = await myUid();
      if (!uid) return [];
      // RLS returns exactly the games I host or joined.
      const { data } = await sb.from('games').select('code, doc').order('created_at', { ascending: false }).limit(50);
      const games = (data ?? []) as GameRow[];
      if (!games.length) return [];
      const codes = games.map((g) => g.code);
      const [tickets, contacts] = await Promise.all([
        sb.from('tickets').select('code, ticket, dabs').eq('user_id', uid).in('code', codes),
        sb.from('game_contacts').select('code, contacts').in('code', codes),
      ]);
      const mine = new Map(((tickets.data ?? []) as TicketRow[]).map((t) => [t.code, t]));
      const book = new Map(((contacts.data ?? []) as ContactsRow[]).map((c) => [c.code, c.contacts]));
      return games.map((g): GameView => {
        const t = mine.get(g.code);
        return { ...g.doc, contacts: book.get(g.code) ?? [], me: t ? { ticket: t.ticket, dabs: t.dabs ?? [] } : null };
      });
    },
    async listInvites() {
      const { data } = await sb.rpc('my_invites');
      return (data ?? []) as PeekGame[];
    },
    async peekGame(code) {
      const { data } = await sb.rpc('peek_game', { p_code: norm(code) });
      return (data ?? null) as PeekGame | null;
    },
    async createGame(input) {
      const r = await callGame({ op: 'create', input });
      return r.ok && r.code ? { ok: true, code: r.code } : { ok: false, error: r.error ?? OFFLINE };
    },
    getGame(code) { return fetchView(norm(code)); },
    async act(code, action) {
      const id = norm(code);
      const r = await callGame({ op: 'act', code: id, action });
      if (!r.ok) return { ok: false, error: r.error ?? OFFLINE };
      // Ticket-only changes (dabs) are not broadcast, so refresh this device's own subscribers directly.
      live.get(id)?.forEach((refetch) => refetch());
      return { ok: true };
    },
    subscribe(code, cb) {
      const id = norm(code);
      let seq = 0;
      let open = true;
      const refetch = (doc?: GameDoc): void => {
        const n = ++seq;
        fetchView(id, doc).then((view) => { if (view && open && n === seq) cb(view); }).catch(() => undefined);
      };
      const poke = (): void => refetch();
      const set = live.get(id) ?? new Set();
      live.set(id, set);
      set.add(poke);
      const channel = sb
        .channel(`game:${id}:${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'games', filter: `code=eq.${id}` }, (payload) => {
          // The row carries the new public doc; only my own ticket still has to be fetched.
          refetch((payload.new as Partial<GameRow> | null)?.doc);
        })
        // Fires on first join AND after every reconnect, so a player who was offline catches up.
        .subscribe((status) => { if (status === 'SUBSCRIBED') refetch(); });
      return () => {
        open = false;
        set.delete(poke);
        void sb.removeChannel(channel);
      };
    },
  };
}
