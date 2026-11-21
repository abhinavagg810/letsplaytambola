// GET /api/admin/players.csv?q=&played=&sort=&dir= — the devices table's current filter as a CSV file (up to 5,000 rows),
// including each device's latest IP address and approximate location. Admin only. Keep the file private.
import { allDevices, devicesCsv, parseDevicesFilter } from '@/server/admin/exports';
import { requireAdminApi } from '@/server/admin/guard';
import { csvResponse } from '@/server/admin/queries';
import { istDay } from '@/server/admin/time';
import { json } from '@/server/http';
import { getStore } from '@/server/store';

export async function GET(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;
  try {
    return csvResponse(devicesCsv(await allDevices(getStore(), parseDevicesFilter(new URL(request.url).searchParams))), `letsplaytambola-players-${istDay(Date.now())}.csv`);
  } catch (e) {
    console.error('[api] GET /api/admin/players.csv', e);
    return json({ ok: false, error: 'Something went wrong' }, 500);
  }
}
