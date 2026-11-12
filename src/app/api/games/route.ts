// POST /api/games — create a game. The device that creates it is the host.
import { createGameForDevice } from '@/server/games';
import { HTTP_COPY, clientIp, json, readJson, respond, serviceError } from '@/server/http';
import { allow } from '@/server/rateLimit';
import { tokenHashFrom } from '@/server/tokens';

export async function POST(request: Request): Promise<Response> {
  try {
    const tokenHash = tokenHashFrom(request.headers);
    if (!tokenHash) return respond(serviceError(401, 'no_token', HTTP_COPY.noToken));
    if (!allow('create', { tokenHash, ip: clientIp(request.headers) })) return respond(serviceError(429, 'rate_limited', HTTP_COPY.tooMany));
    const body = await readJson(request);
    if (!body) return respond(serviceError(400, 'bad_request', HTTP_COPY.badRequest));
    const result = await createGameForDevice(tokenHash, body);
    return result.ok ? json({ ok: true, code: result.code }, 201) : respond(result);
  } catch (e) {
    console.error('[api] POST /api/games', e);
    return respond(serviceError(500, 'server', HTTP_COPY.server));
  }
}
