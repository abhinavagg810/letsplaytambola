'use client';

import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { toast } from '@/components/Toast';
import { BAD_MOBILE, isIndianMobile, mobileDigits } from '@/core/phone';
import styles from './website.module.css';

const HINT = 'One message at launch. No spam, ever.';
const SAVE_FAILED = 'Couldn’t save your number. Please try again.';

/** "Notify me" — a 10-digit Indian mobile number, posted to /api/notify as `{ phone }`. */
export function NotifyForm() {
  const id = useId();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!isIndianMobile(phone)) {
      setError(BAD_MOBILE);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        // The server's own words when it has some ("Too many tries — please wait…", a number it does not accept).
        const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
        const message = typeof body?.error === 'string' ? body.error : SAVE_FAILED;
        if (res.status === 400) setError(message);
        else toast(message);
        return;
      }
      setDone(true);
      toast('You’re on the list!');
    } catch {
      toast(SAVE_FAILED);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className={styles.notifyDone} role="status">
        You’re on the list! We’ll WhatsApp you at +91 {phone}.
      </div>
    );
  }

  return (
    <form className={styles.notify} onSubmit={submit} noValidate>
      <label htmlFor={id} className={styles.notifyLabel}>
        Get a WhatsApp message the day it launches
      </label>
      <div className={styles.notifyRow}>
        <div className={styles.phoneBox}>
          <span className={styles.phonePrefix} aria-hidden="true">
            +91
          </span>
          <input
            id={id}
            className={styles.phoneInput}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Mobile number"
            value={phone}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            onChange={(e) => {
              const typed = e.target.value.replace(/\D/g, '');
              // A pasted or auto-filled number may carry +91 or a leading 0: drop it rather than cut off the last digits.
              setPhone(typed.length - phone.length > 1 ? mobileDigits(e.target.value).slice(0, 10) : typed.slice(0, 10));
              setError('');
            }}
          />
        </div>
        <Button type="submit" size={56} flat className={styles.notifyButton}>
          Notify me
        </Button>
      </div>
      <span id={`${id}-hint`} className={error ? styles.notifyError : styles.notifyHint} role={error ? 'alert' : undefined}>
        {error || HINT}
      </span>
    </form>
  );
}
