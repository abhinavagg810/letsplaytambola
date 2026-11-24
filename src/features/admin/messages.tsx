'use client';
// Admin → Messages: the per-message actions (mark read / unread, delete with a confirm). POSTs to /api/admin/messages.
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import styles from './ui.module.css';

async function send(action: 'read' | 'unread' | 'delete', id: number): Promise<string | null> {
  try {
    const res = await fetch('/api/admin/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id }), cache: 'no-store' });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return res.ok && data?.ok ? null : data?.error || 'Something went wrong — nothing was changed';
  } catch {
    return 'Could not reach the server — nothing was changed';
  }
}

export function MessageActions({ id, read, who }: { id: number; read: boolean; who: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);

  const run = async (action: 'read' | 'unread' | 'delete') => {
    setBusy(true);
    setError('');
    const problem = await send(action, id);
    setBusy(false);
    if (action === 'delete') dialog.current?.close();
    if (problem) setError(problem);
    else router.refresh();
  };

  return (
    <div className={styles.msgActions}>
      <button type="button" className={styles.miniBtn} onClick={() => run(read ? 'unread' : 'read')} disabled={busy}>
        {read ? 'Mark unread' : 'Mark read'}
      </button>
      <button type="button" className={`${styles.miniBtn} ${styles.miniDanger}`} onClick={() => dialog.current?.showModal()} disabled={busy}>
        Delete…
      </button>
      {error ? <span className={styles.formError} role="alert">{error}</span> : null}
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={`del-${id}`}>
        <h2 id={`del-${id}`} className={styles.dialogTitle}>Delete this message?</h2>
        <p>The message from <b>{who}</b> is deleted for good. An audit line keeps only its number and topic.</p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.btn} onClick={() => dialog.current?.close()} disabled={busy} autoFocus>Cancel</button>
          <button type="button" className={styles.dangerBtn} onClick={() => run('delete')} disabled={busy}>{busy ? 'Deleting…' : 'Delete for good'}</button>
        </div>
      </dialog>
    </div>
  );
}
