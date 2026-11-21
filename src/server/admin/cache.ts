// A very small in-memory cache for the admin's aggregate queries (30 seconds by default), keyed by query + range.
// Why not Next's cache: every admin page is rendered per request behind the session check and must never be stored or
// shared ("no-store"); this lives only in the server process, is only ever reached after requireAdmin(), and is cleared
// by anything that changes the data from the admin (erase a device). The Refresh button asks for fresh numbers (?fresh=…).
interface Entry { at: number; value: Promise<unknown> }
const KEY = '__lpt_admin_cache_v1__';
export const ADMIN_CACHE_MS = 30_000;
const MAX_ENTRIES = 300;

function entries(): Map<string, Entry> {
  const g = globalThis as unknown as Record<string, Map<string, Entry> | undefined>;
  return (g[KEY] ??= new Map());
}

/** `load()` once per `key` per `ttl`; a failed load is not kept. `fresh` skips what is stored (and replaces it). */
export function cached<T>(key: string, load: () => Promise<T>, opts: { fresh?: boolean; ttl?: number; now?: number } = {}): Promise<T> {
  const map = entries();
  const now = opts.now ?? Date.now();
  const hit = map.get(key);
  if (hit && !opts.fresh && now - hit.at < (opts.ttl ?? ADMIN_CACHE_MS)) return hit.value as Promise<T>;
  if (map.size >= MAX_ENTRIES) for (const [k, e] of map) if (now - e.at >= ADMIN_CACHE_MS) map.delete(k);
  if (map.size >= MAX_ENTRIES) map.clear();
  const value = load();
  map.set(key, { at: now, value });
  value.catch(() => {
    if (map.get(key)?.value === value) map.delete(key);
  });
  return value;
}

export function clearAdminCache(): void {
  entries().clear();
}
