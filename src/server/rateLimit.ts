// Simple fixed-window rate limiting, in memory. Per server instance — on serverless it is a speed bump,
// not a guarantee; that is enough to stop a stuck loop or casual abuse.
interface Bucket { count: number; resetAt: number }

const KEY = '__lpt_rate_limits_v1__';
function buckets(): Map<string, Bucket> {
  const g = globalThis as unknown as Record<string, Map<string, Bucket> | undefined>;
  return (g[KEY] ??= new Map());
}

export interface Limit { max: number; windowMs: number }

/** Limits per action. `token` = per device, `ip` = per network address (generous: a family shares one Wi-Fi). */
export const LIMITS = {
  create: { token: { max: 12, windowMs: 10 * 60_000 }, ip: { max: 40, windowMs: 10 * 60_000 } },
  join: { token: { max: 30, windowMs: 10 * 60_000 }, ip: { max: 300, windowMs: 10 * 60_000 } },
  act: { token: { max: 600, windowMs: 60_000 }, ip: { max: 6000, windowMs: 60_000 } },
  view: { token: { max: 240, windowMs: 60_000 }, ip: { max: 6000, windowMs: 60_000 } },
  notify: { token: { max: 5, windowMs: 60 * 60_000 }, ip: { max: 20, windowMs: 60 * 60_000 } },
} as const satisfies Record<string, { token: Limit; ip: Limit }>;
export type LimitName = keyof typeof LIMITS;

/** Count one hit. Returns false when `key` is over its limit for the current window. */
export function hit(key: string, limit: Limit, now: number = Date.now()): boolean {
  const map = buckets();
  if (map.size > 20_000) for (const [k, b] of map) if (b.resetAt <= now) map.delete(k);
  const b = map.get(key);
  if (!b || b.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + limit.windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit.max;
}

/** True when `key` has already used up `limit` in the current window. Does not count a hit (see the admin sign-in). */
export function exhausted(key: string, limit: Limit, now: number = Date.now()): boolean {
  const b = buckets().get(key);
  return !!b && b.resetAt > now && b.count >= limit.max;
}

/** True when this request may go ahead. `who` = token hash and/or IP (either may be missing). */
export function allow(name: LimitName, who: { tokenHash?: string | null; ip?: string | null }, now: number = Date.now()): boolean {
  if (process.env.RATE_LIMIT_DISABLED === '1') return true;
  const l = LIMITS[name];
  let ok = true;
  if (who.tokenHash) ok = hit(`${name}:t:${who.tokenHash}`, l.token, now) && ok;
  if (who.ip) ok = hit(`${name}:i:${who.ip}`, l.ip, now) && ok;
  return ok;
}

/** For tests. */
export function resetRateLimits(): void {
  buckets().clear();
}
