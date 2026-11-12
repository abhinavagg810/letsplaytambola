'use client';

import { useSyncExternalStore } from 'react';
import styles from './Toast.module.css';

/** How long a toast stays up (README: 2.4 seconds). */
export const TOAST_MS = 2400;

interface ToastState {
  id: number;
  message: string;
}

let current: ToastState | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

/**
 * Shows a short message in the cream pill at the bottom centre for 2.4 seconds.
 * Call from any client code: `toast('Type your name first')`. A new toast replaces the old one.
 * Needs `<Toaster />` mounted once (it is, in the root layout).
 */
export function toast(message: string): void {
  if (timer) clearTimeout(timer);
  current = { id: ++seq, message };
  emit();
  timer = setTimeout(() => {
    current = null;
    emit();
  }, TOAST_MS);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

/** The toast outlet. Mounted once in `src/app/layout.tsx`; do not add another. */
export function Toaster() {
  const t = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
      {t ? (
        <div key={t.id} className={styles.toast}>
          {t.message}
        </div>
      ) : null}
    </div>
  );
}
