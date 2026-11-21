// POST /api/games/CODE/act — one action: join, start, draw, setAuto, mark, claim, newRound.
import { after } from 'next/server';
import { isMember } from '@/core';
import { actOnGame, normaliseCodeParam } from '@/server/games';
import { HTTP_COPY, clientIp, json, readJson, respond, serviceError } from '@/server/http';
import { noteParticipation, noteWin } from '@/server/insights/record';
import { allow } from '@/server/rateLimit';
import { broadcastChanged } from '@/server/realtime';
import { tokenHashFrom } from '@/server/tokens';

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  try {
    const { code } = await params;
    const tokenHash = tokenHashFrom(request.headers);
    if (!tokenHash) return respond(serviceError(401, 'no_token', HTTP_COPY.noToken));
    const body = await readJson(request);
    if (!body || typeof body.type !== 'string') return respond(serviceError(400, 'bad_request', HTTP_COPY.badRequest));
    const who = { tokenHash, ip: clientIp(request.headers) };
    if (!allow(body.type === 'join' ? 'join' : 'act', who)) return respond(serviceError(429, 'rate_limited', HTTP_COPY.tooMany));

    const result = await actOnGame(code, tokenHash, body);
    if (!result.ok) return respond(result);
    const { changedVersion, game } = result;
    if (changedVersion !== null) {
      // Tell everyone else to refetch — after this response has gone out, so the actor is never kept waiting.
      after(() => broadcastChanged(normaliseCodeParam(code), changedVersion));
    }
    // For the operator's admin only (recorded after the response; never part of any view): a new seat, a prize won.
    if (changedVersion !== null && body.type === 'join' && game.you.role === 'player') {
      noteParticipation(request.headers, tokenHash, { code: game.code, role: 'player', pid: game.you.pid, name: game.you.name });
    } else if (changedVersion !== null && body.type === 'claim' && isMember(game)) {
      const prize = game.prizes.find((p) => p.id === body.prizeId);
      if (prize) noteWin(tokenHash, prize.amount);
    }
    return json({ ok: true, game });
  } catch (e) {
    console.error('[api] POST /api/games/[code]/act', e);
    return respond(serviceError(500, 'server', HTTP_COPY.server));
  }
}
