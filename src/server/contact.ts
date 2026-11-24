// The contact form's server side: POST /api/contact → checks → store. Kept apart from the route so it is unit-tested.
import { CONTACT_EMAIL } from '@/lib/site';
import { CONTACT_MAX_BYTES, honeypotFilled, validateContact } from '@/lib/contact';
import type { ContactField } from '@/lib/contact';
import { isJsonRequest, sameOrigin } from './admin/auth';
import { NO_STORE } from './http';
import { requestContext } from './insights/record';
import { allow } from './rateLimit';
import { getStore } from './store';
import type { GameStore } from './store';
import { tokenHashFrom } from './tokens';

export const CONTACT_COPY_SERVER = {
  notJson: 'Something went wrong — please try again',
  wrongOrigin: 'Please send your message from the contact page',
  tooBig: 'That message is too long — please make it shorter',
  tooMany: 'You have sent a few messages already — please wait an hour and try again',
  /** Not stored (the database is not ready, or it failed): never pretend it worked. */
  unavailable: `Sorry, we could not send your message just now. Please email us at ${CONTACT_EMAIL} instead.`,
} as const;

export type ContactErrorCode = 'bad_request' | 'forbidden' | 'too_large' | 'rate_limited' | 'invalid' | 'unavailable' | 'server';
export type ContactResult =
  | { ok: true }
  | { ok: false; status: number; code: ContactErrorCode; error: string; fields?: Partial<Record<ContactField, string>> };

const fail = (status: number, code: ContactErrorCode, error: string, fields?: Partial<Record<ContactField, string>>): ContactResult =>
  ({ ok: false, status, code, error, ...(fields ? { fields } : {}) });

/** Read the body as text, refusing anything over `max` BYTES (a declared Content-Length is checked first). */
async function readBody(request: Request, max: number): Promise<{ text: string } | 'too_large' | 'bad'> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return 'too_large';
  try {
    const buf = await request.arrayBuffer();
    if (buf.byteLength > max) return 'too_large';
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf) };
  } catch {
    return 'bad';
  }
}

/**
 * Handle one POST /api/contact. Order: same-site JSON only → rate limit → size → JSON → honeypot → validation → store.
 * The answer never repeats what was sent; field errors are fixed sentences.
 */
export async function handleContact(request: Request, deps: { store?: GameStore; now?: number } = {}): Promise<ContactResult> {
  if (!isJsonRequest(request)) return fail(415, 'bad_request', CONTACT_COPY_SERVER.notJson);
  if (!sameOrigin(request)) return fail(403, 'forbidden', CONTACT_COPY_SERVER.wrongOrigin);
  const tokenHash = tokenHashFrom(request.headers);
  const ctx = requestContext(request.headers, tokenHash, deps.now);
  if (!allow('contact', { tokenHash, ip: ctx.ip }, deps.now)) return fail(429, 'rate_limited', CONTACT_COPY_SERVER.tooMany);

  const body = await readBody(request, CONTACT_MAX_BYTES);
  if (body === 'too_large') return fail(413, 'too_large', CONTACT_COPY_SERVER.tooBig);
  if (body === 'bad') return fail(400, 'bad_request', CONTACT_COPY_SERVER.notJson);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text);
  } catch {
    return fail(400, 'bad_request', CONTACT_COPY_SERVER.notJson);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fail(400, 'bad_request', CONTACT_COPY_SERVER.notJson);
  const fields = parsed as Record<string, unknown>;

  // A bot filled in the field people cannot see: say thank you, store nothing.
  if (honeypotFilled(fields)) return { ok: true };

  const check = validateContact(fields);
  if (!check.ok) return fail(400, 'invalid', 'Please check the form', check.errors);

  try {
    const stored = await (deps.store ?? getStore()).saveContactMessage(ctx, check.value);
    return stored === 'ok' ? { ok: true } : fail(503, 'unavailable', CONTACT_COPY_SERVER.unavailable);
  } catch (e) {
    console.error('[contact] could not store a message:', e instanceof Error ? e.message : e);
    return fail(500, 'server', CONTACT_COPY_SERVER.unavailable);
  }
}

export function contactResponse(r: ContactResult): Response {
  if (r.ok) return Response.json({ ok: true }, { status: 200, headers: NO_STORE });
  const { status, ...body } = r;
  return Response.json(body, { status, headers: NO_STORE });
}
