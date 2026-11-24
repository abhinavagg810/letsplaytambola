import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { AdminChrome } from './Chrome';

/** The admin frame (sidebar, top bar, date range). Not the public header/footer. */
export function AdminShell({ email, minDay, maxDay, notice, badges, children }: { email: string; minDay: string; maxDay: string; notice?: ReactNode; badges?: Record<string, number>; children: ReactNode }) {
  return (
    // The frame reads the URL's query string (the date range), which needs a Suspense boundary.
    <Suspense fallback={null}>
      <AdminChrome email={email} minDay={minDay} maxDay={maxDay} badges={badges}>
        {notice}
        {children}
      </AdminChrome>
    </Suspense>
  );
}
