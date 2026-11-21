// POST /api/admin/erase { device } — erase one device: its device row, IP addresses, events and per-game place/device
// details are deleted, and the names it typed are replaced in stored game summaries. Writes one audit line. Admin only;
// JSON + same-origin only (CSRF), like every state-changing admin route.
import { clearAdminCache } from '@/server/admin/cache';
import { requireAdminApi } from '@/server/admin/guard';
import { json, readJson } from '@/server/http';
import { getStore } from '@/server/store';

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request, { mutation: true });
  if (admin instanceof Response) return admin;
  try {
    const body = await readJson(request, 1024);
    const device = typeof body?.device === 'string' ? body.device.trim().toLowerCase() : '';
    if (!/^[0-9a-f]{8}$/.test(device)) return json({ ok: false, error: 'A device id is 8 characters: digits and the letters a to f' }, 400);
    const result = await getStore().eraseDevice(device);
    clearAdminCache();
    return json({ ok: true, result });
  } catch (e) {
    console.error('[api] POST /api/admin/erase', e instanceof Error ? e.message : e);
    const needsMigration = e instanceof Error && /0003_insights/.test(e.message);
    return json({ ok: false, error: needsMigration ? 'Run supabase/migrations/0003_insights.sql first — nothing was erased' : 'Something went wrong — nothing was erased' }, needsMigration ? 409 : 500);
  }
}
