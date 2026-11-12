'use client';

import { useState } from 'react';
import styles from './admin.module.css';

/** Ends the session on the server, then goes to the sign-in page with a full page load (nothing stays in memory). */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    try {
      await fetch('/api/admin/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', cache: 'no-store' });
    } catch {
      // Even if the network failed, leave the admin pages.
    }
    // On purpose a full page load, not the client router: nothing of the previous state stays in memory.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/admin/login');
  }
  return (
    <button type="button" className={styles.btn} onClick={signOut} disabled={busy}>
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
