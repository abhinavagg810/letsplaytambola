// Typed wrappers around the API routes. Every call carries this device's token in `x-device-token`.
// They never throw: a network failure comes back as { ok: false, code: 'network' }.
import type { CreateGameInput, EngineErrorCode, GameAction, GameView } from '@/core';
import { getDeviceToken } from './device';
import { track, trackGameView } from './track';

export type ApiErrorCode =
  | EngineErrorCode
  | 'no_token' | 'bad_request' | 'not_found' | 'rate_limited' | 'busy' | 'server'
  /** The request never reached the server (offline, timeout). */
  | 'network';

export interface ApiError {
  ok: false;
  /** User-facing copy, ready for a toast. */
  error: string;
  code: ApiErrorCode;
  /** HTTP status; 0 when the request never reached the server. */
  status: number;
  /** True when the game does not exist or has expired. */
  notFound?: boolean;
}
export type ApiResult<T extends object = object> = ({ ok: true } & T) | ApiError;

export const NETWORK_ERROR = 'Can’t reach the game — check your internet';
const SERVER_ERROR = 'Something went wrong on our side — please try again';

async function call<T extends object>(path: string, init: { method: 'GET' | 'POST'; body?: unknown; signal?: AbortSignal }): Promise<ApiResult<T>> {
  let res: Response;
  try {
    const token = getDeviceToken();
    res = await fetch(path, {
      method: init.method,
      headers: {
        Accept: 'application/json',
        ...(token ? { 'x-device-token': token } : {}),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
      signal: init.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, error: NETWORK_ERROR, code: 'network', status: 0 };
  }
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // not JSON (a proxy error page, say)
  }
  const body = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  if (body.ok === true) return body as { ok: true } & T;
  return {
    ok: false,
    error: typeof body.error === 'string' ? body.error : SERVER_ERROR,
    code: typeof body.code === 'string' ? (body.code as ApiErrorCode) : 'server',
    status: res.status,
    ...(body.notFound === true || res.status === 404 ? { notFound: true } : {}),
  };
}

const gamePath = (code: string) => `/api/games/${encodeURIComponent(code.trim().toUpperCase())}`;

/** Host a game. The calling device becomes the host. */
export async function createGame(input: CreateGameInput): Promise<ApiResult<{ code: string }>> {
  track('host_create_tap');
  const r = await call<{ code: string }>('/api/games', { method: 'POST', body: input });
  if (r.ok) track('host_created', { code: r.code });
  else track('host_create_failed', { reason: r.code });
  return r;
}

/** This device's view of a game. `notFound: true` when there is no such game (or it expired). */
export async function getGame(code: string, signal?: AbortSignal): Promise<ApiResult<{ game: GameView }>> {
  const r = await call<{ game: GameView }>(gamePath(code), { method: 'GET', signal });
  trackGameView(code, r.ok ? r.game : r.notFound ? null : undefined);
  return r;
}

/** Do one thing in a game. On success the fresh view comes back, so the screen can update at once. */
export async function act(code: string, action: GameAction): Promise<ApiResult<{ game: GameView }>> {
  if (action.type === 'join') track('join_tap', { code });
  const r = await call<{ game: GameView }>(`${gamePath(code)}/act`, { method: 'POST', body: action });
  trackAct(code, action, r);
  return r;
}

/** Usage events for the operator's statistics (src/lib/track.ts). Dabs are never recorded. */
function trackAct(code: string, action: GameAction, r: ApiResult<{ game: GameView }>): void {
  switch (action.type) {
    case 'join':
      if (r.ok) track('join_ok', { code });
      else track('join_failed', { code, reason: r.code });
      break;
    case 'start':
      if (r.ok) track('game_start', { code });
      break;
    case 'draw':
      if (r.ok && 'called' in r.game && r.game.called.length === 1) track('first_call', { code });
      break;
    case 'setAuto':
      if (r.ok) track(action.auto ? 'auto_on' : 'auto_off', { code });
      break;
    case 'claim':
      if (r.ok) track('claim_valid', { code, prize: action.prizeId, called: 'called' in r.game ? r.game.called.length : undefined });
      else track('claim_invalid', { code, prize: action.prizeId, reason: r.code === 'not_yet' || r.code === 'taken' ? r.code : 'other' });
      break;
    case 'newRound':
      if (r.ok) track('new_round', { code });
      break;
    default:
      break;
  }
  if (r.ok) trackGameView(code, r.game);
}

/** "Notify me" on the website: save a 10-digit WhatsApp number. */
export function notifyMe(phone: string): Promise<ApiResult> {
  return call('/api/notify', { method: 'POST', body: { phone } });
}
