// The admin area (/admin/*): for the site's operator only. See docs/ADMIN.md.
// Not linked from the public site, not in the sitemap, disallowed in robots.txt, and never cached:
// every page reads the session cookie first, so it is rendered per request (Cache-Control: no-store).
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s — Admin' },
  description: 'Operator pages.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  openGraph: null,
  twitter: null,
  alternates: null,
};

// These pages wait for the signed-in check on purpose: there is no public shell to show first.
export const instant = false;

export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return children;
}
