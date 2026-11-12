// Runs before a request reaches the admin pages (Next.js 16 "proxy", formerly middleware).
//
// Why it exists: this app streams its pages, and a streamed page has already answered "200" by the time
// its own signed-in check runs — a redirect() from the page then travels inside the HTML. Checking here
// first gives a signed-out visitor a real HTTP redirect to the sign-in page, and adds "noindex" headers.
//
// This is a convenience, not the lock: every admin page and every admin API route still verifies the
// session itself on every request (requireAdmin / requireAdminApi in src/server/admin/guard.ts).
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ADMIN_COOKIE, adminConfigured, verifySessionToken } from '@/server/admin/auth';

const LOGIN = '/admin/login';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // With the admin switched off, the pages show their plain "not set up" message.
  if (adminConfigured() && pathname !== LOGIN && !verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value)) {
    const res = NextResponse.redirect(new URL(LOGIN, request.url), 307);
    res.headers.set('Cache-Control', 'no-store, max-age=0');
    res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return res;
  }
  const res = NextResponse.next();
  res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export const config = {
  // Admin pages only. The admin API routes answer 401/404 themselves.
  matcher: ['/admin', '/admin/:path*'],
};
