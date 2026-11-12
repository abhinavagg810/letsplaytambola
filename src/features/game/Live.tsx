'use client';
import { useState, type JSX } from 'react';
import type { MemberView } from '@/core';
import { Board } from '@/components';
import { useAutoCall } from '@/lib/useAutoCall';
import type { useGame } from '@/lib/useGame';
import { CallerCard } from './CallerCard';
import { ClaimSheet } from './ClaimSheet';
import { HostControls } from './HostControls';
import { MyTicket } from './MyTicket';
import { PlayersChips } from './PlayersChips';
import { WaysToWin } from './WaysToWin';
import { WinBanner } from './WinBanner';
import { useGameEvents } from './useGameEvents';
import styles from './Live.module.css';

/**
 * The live game for a host or player. Two columns on wide screens; stacked on a phone in this order:
 * caller, host controls, ticket, ways to win, board, players. The title row is drawn by the page above this.
 */
export function Live({ game, act, serverNow }: { game: MemberView; act: ReturnType<typeof useGame>['act']; serverNow: () => number }): JSX.Element {
  const [claimOpen, setClaimOpen] = useState(false);
  useAutoCall(game, act, serverNow);
  useGameEvents(game, serverNow);

  const { you, called } = game;
  const isHost = you.role === 'host';
  const last = called.length ? called[called.length - 1] : null;

  return (
    <>
      <div className={styles.grid}>
        <div className={styles.col}>
          <CallerCard game={game} />
          {isHost ? <HostControls game={game} act={act} /> : null}
          {you.ticket ? <MyTicket name={you.name} ticket={you.ticket} marks={you.marks ?? []} act={act} onClaim={() => setClaimOpen(true)} /> : null}
          {/* Ways to win sits under the ticket (or under the caller when there is no ticket); board and players fill the other column. */}
          <WaysToWin prizes={game.prizes} youPid={you.pid} />
        </div>
        <div className={styles.col}>
          <section className={styles.boardCard}>
            <div className={styles.boardHead}>
              <h2 className={styles.heading}>The board</h2>
              <span className={styles.boardCount}>{called.length} OF 90 CALLED</span>
            </div>
            <Board called={called} latest={last} />
          </section>
          <PlayersChips players={game.players} prizes={game.prizes} hostName={game.hostName} hostPid={game.hostPid} youPid={you.pid} youAreHost={isHost} />
        </div>
      </div>
      {you.ticket ? <ClaimSheet open={claimOpen} onClose={() => setClaimOpen(false)} prizes={game.prizes} act={act} /> : null}
      <WinBanner code={game.code} />
    </>
  );
}
