'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { cx } from '@/components/cx';
import styles from './admin.module.css';

/** Email + password. Enter submits (it is a real form); the error text is announced to screen readers. */
export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        // A full page load, so the first admin page is rendered with the new cookie.
        // On purpose a full page load, not the client router: nothing of the previous state stays in memory.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/admin');
        return;
      }
      setError(data?.error || 'Something went wrong — please try again');
    } catch {
      setError('Could not reach the server — please try again');
    }
    setPassword('');
    setBusy(false);
  }

  return (
    <form className={styles.loginCard} onSubmit={submit} noValidate>
      <div>
        <h1 className={styles.loginTitle}>Admin sign in</h1>
        <p className={styles.loginSub} style={{ marginTop: 8 }}>For the person who runs Letsplaytambola.</p>
      </div>
      <label className={styles.loginField}>
        Email
        <input
          className={styles.loginInput}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className={styles.loginField}>
        Password
        <span className={styles.passwordRow}>
          <input
            className={styles.loginInput}
            type={show ? 'text' : 'password'}
            name="password"
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          <button type="button" className={styles.showBtn} onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? 'Hide' : 'Show'}
          </button>
        </span>
      </label>
      <p className={styles.loginError} role="alert" aria-live="assertive">{error}</p>
      <button type="submit" className={cx(styles.btnPrimary, styles.loginSubmit)} disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
