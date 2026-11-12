import { calloutFor } from '@/core';
import type { MemberView } from '@/core';
import { Ball, Card } from '@/components';
import styles from './Live.module.css';

/** The caller: the ball, "N OF 90 CALLED", the callout and the five numbers before it. */
export function CallerCard({ game }: { game: MemberView }) {
  const { called } = game;
  const last = called.length ? called[called.length - 1] : null;
  const callout = last
    ? calloutFor(last)
    : game.you.role === 'host'
      ? 'Tap “Call next number” to begin'
      : `Waiting for ${game.hostName} to call`;
  const recent = called.slice(-6, -1).reverse();
  return (
    <Card radius={26} dottedTop as="section" aria-label="Caller">
      <div className={styles.callerMain}>
        <Ball number={last ?? '–'} label={last ? `Number ${last}` : 'No number yet'} />
        <div className={styles.callerText} aria-live="polite" aria-atomic="true">
          <span className={styles.count}>{called.length} OF 90 CALLED</span>
          <span className={styles.callout}>{callout}</span>
        </div>
      </div>
      <div className={styles.before}>
        <span className={styles.beforeLabel}>Before:</span>
        {recent.map((n) => (
          <span key={n} className={styles.chip}>
            {n}
          </span>
        ))}
      </div>
    </Card>
  );
}
