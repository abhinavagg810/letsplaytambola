import { rupees } from '@/core';
import type { Prize, PublicPlayer } from '@/core';
import { Avatar } from '@/components';
import styles from './Live.module.css';

interface Props {
  players: readonly PublicPlayer[];
  prizes: readonly Prize[];
  hostName: string;
  /** pid of the host when the host also holds a ticket; null when the host only calls. */
  hostPid: string | null;
  youPid?: string;
  youAreHost: boolean;
}

/**
 * "Playing · N": one row per person — avatar, name, whether they are the host or a player, the prizes they have won and (when the game has a ticket price) the amount.
 * A host who only calls numbers (no ticket) is listed first. Never shows anyone's ticket or progress.
 */
export function PlayersChips({ players, prizes, hostName, hostPid, youPid, youAreHost }: Props) {
  const wonBy = (pid: string) => prizes.filter((p) => p.winnerPid === pid);
  return (
    <section className={styles.block}>
      <h2 className={styles.heading}>Playing · {players.length}</h2>
      <ul className={styles.list}>
        {hostPid === null ? (
          <li className={styles.row}>
            <span className={styles.person}>
              <Avatar name={hostName} color={0} size={40} />
              <span className={styles.rowText}>
                <span className={styles.rowLabel}>{hostName}</span>
                <span className={styles.rowRule}>Host · calling numbers{youAreHost ? ' · you' : ''}</span>
              </span>
            </span>
          </li>
        ) : null}
        {players.map((p) => {
          const won = wonBy(p.pid);
          const total = won.reduce((a, w) => a + (w.amount || 0), 0);
          const role = p.pid === hostPid ? 'Host' : 'Player';
          return (
            <li key={p.pid} className={styles.row}>
              <span className={styles.person}>
                <Avatar name={p.name} color={p.color} size={40} />
                <span className={styles.rowText}>
                  <span className={styles.rowLabel}>{p.name}</span>
                  <span className={styles.rowRule}>{role}{p.pid === youPid ? ' · you' : ''}</span>
                </span>
              </span>
              {won.length ? (
                <span className={styles.winnings}>
                  {total > 0 ? <span className={styles.wonTotal}>{rupees(total)}</span> : null}
                  <span className={total > 0 ? styles.wonPrizes : styles.won}>{won.map((w) => w.label).join(', ')}</span>
                </span>
              ) : (
                <span className={styles.open}>No wins yet</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
