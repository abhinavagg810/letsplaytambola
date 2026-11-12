// GET /api/games/CODE — this device's view of the game (host / player / visitor).
import { viewGame } from '@/server/games';
import { HTTP_COPY, clientIp, respond, serviceError } from '@/server/http';
import { allow } from '@/server/rateLimit';
import { tokenHashFrom } from '@/server/tokens';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const { code } = await params;
    // Reading the request headers also makes this handler run per request (never prerendered or cached).
    const tokenHash = tokenHashFrom(request.headers);
    if (!allow('view', { tokenHash, ip: clientIp(request.headers) })) return respond(serviceError(429, 'rate_limited', HTTP_COPY.tooMany));
    return respond(await viewGame(code, tokenHash));
  } catch (e) {
    console.error('[api] GET /api/games/[code]', e);
    return respond(serviceError(500, 'server', HTTP_COPY.server));
  }
}
