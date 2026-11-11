import { useEffect, useRef } from 'react';
import type { GameView } from '@core/types';

/**
 * Auto-call runs on the HOST's device (README §5): while the round is live and numbers remain, call `draw`
 * every `game.auto` seconds. Stops on unmount, when auto is switched off, or when the round ends.
 */
export function useAutoCall(game: GameView, isHost: boolean, draw: () => void) {
  const fn = useRef(draw);
  fn.current = draw;
  const sec = isHost && game.status === 'live' && game.called.length < 90 ? game.auto : 0;
  useEffect(() => {
    if (!sec) return;
    const t = setInterval(() => fn.current(), sec * 1000);
    return () => clearInterval(t);
  }, [sec]);
}
