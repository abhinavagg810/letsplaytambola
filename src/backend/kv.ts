// Tiny synchronous key-value store for demo mode.
// Web: localStorage (shared by every tab). Native: in-memory Map mirrored to AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const KV_PREFIX = 'tambola:';

const isWeb = Platform.OS === 'web';
const ls: Storage | null = isWeb && typeof localStorage !== 'undefined' ? localStorage : null;
const mem = new Map<string, string>();
let ready: Promise<void> | null = null;

/** Resolves once stored data is readable (instant on web; hydrates from AsyncStorage on native). */
export function kvReady(): Promise<void> {
  if (!ready) {
    ready = isWeb
      ? Promise.resolve()
      : AsyncStorage.getAllKeys()
          .then((keys) => AsyncStorage.multiGet(keys.filter((k) => k.startsWith(KV_PREFIX))))
          .then((pairs) => {
            // Anything written before hydration finished is newer than what was on disk.
            for (const [k, v] of pairs) if (v != null && !mem.has(k)) mem.set(k, v);
          })
          .catch(() => undefined);
  }
  return ready;
}

export function kvGet<T>(key: string, fallback: T): T {
  try {
    const raw = ls ? ls.getItem(KV_PREFIX + key) : mem.get(KV_PREFIX + key);
    const v = raw == null ? null : (JSON.parse(raw) as T | null);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

export function kvSet(key: string, value: unknown): void {
  const k = KV_PREFIX + key;
  const raw = JSON.stringify(value);
  if (ls) {
    try { ls.setItem(k, raw); } catch { /* storage full or blocked: the demo keeps running from what is there */ }
    return;
  }
  mem.set(k, raw);
  if (!isWeb) AsyncStorage.setItem(k, raw).catch(() => undefined);
}

export function kvRemove(key: string): void {
  const k = KV_PREFIX + key;
  if (ls) { ls.removeItem(k); return; }
  mem.delete(k);
  if (!isWeb) AsyncStorage.removeItem(k).catch(() => undefined);
}

/** Wipes all demo data (used by tests and a "reset demo" action). */
export function kvClear(): void {
  if (ls) {
    for (let i = ls.length - 1; i >= 0; i--) {
      const k = ls.key(i);
      if (k && k.startsWith(KV_PREFIX)) ls.removeItem(k);
    }
    return;
  }
  const keys = [...mem.keys()];
  mem.clear();
  if (!isWeb) AsyncStorage.multiRemove(keys).catch(() => undefined);
}
