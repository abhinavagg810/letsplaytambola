'use client';
// The host setup draft: what has been typed on /host and picked on /host/prizes.
// Kept in a tiny store and in sessionStorage, so it survives going to "Ways to win" and back, and a page refresh.
import { useSyncExternalStore } from 'react';
import { DEFAULT_GAME_NAME, MAX_GAME_NAME_LENGTH, MAX_NAME_LENGTH, PRESETS, isRuleId, type RuleId } from '@/core';

export interface HostDraft {
  /** The host's name. null = not touched yet, so the screen shows the name saved on this device. */
  name: string | null;
  gameName: string;
  /** Digits only, up to 5; '' = no price. */
  price: string;
  /** "Deal me a ticket". */
  hostPlays: boolean;
  /** Selected ways to win, in the order picked. */
  prizes: RuleId[];
}

const KEY = 'lpt:host-draft';

const DEFAULT_DRAFT: HostDraft = Object.freeze({
  name: null,
  gameName: DEFAULT_GAME_NAME,
  price: '',
  hostPlays: true,
  prizes: [...PRESETS[0].rules],
});

let current: HostDraft | null = null;
const listeners = new Set<() => void>();

function load(): HostDraft {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return DEFAULT_DRAFT;
    const d = JSON.parse(raw) as Partial<Record<keyof HostDraft, unknown>>;
    const prizes = Array.isArray(d.prizes) ? d.prizes.filter(isRuleId).filter((r, i, a) => a.indexOf(r) === i) : DEFAULT_DRAFT.prizes;
    return {
      name: typeof d.name === 'string' ? d.name.slice(0, MAX_NAME_LENGTH) : null,
      gameName: typeof d.gameName === 'string' ? d.gameName.slice(0, MAX_GAME_NAME_LENGTH) : DEFAULT_DRAFT.gameName,
      price: typeof d.price === 'string' ? d.price.replace(/\D/g, '').slice(0, 5) : '',
      hostPlays: typeof d.hostPlays === 'boolean' ? d.hostPlays : true,
      prizes,
    };
  } catch {
    return DEFAULT_DRAFT;
  }
}

function getSnapshot(): HostDraft {
  if (!current) current = load();
  return current;
}

function getServerSnapshot(): HostDraft {
  return DEFAULT_DRAFT;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

function set(next: HostDraft, persist = true): void {
  current = next;
  try {
    if (persist) window.sessionStorage.setItem(KEY, JSON.stringify(next));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // storage blocked: the draft still lives in memory for this visit
  }
  listeners.forEach((fn) => fn());
}

/** Change some fields of the draft. */
export function updateDraft(patch: Partial<HostDraft>): void {
  set({ ...getSnapshot(), ...patch });
}

/** Add or remove one way to win. */
export function togglePrize(id: RuleId): void {
  const d = getSnapshot();
  updateDraft({ prizes: d.prizes.includes(id) ? d.prizes.filter((x) => x !== id) : [...d.prizes, id] });
}

/** Back to a clean form (after the game has been created). */
export function resetDraft(): void {
  set(DEFAULT_DRAFT, false);
}

/** The draft as React state. On the server and during hydration it is the default draft. */
export function useHostDraft(): HostDraft {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
