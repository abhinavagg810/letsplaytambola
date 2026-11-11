import { useEffect, useState } from 'react';
import { backend } from '@/backend';
import type { GameView } from '@core/types';

/** Live view of one game. `undefined` = loading, `null` = not found. Re-subscribes when the signed-in user changes. */
export function useGame(code: string, uid: string | null) {
  const [game, setGame] = useState<GameView | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    setGame(undefined);
    if (!uid) return;
    backend.getGame(code).then((g) => { if (live) setGame(g); }).catch(() => { if (live) setGame(null); });
    const off = backend.subscribe(code, (g) => { if (live) setGame(g); });
    return () => { live = false; off(); };
  }, [code, uid]);
  return game;
}
