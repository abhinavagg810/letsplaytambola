// POST /api/notify — "Notify me" on the website: remember a WhatsApp number for the app launch.
import { saveNotifyNumber } from '@/server/games';
import { HTTP_COPY, clientIp, readJson, respond, serviceError } from '@/server/http';
import { allow } from '@/server/rateLimit';
import { tokenHashFrom } from '@/server/tokens';

export async function POST(request: Request): Promise<Response> {
  try {
    // The device token is optional here; without one the limit is per address only.
    const who = { tokenHash: tokenHashFrom(request.headers), ip: clientIp(request.headers) };
    if (!allow('notify', who)) return respond(serviceError(429, 'rate_limited', HTTP_COPY.tooMany));
    const body = await readJson(request);
    if (!body) return respond(serviceError(400, 'bad_request', HTTP_COPY.badRequest));
    return respond(await saveNotifyNumber(body.phone));
  } catch (e) {
    console.error('[api] POST /api/notify', e);
    return respond(serviceError(500, 'server', HTTP_COPY.server));
  }
}
