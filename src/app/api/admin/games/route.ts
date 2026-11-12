// GET /api/admin/games?q=&status=&from=&to=&sort=&dir=&page= — one page of the plays table as JSON. Admin only.
import { requireAdminApi } from '@/server/admin/guard';
import { PAGE_SIZE, gamesQuery, parseGamesFilter } from '@/server/admin/queries';
import { gameFacts } from '@/server/admin/stats';
import { json } from '@/server/http';
import { getStore } from '@/server/store';

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;
  try {
    const now = Date.now();
    const filter = parseGamesFilter(new URL(request.url).searchParams, now);
    const page = await getStore().adminListGames(gamesQuery(filter, now));
    return json({ ok: true, total: page.total, page: filter.page, pageSize: PAGE_SIZE, games: page.rows.map((r) => gameFacts(r, now)) });
  } catch (e) {
    console.error('[api] GET /api/admin/games', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
