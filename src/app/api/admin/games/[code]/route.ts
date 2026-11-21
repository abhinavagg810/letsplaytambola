// GET /api/admin/games/CODE — one game as the admin sees it: the public document, anonymous device ids, people's IP / place / device, no tickets. Admin only.
import { isGameCode } from '@/core';
import { requireAdminApi } from '@/server/admin/guard';
import { gameFacts } from '@/server/admin/stats';
import { json } from '@/server/http';
import { getStore } from '@/server/store';

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;
  try {
    const code = (await params).code.trim().toUpperCase();
    const store = getStore();
    const row = isGameCode(code) ? await store.adminGetGame(code) : null;
    if (!row) return json({ ok: false, error: 'No such game' }, 404);
    // `insights`: who created / joined from where and on what, and the usage events around the game. Admin only.
    return json({ ok: true, game: row, facts: gameFacts(row, Date.now()), insights: await store.gameInsights(code) });
  } catch (e) {
    console.error('[api] GET /api/admin/games/[code]', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
