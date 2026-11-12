'use client';
// Title row of the game page: kicker + game name, and the Code / Copy link / Sound pills.
import { Pill, toast } from '@/components';
import type { MemberView } from '@/core';
import { copy, gameUrl } from '@/lib/share';
import { useMuted } from '@/lib/useMuted';
import styles from './game.module.css';

/** Copy the game link and say so (prototype copy). */
export async function copyGameLink(code: string): Promise<void> {
  const link = gameUrl(code);
  toast((await copy(link)) ? 'Link copied' : `Copy: ${link}`);
}

export function GameHeader({ game }: { game: Pick<MemberView, 'code' | 'name' | 'hostName' | 'you'> }) {
  const [muted, setMuted] = useMuted();
  const kicker = game.you.role === 'host' ? 'You’re hosting' : `${game.hostName}’s game`;
  return (
    <div className={styles.titleRow}>
      <div className={styles.titleText}>
        <span className={styles.kicker}>{kicker}</span>
        <h1 className={styles.gameName}>{game.name}</h1>
      </div>
      <div className={styles.titleActions}>
        <span className={styles.codePill}>
          Code <b className={styles.code}>{game.code}</b>
        </span>
        <Pill className={styles.titlePill} onClick={() => void copyGameLink(game.code)}>
          Copy link
        </Pill>
        <Pill className={styles.titlePill} onClick={() => setMuted(!muted)} aria-label={muted ? 'Sound off. Turn sound on' : 'Sound on. Turn sound off'}>
          {muted ? 'Sound off' : 'Sound on'}
        </Pill>
      </div>
    </div>
  );
}
