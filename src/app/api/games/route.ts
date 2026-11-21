// POST /api/games — create a game. The device that creates it is the host.
import { createGameForDevice } from '@/server/games';
import { HTTP_COPY, clientIp, json, readJson, respond, serviceError } from '@/server/http';
import { noteParticipation } from '@/server/insights/record';
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
    if (!result.ok) return respond(result);
    // For the operator's admin only: where and on what the game was created. Recorded after the response; never sent to a browser.
    noteParticipation(request.headers, tokenHash, { code: result.code, role: 'host', pid: result.hostPid, name: result.hostName });
    return json({ ok: true, code: result.code }, 201);
  } catch (e) {
    console.error('[api] POST /api/games', e);
    return respond(serviceError(500, 'server', HTTP_COPY.server));
  }
}
