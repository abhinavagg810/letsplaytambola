// POST /api/t — first-party usage events from src/lib/track.ts, in small batches. Answers 204 with no body.
//
// Body (JSON, sent as text/plain by navigator.sendBeacon): { sid, tk?, src?, e: [{ n, o?, p?, c?, d? }, …] }
//   sid  random id of the browser tab session      tk  the device token (sendBeacon cannot set headers)
//   src  where the session came from               e   events: name, age in ms, path, game code, properties
// Limits: 16 KB, 50 events, rate-limited per device and per IP. Names and properties are checked against the server's
// whitelist (src/server/insights/events.ts); anything else is dropped. The IP address, the place and the device details
// come from the request HEADERS only — nothing in the body can set them.
import { TRACK_MAX_BYTES, cleanBatch } from '@/server/insights/events';
import { later, requestContext } from '@/server/insights/record';
import { NO_STORE } from '@/server/http';
import { allow } from '@/server/rateLimit';
import { getStore } from '@/server/store';
import { hashToken, isDeviceToken, tokenHashFrom } from '@/server/tokens';

const done = (status: number): Response => new Response(null, { status, headers: NO_STORE });

export async function POST(request: Request): Promise<Response> {
  try {
    if (Number(request.headers.get('content-length') ?? 0) > TRACK_MAX_BYTES) return done(413);
    const text = await request.text();
    // Bytes, not characters: a body without Content-Length (chunked) full of multi-byte text must not slip through.
    if (text.length > TRACK_MAX_BYTES || Buffer.byteLength(text, 'utf8') > TRACK_MAX_BYTES) return done(413);
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return done(400);
    }
    const tk = (body as { tk?: unknown } | null)?.tk;
    const tokenHash = tokenHashFrom(request.headers) ?? (isDeviceToken(tk) ? hashToken(tk) : null);
    const ctx = requestContext(request.headers, tokenHash);
    if (!allow('track', { tokenHash, ip: ctx.ip })) return done(429);
    const batch = cleanBatch(body, ctx.at, ctx.inApp);
    if (!batch) return done(400);
    // Crawlers and link-preview fetchers are not visitors. The operator's own admin pages are not tracked either.
    batch.events = batch.events.filter((e) => !e.path?.startsWith('/admin'));
    // The browser's language comes from the Accept-Language header, never from the body.
    if (ctx.language) for (const e of batch.events) if (e.name === 'session_start') e.props.lang = ctx.language;
    if (ctx.deviceType !== 'bot' && batch.events.length > 0) {
      const store = getStore();
      later(() => store.trackBatch(ctx, batch));
    }
    return done(204);
  } catch (e) {
    console.error('[api] POST /api/t', e instanceof Error ? e.message : e);
    return done(204); // analytics must never look like an error to the page
  }
}
