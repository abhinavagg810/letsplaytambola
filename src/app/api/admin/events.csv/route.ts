// GET /api/admin/events.csv?range=&from=&to=&name=&device=&code=&session= — the events explorer's current filter as a CSV file (up to 5,000 rows). Admin only.
import { allEvents, eventsCsv, parseEventsFilter } from '@/server/admin/exports';
import { requireAdminApi } from '@/server/admin/guard';
import { csvResponse } from '@/server/admin/queries';
import { parseRange } from '@/server/admin/range';
import { istDay } from '@/server/admin/time';
import { json } from '@/server/http';
import { getStore } from '@/server/store';

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;
  try {
    const now = Date.now();
    const params = new URL(request.url).searchParams;
    const range = parseRange(params, now);
    return csvResponse(eventsCsv(await allEvents(getStore(), parseEventsFilter(params), range.from, range.to)), `letsplaytambola-events-${istDay(now)}.csv`);
  } catch (e) {
    console.error('[api] GET /api/admin/events.csv', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
