'use client';
import { useRef, type JSX } from 'react';
import { rupees, type MemberView } from '@/core';
import { Button, Card, toast } from '@/components';
import { AdSlot } from '@/components/AdSlot';
import { useGame } from '@/lib/useGame';
import { WinBanner } from './WinBanner';
import { useGameEvents } from './useGameEvents';
import styles from './Results.module.css';

/** The round is over: who won what, and what next. The title row is drawn by the page above this. */
export function Results({ game, act }: { game: MemberView; act: ReturnType<typeof useGame>['act'] }): JSX.Element {
  // Same shared connection as the page; only the server clock is needed here.
  const { serverNow } = useGame(game.code);
  // The last win of the round arrives together with "done": it still gets its banner and voice here.
  useGameEvents(game, serverNow);

  const { you } = game;
  const isHost = you.role === 'host';
  const starting = useRef(false);

  const playAgain = async () => {
    if (starting.current) return;
    starting.current = true;
    try {
      const r = await act({ type: 'newRound' });
      if (!r.ok) toast(r.error);
    } finally {
      starting.current = false;
    }
  };

  return (
    <>
      <div className={styles.grid}>
        <div className={styles.main}>
          <h2 className={styles.title}>That’s the game!</h2>
          <p className={styles.note}>
            {game.called.length} OF 90 CALLED. Settle any prize money between yourselves — the app never handles payments.
          </p>
          {isHost ? (
            <Button size={64} flat block fontSize={20} onClick={playAgain}>
              Play again with same people
            </Button>
          ) : (
            <Card tone="note" radius={18} className={styles.stay}>
              Stay on this page — if {game.hostName} starts another round, you’ll get a fresh ticket.
            </Card>
          )}
          <Button href="/host" variant="outline" size={54} block>
            Host my own game
          </Button>
        </div>
        <section className={styles.winners}>
          <h2 className={styles.heading}>Winners</h2>
          <ul className={styles.list}>
            {game.prizes.map((p) => (
              <li key={p.id} className={styles.row}>
                <span className={styles.prize}>{p.label}</span>
                <span className={p.winnerName ? styles.won : styles.open}>
                  {p.winnerName ? p.winnerName + (you.pid && p.winnerPid === you.pid ? ' (you)' : '') + (p.amount > 0 ? ' · ' + rupees(p.amount) : '') : 'Open'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {/* The game is over here, so an ad is allowed. Never during play. */}
      <AdSlot placement="results" />
      <WinBanner code={game.code} />
    </>
  );
}
