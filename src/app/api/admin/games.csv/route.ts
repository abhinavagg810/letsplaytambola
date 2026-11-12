// GET /api/admin/games.csv?… — the plays table's current filter as a CSV file (all pages, up to 5,000 rows). Admin only.
import { requireAdminApi } from '@/server/admin/guard';
import { allGames, csvResponse, gamesCsv, parseGamesFilter } from '@/server/admin/queries';
import { istDay } from '@/server/admin/time';
import { json } from '@/server/http';

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;
  try {
    const now = Date.now();
    const filter = parseGamesFilter(new URL(request.url).searchParams, now);
    return csvResponse(gamesCsv(await allGames(filter, now), now), `letsplaytambola-plays-${istDay(now)}.csv`);
  } catch (e) {
    console.error('[api] GET /api/admin/games.csv', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
