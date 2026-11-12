// POST /api/admin/logout — sign out (clears the session cookie).
import { cookies } from 'next/headers';
import { ADMIN_COOKIE } from '@/server/admin/auth';
import { requireAdminApi, sessionCookieOptions } from '@/server/admin/guard';
import { json } from '@/server/http';

export async function POST(request: Request): Promise<Response> {
  const admin = await requireAdminApi(request, { mutation: true });
  // 404 (admin off) and the CSRF refusals go back as they are. Signed in or not, the cookie is cleared.
  if (admin instanceof Response && admin.status !== 401) return admin;
  (await cookies()).set(ADMIN_COOKIE, '', sessionCookieOptions(0));
  return admin instanceof Response ? admin : json({ ok: true });
}
