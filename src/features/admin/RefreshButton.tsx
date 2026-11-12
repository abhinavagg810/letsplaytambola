'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import styles from './admin.module.css';

/** Asks the server for this page again (the admin has no live connection to games). */
export function RefreshButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" className={styles.btn} onClick={() => start(() => router.refresh())} disabled={pending}>
      {pending ? 'Refreshing…' : 'Refresh'}
    </button>
  );
}
