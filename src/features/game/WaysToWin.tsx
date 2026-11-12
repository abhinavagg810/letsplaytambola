import { ruleDesc, rupees } from '@/core';
import type { Prize } from '@/core';
import styles from './Live.module.css';

/** Ways to win with who has won each: "Open" or the winner's name (plus " (you)"). */
export function WaysToWin({ prizes, youPid }: { prizes: readonly Prize[]; youPid?: string }) {
  return (
    <section className={styles.block}>
      <h2 className={styles.heading}>Ways to win</h2>
      <ul className={styles.list}>
        {prizes.map((p) => (
          <li key={p.id} className={styles.row}>
            <span className={styles.rowText}>
              <span className={styles.rowLabel}>{p.label}</span>
              <span className={styles.rowRule}>
                {p.amount > 0 ? <strong className={styles.amount}>{rupees(p.amount)} · </strong> : null}
                {ruleDesc(p.rule)}
              </span>
            </span>
            <span className={p.winnerName ? styles.won : styles.open}>
              {p.winnerName ? p.winnerName + (youPid && p.winnerPid === youPid ? ' (you)' : '') : 'Open'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
