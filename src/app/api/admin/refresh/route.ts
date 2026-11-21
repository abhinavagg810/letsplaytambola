// POST /api/admin/refresh {} — forget the server's short-lived cache of aggregates, so the next page render is fresh. Admin only.
import { clearAdminCache } from '@/server/admin/cache';
import { requireAdminApi } from '@/server/admin/guard';
import { json } from '@/server/http';

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request, { mutation: true });
  if (admin instanceof Response) return admin;
  clearAdminCache();
  return json({ ok: true });
}
