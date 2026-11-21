// The glue between a request and the insights store: who is asking (headers only), and "do this after the response".
// Recording must never slow down, fail or change a player's request — every write here is best effort.
import { after } from 'next/server';
import { clientInfo, primaryLanguage } from '../client-info';
import { getStore } from '../store';
import type { GameStore } from '../store';
import { UA_MAX, parseUserAgent } from './ua';
import type { RequestContext } from './types';

/** Everything the server knows about this request, from its headers. Nothing from the body. */
export function requestContext(headers: Headers, tokenHash: string | null, now: number = Date.now()): RequestContext {
  const info = clientInfo(headers);
  const raw = headers.get('user-agent');
  const ua = parseUserAgent(raw);
  return {
    tokenHash, at: now,
    ip: info.ip, country: info.country, region: info.region, city: info.city, lat: info.lat, lon: info.lon, timezone: info.timezone, postal: info.postal,
    deviceType: ua.device, os: ua.os, osVersion: ua.osVersion, browser: ua.browser, browserVersion: ua.browserVersion, inApp: ua.inApp,
    ua: raw ? raw.slice(0, UA_MAX) : null,
    language: primaryLanguage(headers),
  };
}

/** Run `work` once the response has gone out (or right away outside a request, e.g. in tests). Never throws. */
export function later(work: () => Promise<unknown>): void {
  const run = (): Promise<unknown> => work().catch((e) => console.warn('[insights] write failed:', e instanceof Error ? e.message : e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** A game was created or joined: remember the IP, place and device of that moment (admin only). */
export function noteParticipation(
  headers: Headers, tokenHash: string, p: { code: string; role: 'host' | 'player'; pid: string | null; name: string }, store: GameStore = getStore(),
): void {
  const ctx = requestContext(headers, tokenHash);
  if (ctx.deviceType === 'bot') return;
  later(() => store.recordParticipation(ctx, p));
}

export function noteWin(tokenHash: string, amount: number, store: GameStore = getStore()): void {
  later(() => store.recordWin(tokenHash, amount));
}
