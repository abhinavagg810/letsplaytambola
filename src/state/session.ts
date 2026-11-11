import { backend } from '@/backend';
import type { User } from '@/backend/types';
import { createStore } from '@/lib/store';

/** Who is signed in. `pendingCode` = game code from an invite link opened while signed out. */
export const session = createStore<{ user: User | null; ready: boolean; pendingCode: string | null }>({ user: null, ready: false, pendingCode: null });

let started = false;
export function initSession() {
  if (started) return; started = true;
  backend.currentUser().then((user) => session.set({ user, ready: true })).catch(() => session.set({ ready: true }));
  backend.onAuthChange((user) => session.set({ user, ready: true }));
}
export async function refreshUser() { session.set({ user: await backend.currentUser() }); }
export const useUser = () => session.use((s) => s.user);
/** Signed-in users need a username once; guests (name only, joined from a link) skip it. */
export const needsUsername = (u: User | null) => !!u && !u.isGuest && !u.username;
