import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { GameView } from '@core/types';
import { backend } from '@/backend';
import type { Social } from '@/backend/types';
import { createStore } from '@/lib/store';
import { session, useUser } from '@/state/session';
import { refreshInvites } from '@/state/invites';

export const OFFLINE_MSG = 'Can’t reach Tambola right now — check your internet';

/** One cache for the four tabs: my games + my friends/groups. `null` = not loaded yet. */
const store = createStore<{ uid: string | null; games: GameView[] | null; social: Social | null; error: boolean }>({ uid: null, games: null, social: null, error: false });
let inflight: Promise<void> | null = null;

export function refreshHome(): Promise<void> {
  const uid = session.get().user?.uid ?? null;
  if (!uid) return Promise.resolve();
  if (store.get().uid !== uid) store.set({ uid, games: null, social: null, error: false });
  if (inflight) return inflight;
  inflight = Promise.all([backend.listGames(), backend.getSocial()])
    .then(([games, social]) => { if (session.get().user?.uid === uid) store.set({ games, social, error: false }); })
    .catch(() => { store.set({ error: true }); })
    .finally(() => { inflight = null; });
  return inflight;
}

/**
 * Games + social for the signed-in user. Refetches whenever the tab gains focus; `pollMs` keeps it fresh while focused.
 * `loading` is true only before the first answer; after that stale data stays on screen while `error` shows a retry line.
 */
export function useHomeData(pollMs = 0) {
  const uid = useUser()?.uid ?? null;
  const s = store.use();
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!uid) return;
    refreshHome(); refreshInvites();
    if (!pollMs) return;
    const t = setInterval(refreshHome, pollMs);
    return () => clearInterval(t);
  }, [uid, pollMs]));
  const refresh = useCallback(async () => { setRefreshing(true); await Promise.all([refreshHome(), refreshInvites()]); setRefreshing(false); }, []);
  const mine = s.uid === uid;
  const games = mine ? s.games : null, social = mine ? s.social : null, error = mine && s.error;
  return { games, social, error, loading: (!games || !social) && !error, refresh, refreshing };
}
