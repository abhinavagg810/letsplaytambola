import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { backend } from '@/backend';
import type { GameView } from '@core/types';

/** Mounted hooks by game code, so `resyncGame` can ask them to fetch a fresh copy. */
const refetchers = new Map<string, Set<() => void>>();

/** Fetch a fresh view of this game for every screen that is showing it (e.g. after queued dabs were re-sent). */
export function resyncGame(code: string): void {
  refetchers.get(code.toUpperCase())?.forEach((f) => f());
}

/** Never let an older answer replace a newer view (a slow fetch can land after a realtime push). */
const newest = (cur: GameView | null | undefined, next: GameView): GameView =>
  cur && cur.id === next.id && (cur.version || 0) > (next.version || 0) ? cur : next;

/**
 * Live view of one game. `undefined` = loading, `null` = not found. Re-subscribes when the signed-in user changes.
 * Also catches up by itself whenever the person comes back: the app returns to the foreground, the browser tab
 * becomes visible again, or the connection is restored — so lobby, play and results never show a stale game.
 */
export function useGame(code: string, uid: string | null) {
  const [game, setGame] = useState<GameView | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setGame(undefined);
    if (!uid) return;
    const key = code.toUpperCase();
    const apply = (g: GameView) => { if (live) setGame((cur) => newest(cur, g)); };
    backend.getGame(code).then((g) => { if (live) setGame((cur) => (g ? newest(cur, g) : cur ?? null)); }).catch(() => { if (live) setGame((cur) => cur ?? null); });
    const off = backend.subscribe(code, apply);

    // Catch up. A failed fetch (still offline) keeps what is on screen; if the very first load failed, this recovers it.
    const refetch = () => {
      backend.getGame(code).then((g) => { if (g) apply(g); }).catch(() => {});
    };
    const set = refetchers.get(key) ?? new Set();
    refetchers.set(key, set);
    set.add(refetch);

    const app = AppState.addEventListener('change', (s) => { if (s === 'active') refetch(); });
    const web = Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined';
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    if (web) {
      window.addEventListener('online', refetch);
      document.addEventListener('visibilitychange', onVisible);
    }
    return () => {
      live = false; off(); app.remove(); set.delete(refetch);
      if (web) {
        window.removeEventListener('online', refetch);
        document.removeEventListener('visibilitychange', onVisible);
      }
    };
  }, [code, uid]);
  return game;
}
