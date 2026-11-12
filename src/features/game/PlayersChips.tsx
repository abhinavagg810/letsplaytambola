import type { PublicPlayer } from '@/core';
import { Avatar } from '@/components';
import styles from './Live.module.css';

/** "Playing · N" and a chip (avatar + name) for everyone with a ticket. */
export function PlayersChips({ players }: { players: readonly PublicPlayer[] }) {
  return (
    <section className={styles.block}>
      <h2 className={styles.heading}>Playing · {players.length}</h2>
      <ul className={styles.chips}>
        {players.map((p) => (
          <li key={p.pid} className={styles.playerChip}>
            <Avatar name={p.name} color={p.color} size={32} />
            <span className={styles.playerName}>{p.name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
