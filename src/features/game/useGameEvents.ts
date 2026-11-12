'use client';
// Turns new game events into the things people notice: the voice caller and the win banner.
//
// What has been seen is remembered per game code at module level (not in the component), so when the
// page swaps the Live screen for Results on the last win, the new screen carries on from the same place:
// the final win still gets its banner and voice, and nothing is ever played twice.
import { useEffect, useSyncExternalStore } from 'react';
import { latestWin } from '@/core';
import type { GameEvent, MemberView } from '@/core';
import { speakNumber, speakWin, stopSpeech } from '@/lib/speech';

/** How long the win banner stays up. */
export const WIN_BANNER_MS = 5000;
/** A number called this recently still gets read out when the live screen first appears (lobby → live). */
const FRESH_CALL_MS = 3000;

export interface WinNotice {
  code: string;
  seq: number;
  name: string;
  label: string;
}

/** Game code → seq of the newest event already handled on this device. */
const seenSeq = new Map<string, number>();
let notice: WinNotice | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
/** How many screens are using the hook right now (Live and Results swap within one render). */
let mounted = 0;

function setNotice(next: WinNotice | null): void {
  notice = next;
  for (const l of [...listeners]) l();
}

function showWin(code: string, e: Extract<GameEvent, { kind: 'win' }>, ms: number): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  setNotice({ code, seq: e.seq, name: e.name, label: e.label });
  noticeTimer = setTimeout(() => {
    noticeTimer = null;
    setNotice(null);
  }, ms);
}

function clearWin(): void {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = null;
  if (notice) setNotice(null);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const getNotice = (): WinNotice | null => notice;
const getServerNotice = (): WinNotice | null => null;

/** The win to show in the banner right now for game `code`, or null. */
export function useWinNotice(code: string): WinNotice | null {
  const n = useSyncExternalStore(subscribe, getNotice, getServerNotice);
  return n && n.code === code ? n : null;
}

function lastOf<K extends GameEvent['kind']>(events: readonly GameEvent[], kind: K): Extract<GameEvent, { kind: K }> | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === kind) return e as Extract<GameEvent, { kind: K }>;
  }
  return null;
}

/**
 * Mount on the Live and Results screens. New `call` event → the caller reads the number;
 * new `win` event → the banner for 5 seconds plus "Meera wins Top Line!". Muting is handled by the speech helper.
 */
export function useGameEvents(game: MemberView, serverNow: () => number): void {
  const { code, seq, events } = game;

  useEffect(() => {
    const prev = seenSeq.get(code);
    if (prev !== undefined && seq <= prev) return;
    seenSeq.set(code, seq);

    if (prev === undefined) {
      // First look at this game on this device: everything so far is old news…
      const now = serverNow();
      // …except a win from the last few seconds, which still gets (the rest of) its banner,
      const win = latestWin({ events });
      if (win && now - win.at < WIN_BANNER_MS) showWin(code, win, WIN_BANNER_MS - Math.max(0, now - win.at));
      // …and a number called a moment ago (the host tapped just as this screen opened).
      const call = lastOf(events, 'call');
      if (call && now - call.at < FRESH_CALL_MS) speakNumber(call.n);
      return;
    }

    const fresh = events.filter((e) => e.seq > prev);
    const call = lastOf(fresh, 'call');
    if (call) speakNumber(call.n);
    const win = lastOf(fresh, 'win');
    if (win) {
      showWin(code, win, WIN_BANNER_MS);
      speakWin(win.name, win.label);
    }
  }, [code, seq, events, serverNow]);

  useEffect(() => {
    mounted += 1;
    return () => {
      mounted -= 1;
      // Wait a tick: when Live hands over to Results (or React re-runs effects) the voice must carry on.
      setTimeout(() => {
        if (mounted > 0) return;
        stopSpeech();
        clearWin();
      }, 0);
    };
  }, []);
}
