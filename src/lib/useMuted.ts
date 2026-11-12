'use client';
// The "Sound on / Sound off" choice as React state, shared by every component on the page.
import { useCallback, useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from './device';
import { stopSpeech, unlockSpeech } from './speech';

/** [muted, setMuted]. Turning sound off stops the voice at once; turning it on (a tap) unlocks speech on iOS. */
export function useMuted(): [boolean, (muted: boolean) => void] {
  const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
  const set = useCallback((next: boolean) => {
    setMuted(next);
    if (next) stopSpeech();
    else unlockSpeech();
  }, []);
  return [muted, set];
}
