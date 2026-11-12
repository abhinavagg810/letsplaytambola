// POST /api/admin/login { email, password } — sign the admin in (sets the session cookie).
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, LOGIN_ERROR, LOGIN_FAIL_DELAY_MS, adminConfigured, attemptLogin } from '@/server/admin/auth';
import { checkMutation, sessionCookieOptions } from '@/server/admin/guard';
import { clientIp, json, readJson } from '@/server/http';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request): Promise<Response> {
  try {
    const jar = await cookies();
    if (!adminConfigured()) return json({ ok: false, error: 'Not found' }, 404);
    const refused = checkMutation(request);
    if (refused) return refused;
    const body = await readJson(request, 2048);
    const result = attemptLogin(body?.email, body?.password, clientIp(request.headers));
    if (!result.ok) {
      // The same answer, after the same wait, whatever was wrong.
      await sleep(LOGIN_FAIL_DELAY_MS);
      return json({ ok: false, error: result.error }, result.status);
    }
    jar.set(ADMIN_COOKIE, result.token, sessionCookieOptions(result.maxAgeSeconds));
    return json({ ok: true });
  } catch (e) {
    // Never log the request body.
    console.error('[api] POST /api/admin/login', e instanceof Error ? e.message : 'error');
    return json({ ok: false, error: LOGIN_ERROR }, 500);
  }
}
