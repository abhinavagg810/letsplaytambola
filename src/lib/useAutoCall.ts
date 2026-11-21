'use client';
// Auto-call: a timer in the HOST's browser that asks the server for the next number every `game.auto` seconds.
// Mount it once on the live game screen. If the host closes the page, calling pauses; it resumes when they return.
import { useEffect, useRef } from 'react';
import { isMember } from '@/core';
import type { GameView } from '@/core';
import type { UseGame } from './useGame';

const RETRY_MS = 2000;

/**
 * How long to wait before the next automatic call (ms). The next number is due one full interval after the later of
 * "the last number was called" and "auto-call was switched on (or this screen opened)" — so switching it on never
 * fires a number at once, and the rhythm stays even while it runs. Exported for tests.
 */
export function autoCallDelay(seconds: number, lastCallAt: number, onSince: number, now: number): number {
  const interval = seconds * 1000;
  return Math.min(interval, Math.max(0, Math.max(lastCallAt, onSince) + interval - now));
}

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
  /** Server-clock time at which auto-call came on in this tab (null while it is off). */
  const onSince = useRef<number | null>(null);

  useEffect(() => {
    if (!on) {
      onSince.current = null;
      return;
    }
    if (onSince.current === null) onSince.current = serverNow();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const plan = (delay: number) => {
      timer = setTimeout(async () => {
        // `after` = how many numbers this tab has seen. If another host tab (or a retry) already called the next one,
        // the server does nothing — two tabs can never call at double speed.
        const r = await act({ type: 'draw', after: calledCount });
        // On success the game changes and this effect runs again for the next number; the fallback below only
        // matters if it somehow does not.
        if (!stopped) plan(r.ok ? seconds * 1000 : RETRY_MS);
      }, delay);
    };
    plan(autoCallDelay(seconds, lastCallAt, onSince.current, serverNow()));
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [on, seconds, calledCount, lastCallAt, act, serverNow]);
}
