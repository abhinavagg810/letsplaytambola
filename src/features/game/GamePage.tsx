'use client';
// The game page (/g/CODE): picks the screen from the game's status and who this device is.
import { useEffect } from 'react';
import { toast } from '@/components';
import { isVisitor } from '@/core';
import { useGame } from '@/lib/useGame';
import { GameHeader } from './GameHeader';
import { FinishedCard, JoinCard } from './JoinCard';
import { Live } from './Live';
import { Lobby } from './Lobby';
import { NotFound } from './NotFound';
import { Results } from './Results';
import styles from './game.module.css';

/** Quiet placeholder while the first view loads (also the Suspense fallback of the route). */
export function GameSkeleton() {
  return (
    <div className={`${styles.page} ${styles.skeleton}`} aria-busy="true">
      <span className="visually-hidden" role="status">
        Loading the game…
      </span>
      <div className={styles.titleRow} aria-hidden="true">
        <div className={styles.titleText}>
          <span className={`${styles.bone} ${styles.boneKicker}`} />
          <span className={`${styles.bone} ${styles.boneTitle}`} />
        </div>
      </div>
      <div className={styles.grid} aria-hidden="true">
        <div className={`${styles.bone} ${styles.boneCard}`} />
        <div className={`${styles.bone} ${styles.boneCardSmall}`} />
      </div>
    </div>
  );
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function GamePage({ code: rawCode }: { code: string }) {
  const code = safeDecode(rawCode).trim().toUpperCase();
  const { game, act, serverNow, error } = useGame(code);

  // The last view stays on screen while the server cannot be reached; say so once.
  useEffect(() => {
    if (error) toast(error);
  }, [error]);

  if (game === undefined) return <GameSkeleton />;
  if (game === null) return <NotFound code={code.replace(/[^A-Z0-9]/g, '').slice(0, 12)} />;
  if (isVisitor(game)) return game.status === 'done' ? <FinishedCard game={game} /> : <JoinCard game={game} act={act} />;

  return (
    <div className={styles.page}>
      <GameHeader game={game} />
      {game.status === 'lobby' ? <Lobby game={game} act={act} /> : game.status === 'live' ? <Live game={game} act={act} serverNow={serverNow} /> : <Results game={game} act={act} />}
    </div>
  );
}
