import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { backend } from '@/backend';
import type { User } from '@/backend/types';
import { createStore } from '@/lib/store';

/** Who is signed in. `pendingCode` = game code from an invite link opened while signed out. */
export const session = createStore<{ user: User | null; ready: boolean; pendingCode: string | null }>({ user: null, ready: false, pendingCode: null });

// ---- pendingCode survives a reload: sessionStorage on web (per tab, like the demo session), AsyncStorage on native.
export const PENDING_KEY = 'tambola:pendingCode';
const ss = (): Storage | null => {
  try { return Platform.OS === 'web' && typeof sessionStorage !== 'undefined' ? sessionStorage : null; } catch { return null; }
};
const cleanCode = (v: unknown): string | null => (typeof v === 'string' && /^[A-Z0-9]{1,8}$/.test(v) ? v : null);

async function loadPendingCode(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return cleanCode(ss()?.getItem(PENDING_KEY));
    return cleanCode(await AsyncStorage.getItem(PENDING_KEY));
  } catch { return null; }
}

/** Remember (or with `null` forget) the invite link the person is on their way to. */
export function setPendingCode(code: string | null): void {
  const next = code ? cleanCode(code.toUpperCase()) : null;
  if (session.get().pendingCode !== next) session.set({ pendingCode: next });
  try {
    if (Platform.OS === 'web') { const s = ss(); if (s) next ? s.setItem(PENDING_KEY, next) : s.removeItem(PENDING_KEY); }
    else void (next ? AsyncStorage.setItem(PENDING_KEY, next) : AsyncStorage.removeItem(PENDING_KEY)).catch(() => {});
  } catch { /* storage blocked: the code still lives in memory for this visit */ }
}

let started = false;
export function initSession() {
  if (started) return; started = true;
  // A code set before storage answered (the invite route mounting first) is newer than the stored one.
  const pending = loadPendingCode().then((code) => { if (code && !session.get().pendingCode) session.set({ pendingCode: code }); });
  Promise.all([backend.currentUser(), pending])
    .then(([user]) => session.set({ user, ready: true }))
    .catch(() => session.set({ ready: true }));
  backend.onAuthChange((user) => {
    session.set({ user });
    void pending.then(() => { if (!session.get().ready) session.set({ ready: true }); });
  });
}
export async function refreshUser() { session.set({ user: await backend.currentUser() }); }
export const useUser = () => session.use((s) => s.user);
/** Signed-in users need a username once; guests (name only, joined from a link) skip it. */
export const needsUsername = (u: User | null) => !!u && !u.isGuest && !u.username;
