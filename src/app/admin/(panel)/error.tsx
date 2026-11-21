'use client';
// Shown inside the admin frame when a page's numbers could not be loaded (the database did not answer, a query failed).
// Without this file the whole screen is replaced by the framework's bare "This page couldn't load" message.
import { useEffect } from 'react';
import styles from '@/features/admin/ui.module.css';

export default function AdminPageError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const digest = typeof error === 'object' && error !== null && 'digest' in error ? String((error as { digest?: unknown }).digest ?? '') : '';
  return (
    <div role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <h1 className={styles.pageTitle}>This page’s numbers couldn’t be loaded</h1>
      <div className={styles.warn}>
        <span className={styles.warnIcon} aria-hidden="true">!</span>
        <div>
          <b>Something went wrong while reading the data.</b> Nothing has been lost and the game itself is not affected. Try again in a moment; the other sections
          in the menu may still work. If it keeps happening, check that the database (Supabase) is running and that every file in{' '}
          <span className={styles.mono}>supabase/migrations</span> has been run, then look at the server log{digest ? <> for error <span className={styles.mono}>{digest}</span></> : null}.
        </div>
      </div>
      <button type="button" className={styles.btnPrimary} onClick={() => retry()}>Try again</button>
    </div>
  );
}
