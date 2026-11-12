'use client';
// Lobby: the host shares the link and starts the game; players see "You're in!" and their ticket.
import { useRef, useState } from 'react';
import { Avatar, Button, Pill, Ticket, toast } from '@/components';
import { ruleDesc, type MemberView } from '@/core';
import { inviteText, whatsappUrl } from '@/lib/share';
import { unlockSpeech } from '@/lib/speech';
import type { UseGame } from '@/lib/useGame';
import { copyGameLink } from './GameHeader';
import styles from './game.module.css';

export function Lobby({ game, act }: { game: MemberView; act: UseGame['act'] }) {
  const isHost = game.you.role === 'host';
  const hasPlayers = game.players.length > 0; // the engine's rule: the host's own ticket counts
  const busy = useRef(false);
  const [starting, setStarting] = useState(false);

  function shareOnWhatsApp() {
    window.open(whatsappUrl(inviteText(game.name, game.code)), '_blank', 'noopener');
  }

  async function start() {
    if (busy.current) return;
    if (!hasPlayers) {
      toast('Share the link — no one has joined yet');
      return;
    }
    busy.current = true;
    setStarting(true);
    unlockSpeech(); // inside the tap: iOS needs it before the caller can speak
    const res = await act({ type: 'start' });
    busy.current = false;
    setStarting(false);
    if (!res.ok) toast(res.error);
  }

  return (
    <div className={styles.grid}>
      <div className={styles.col}>
        {isHost ? (
          <>
            <section className={styles.shareCard} aria-labelledby="share-title">
              <h2 id="share-title" className={styles.shareTitle}>
                Share this link with everyone
              </h2>
              <Button variant="whatsapp" size={60} block onClick={shareOnWhatsApp}>
                Share on WhatsApp
              </Button>
              <div className={styles.shareRow}>
                <Pill size={50} onClick={() => void copyGameLink(game.code)}>
                  Copy link
                </Pill>
              </div>
              <span className={styles.shareHint}>
                Playing in the same room? Read out the code: <b className={styles.code}>{game.code}</b>
              </span>
            </section>
            <Button size={64} block flat disabledLook={!hasPlayers || starting} aria-busy={starting || undefined} onClick={() => void start()}>
              {hasPlayers ? 'Start the game' : 'Waiting for players…'}
            </Button>
          </>
        ) : (
          <div className={styles.youreIn} role="status">
            <b>You’re in!</b> Waiting for {game.hostName} to start the game.
          </div>
        )}

        {game.you.ticket ? (
          <section className={styles.section} aria-label="Your ticket">
            <h2 className={styles.sectionTitle}>Your ticket</h2>
            <Ticket ticket={game.you.ticket} bare />
          </section>
        ) : null}
      </div>

      <div className={styles.col}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle} aria-live="polite">
            Who’s here · {game.players.length}
          </h2>
          <ul className={styles.list}>
            {game.players.map((p) => {
              const tag = [p.pid === game.hostPid ? 'host' : '', p.pid === game.you.pid ? 'you' : ''].filter(Boolean).join(' · ');
              return (
                <li key={p.pid} className={styles.personRow}>
                  <Avatar name={p.name} color={p.color} />
                  <span className={styles.personName}>{p.name}</span>
                  {tag ? <span className={styles.personTag}>{tag}</span> : null}
                </li>
              );
            })}
            {game.players.length === 0 ? <li className={styles.listEmpty}>No one yet — share the link.</li> : null}
          </ul>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ways to win</h2>
          <ul className={styles.list}>
            {game.prizes.map((p) => (
              <li key={p.id} className={styles.prizeRow}>
                <span className={styles.prizeName}>{p.label}</span>
                <span className={styles.prizeRule}>{ruleDesc(p.rule)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
