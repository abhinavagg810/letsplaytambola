'use client';
// Mounted once in the root layout: starts the first-party usage tracking (src/lib/track.ts) and counts page views.
// Renders nothing. Does nothing on the admin pages.
import { usePathname } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { startTracking, trackPage } from './track';

function Tracker() {
  const pathname = usePathname();
  useEffect(() => {
    startTracking();
    if (pathname) trackPage(pathname);
  }, [pathname]);
  return null;
}

export function TrackPageViews() {
  // The path of a dynamic route (/g/CODE) is only known per request: the boundary keeps the rest of the page prerendered.
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
