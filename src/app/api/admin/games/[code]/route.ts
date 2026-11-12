// GET /api/admin/games/CODE — one game as the admin sees it: the public document, anonymous device ids, no tickets. Admin only.
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
    const row = isGameCode(code) ? await getStore().adminGetGame(code) : null;
    if (!row) return json({ ok: false, error: 'No such game' }, 404);
    return json({ ok: true, game: row, facts: gameFacts(row, Date.now()) });
  } catch (e) {
    console.error('[api] GET /api/admin/games/[code]', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
