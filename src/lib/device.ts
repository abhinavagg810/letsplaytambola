// Per-device storage: the device token (identity without accounts), the last name typed, and the mute choice.
// Safe to import anywhere: on the server (and when storage is blocked) reads return defaults and writes do nothing.

const TOKEN_KEY = 'lpt:token';
const NAME_KEY = 'lpt:name';
const MUTED_KEY = 'lpt:muted';
const MUTE_EVENT = 'lpt:muted-change';

/** Used when localStorage is unavailable (private mode, blocked cookies): lasts until the tab closes. */
const memory = new Map<string, string>();

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the in-memory copy still works for this visit
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomUuid(): string {
  const c = globalThis.crypto;
  // randomUUID needs a secure context; a game on the home Wi-Fi (http://192.168…) does not have one.
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * This device's secret token (a UUID), created on first use and kept in localStorage.
 * It is what makes you the host of your game or the owner of your ticket. Returns '' on the server.
 */
export function getDeviceToken(): string {
  if (typeof window === 'undefined') return '';
  const saved = read(TOKEN_KEY);
  if (saved && UUID.test(saved)) return saved;
  const token = randomUuid();
  write(TOKEN_KEY, token);
  return token;
}

/** The last name typed on this device ('' when none). */
export function getSavedName(): string {
  return (read(NAME_KEY) ?? '').slice(0, 24);
}

export function saveName(name: string): void {
  write(NAME_KEY, name.trim().slice(0, 24));
}

/** Has this device turned the voice caller off? */
export function isMuted(): boolean {
  return read(MUTED_KEY) === '1';
}

export function setMuted(muted: boolean): void {
  write(MUTED_KEY, muted ? '1' : '0');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MUTE_EVENT));
}

/** Call `onChange` whenever the mute choice changes (this tab or another). Returns the unsubscribe function. */
export function subscribeMuted(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === MUTED_KEY) onChange();
  };
  window.addEventListener(MUTE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(MUTE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
