'use client';
// Join with a code (/join): type the code (or paste the whole link) → the game page.
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button, Input, toast } from '@/components';
import { keepInView } from '@/features/host/nav';
import { normaliseCode } from '@/lib/share';
import styles from './join.module.css';

/** Letters and digits only, upper case, at most 6. A pasted link gives its code. */
function clean(value: string): string {
  return /[/.=]/.test(value) ? normaliseCode(value) : value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function JoinByCode() {
  const router = useRouter();
  const [code, setCode] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code) {
      toast('Type the game code');
      return;
    }
    router.push(`/g/${code}`);
  }

  return (
    <div className={styles.page}>
      <form className={styles.card} onSubmit={onSubmit} noValidate>
        <span className={styles.kicker}>Have a code?</span>
        <h1 className={styles.title}>Join a game</h1>
        <p className={styles.text}>Type the 5-letter code from your host. Or just tap the link they sent you.</p>
        <Input
          variant="code"
          size={62}
          tone="bg"
          value={code}
          onChange={(e) => setCode(clean(e.target.value))}
          onFocus={keepInView}
          placeholder="e.g. K7RQ2"
          aria-label="Game code"
          inputMode="text"
          enterKeyHint="go"
          name="code"
        />
        <Button type="submit" variant="cream" size={60} block fontSize={20}>
          Find my game
        </Button>
      </form>

      <section className={`${styles.card} ${styles.cardHost}`}>
        <span className={styles.kicker}>Free · No sign-up</span>
        <h2 className={styles.title}>Host your own</h2>
        <p className={styles.text}>Type your name, pick ways to win, share the link on WhatsApp. Everyone else just types their name.</p>
        <Button href="/host" variant="ink" size={60} block fontSize={20} className={styles.hostButton}>
          Host a game
        </Button>
      </section>
    </div>
  );
}
