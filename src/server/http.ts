// Request / response helpers shared by the API routes.
import type { EngineErrorCode } from '@/core';

export const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' } as const;

/** Copy shown to people when the server itself is the problem. */
export const HTTP_COPY = {
  noToken: 'Please refresh the page and try again',
  badRequest: 'Something went wrong — please try again',
  notFound: (code: string) => `We can’t find game ${code}`,
  tooMany: 'Too many tries — please wait a minute and try again',
  busy: 'The game is busy — please try again',
  server: 'Something went wrong on our side — please try again',
  badPhone: 'Type your 10-digit WhatsApp number',
} as const;

/** Error codes in API responses: the engine's, plus the server's own. */
export type ApiErrorCode = EngineErrorCode | 'no_token' | 'bad_request' | 'not_found' | 'rate_limited' | 'busy' | 'server';

export type ServiceError = { ok: false; status: number; error: string; code: ApiErrorCode; notFound?: true };
export type ServiceResult<T extends object> = ({ ok: true } & T) | ServiceError;

export const serviceError = (status: number, code: ApiErrorCode, error: string, notFound?: true): ServiceError =>
  ({ ok: false, status, error, code, ...(notFound ? { notFound } : {}) });

/**
 * HTTP status for an engine refusal. `not_yet` and `taken` are normal moments in a game
 * ("Not yet for Top Line — keep playing!"), so they answer 200 with ok:false rather than an error status.
 */
export function statusFor(code: EngineErrorCode): number {
  switch (code) {
    case 'forbidden': return 403;
    case 'invalid': return 400;
    case 'state': case 'full': return 409;
    case 'not_yet': case 'taken': return 200;
  }
}

export function json(body: object, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Turn a service result into the response: `{ ok:true, ... }` or `{ ok:false, error, code[, notFound] }`. */
export function respond<T extends object>(r: ServiceResult<T>): Response {
  if (r.ok) return json(r);
  const { status, ...body } = r;
  return json(body, status);
}

/** Best-effort client address (Vercel and most proxies set x-forwarded-for). */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || headers.get('x-real-ip')?.trim() || null;
}

/** Parse a small JSON object body. Returns null when it is missing, too big or not an object. */
export async function readJson(request: Request, maxBytes = 8192): Promise<Record<string, unknown> | null> {
  try {
    const text = await request.text();
    if (text.length > maxBytes) return null;
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
