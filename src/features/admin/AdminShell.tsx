import { Suspense } from 'react';
import type { ReactNode } from 'react';
import { AdminChrome } from './Chrome';

/** The admin frame (sidebar, top bar, date range). Not the public header/footer. */
export function AdminShell({ email, minDay, maxDay, notice, children }: { email: string; minDay: string; maxDay: string; notice?: ReactNode; children: ReactNode }) {
  return (
    // The frame reads the URL's query string (the date range), which needs a Suspense boundary.
    <Suspense fallback={null}>
      <AdminChrome email={email} minDay={minDay} maxDay={maxDay}>
        {notice}
        {children}
      </AdminChrome>
    </Suspense>
  );
}
