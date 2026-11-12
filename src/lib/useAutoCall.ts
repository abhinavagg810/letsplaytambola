'use client';
// Auto-call: a timer in the HOST's browser that asks the server for the next number every `game.auto` seconds.
// Mount it once on the live game screen. If the host closes the page, calling pauses; it resumes when they return.
import { useEffect } from 'react';
import { isMember } from '@/core';
import type { GameView } from '@/core';
import type { UseGame } from './useGame';

const RETRY_MS = 2000;

export function useAutoCall(game: GameView | null | undefined, act: UseGame['act'], serverNow: UseGame['serverNow']): void {
  const member = isMember(game) ? game : null;
  const on = !!member && member.you.role === 'host' && member.status === 'live' && member.auto > 0;
  const seconds = member ? member.auto : 0;
  const calledCount = member ? member.called.length : 0;
  // When the last number was called (server clock), so the rhythm stays even across re-renders.
  let lastCallAt = 0;
  if (member) {
    for (let i = member.events.length - 1; i >= 0; i--) {
      const e = member.events[i];
      if (e.kind === 'call') {
        lastCallAt = e.at;
        break;
      }
    }
  }

  useEffect(() => {
    if (!on) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const plan = (delay: number) => {
      timer = setTimeout(async () => {
        const r = await act({ type: 'draw' });
        // On success the game changes and this effect runs again for the next number.
        if (!stopped && !r.ok) plan(RETRY_MS);
      }, delay);
    };
    const due = calledCount === 0 || !lastCallAt ? 1000 : lastCallAt + seconds * 1000 - serverNow();
    plan(Math.min(seconds * 1000, Math.max(0, due)));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [on, seconds, calledCount, lastCallAt, act, serverNow]);
}
