// The one place that decides whether a request is the signed-in admin. Every admin page and every admin API
// route calls it on every request (the pages do not rely on a proxy/middleware).
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { NO_STORE } from '../http';
import { ADMIN_COOKIE, ADMIN_SESSION_MS, adminConfig, isJsonRequest, sameOrigin, verifySessionToken } from './auth';

export interface AdminSession {
  /** The configured admin email (for "signed in as"). */
  email: string;
  /** When this sign-in ends (epoch ms). */
  exp: number;
}

export const ADMIN_LOGIN_PATH = '/admin/login';

/** Reads the session cookie. Null when the admin area is off, or there is no valid, unexpired session. */
export async function getAdminSession(): Promise<AdminSession | null> {
  // Wait for a real request first: the caller is then rendered per request (never at build time, never cached),
  // and reading the clock below is allowed.
  await connection();
  const jar = await cookies();
  const cfg = adminConfig();
  if (!cfg) return null;
  const session = verifySessionToken(jar.get(ADMIN_COOKIE)?.value);
  return session ? { email: cfg.email, exp: session.exp } : null;
}

/**
 * For admin PAGES. `{ off: true }` when ADMIN_EMAIL / ADMIN_PASSWORD are not set (show <AdminOff />);
 * redirects to the sign-in page when nobody is signed in; otherwise the session and the request time.
 */
export async function requireAdmin(): Promise<{ off: true } | { off: false; session: AdminSession; now: number }> {
  const session = await getAdminSession();
  if (!adminConfig()) return { off: true };
  if (!session) redirect(ADMIN_LOGIN_PATH);
  // `now`: the time of this request, for the page to work with (pages must not read the clock while rendering).
  return { off: false, session, now: Date.now() };
}

const apiError = (status: number, error: string): Response => Response.json({ ok: false, error }, { status, headers: NO_STORE });

/** The CSRF checks every state-changing admin API makes: a JSON body and an Origin header that names this site. */
export function checkMutation(request: Request): Response | null {
  if (!isJsonRequest(request)) return apiError(415, 'Send JSON');
  if (!sameOrigin(request)) return apiError(403, 'Wrong origin');
  return null;
}

/**
 * For admin API routes. Returns a Response to send back (404 when the admin area is off, 401 when not signed in,
 * 403/415 for a state-changing request that fails the CSRF checks) or the session.
 */
export async function requireAdminApi(request: Request, opts: { mutation?: boolean } = {}): Promise<Response | AdminSession> {
  const session = await getAdminSession();
  if (!adminConfig()) return apiError(404, 'Not found');
  if (opts.mutation) {
    const refused = checkMutation(request);
    if (refused) return refused;
  }
  return session ?? apiError(401, 'Sign in first');
}

export const sessionCookieOptions = (maxAgeSeconds: number = Math.floor(ADMIN_SESSION_MS / 1000)) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: maxAgeSeconds,
});
