'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { normalizeCode } from './code';
import styles from './website.module.css';

/** "Got a game code?" — code input + Join. Opens /g/CODE (or /join when empty). */
export function CodeBox() {
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    router.push(code ? `/g/${code}` : '/join');
  };

  return (
    <form className={styles.codeBox} onSubmit={submit}>
      <label htmlFor={id} className={styles.codeLabel}>
        Got a game code?
      </label>
      <div className={styles.codeRow}>
        <Input
          id={id}
          variant="code"
          size={56}
          fontSize={20}
          className={styles.codeInput}
          placeholder="e.g. K7RQ2"
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          enterKeyHint="go"
        />
        <Button type="submit" variant="cream" size={56}>
          Join
        </Button>
      </div>
    </form>
  );
}
