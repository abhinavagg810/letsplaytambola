// "We can't find game K7RQ2" — an unknown or expired code.
import { Button } from '@/components';
import styles from './game.module.css';

export function NotFound({ code }: { code: string }) {
  return (
    <div className={styles.missing}>
      <h1 className={styles.missingTitle}>We can’t find game {code}</h1>
      <p className={styles.missingText}>Check the code with whoever sent you the link.</p>
      <Button href="/join" size={58} block flat>
        Try another code
      </Button>
    </div>
  );
}
