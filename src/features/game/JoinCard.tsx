'use client';
// What a visitor sees: the invite, a name field and "Join game". Also the card for a game that has finished.
import { useRef, useState, type FormEvent } from 'react';
import { Button, Input, toast } from '@/components';
import { MAX_NAME_LENGTH, type VisitorView } from '@/core';
import { keepInView } from '@/features/host/nav';
import { getSavedName, saveName } from '@/lib/device';
import { unlockSpeech } from '@/lib/speech';
import type { UseGame } from '@/lib/useGame';
import styles from './game.module.css';

/** "3 people in · 6 ways to win · ₹100 ticket, pay Priya directly" */
export function joinMeta(game: Pick<VisitorView, 'playerCount' | 'prizes' | 'price' | 'hostName' | 'status'>): string {
  const people = `${game.playerCount} ${game.playerCount === 1 ? 'person' : 'people'} in`;
  const ways = `${game.prizes.length} ${game.prizes.length === 1 ? 'way' : 'ways'} to win`;
  const price = game.price ? ` · ₹${game.price} ticket, pay ${game.hostName} directly` : '';
  return `${people} · ${ways}${price}${game.status === 'live' ? ' · already playing' : ''}`;
}

export function JoinCard({ game, act }: { game: VisitorView; act: UseGame['act'] }) {
  const [name, setName] = useState(getSavedName);
  const [joining, setJoining] = useState(false);
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const clean = name.trim();
    if (!clean) {
      toast('Type your name to join');
      inputRef.current?.focus();
      return;
    }
    busy.current = true;
    setJoining(true);
    saveName(clean);
    unlockSpeech(); // inside the tap: iOS needs it before the caller can speak
    const res = await act({ type: 'join', name: clean });
    if (res.ok) {
      toast('You’re in — ticket dealt!');
      return; // the page now shows the lobby or the live game
    }
    busy.current = false;
    setJoining(false);
    toast(res.error);
  }

  return (
    <form className={styles.narrow} onSubmit={join} noValidate>
      <div className={styles.invite}>
        <span className={styles.inviteBy}>{game.hostName} invited you to</span>
        <h1 className={styles.inviteName}>{game.name}</h1>
        <span className={styles.inviteMeta}>{joinMeta(game)}</span>
      </div>
      <label className={styles.joinField}>
        <span className={styles.joinLabel}>What should we call you?</span>
        <Input
          ref={inputRef}
          size={62}
          weight={500}
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
          onFocus={keepInView}
          placeholder="Your name"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="go"
          name="name"
        />
      </label>
      <Button type="submit" size={64} block flat disabledLook={!name.trim() || joining} aria-busy={joining || undefined}>
        {joining ? 'Joining…' : 'Join game'}
      </Button>
      <p className={styles.footnote}>No sign-up. Your name is only shown to people in this game.</p>
    </form>
  );
}

/** A visitor opening a game that is over: joining is closed, and the winners are only shown to people in the game. */
export function FinishedCard({ game }: { game: VisitorView }) {
  return (
    <div className={styles.narrow}>
      <div className={styles.invite}>
        <span className={styles.inviteBy}>{game.hostName}’s game</span>
        <h1 className={styles.inviteName}>{game.name}</h1>
        <span className={styles.inviteMeta}>This game has finished.</span>
      </div>
      <p className={styles.footnote} style={{ fontSize: 17, color: 'var(--text-soft)' }}>
        If {game.hostName} starts another round, you can join right here — keep this page open.
      </p>
      <Button href="/host" size={60} block flat>
        Host my own game
      </Button>
    </div>
  );
}
