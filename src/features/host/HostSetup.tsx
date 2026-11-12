'use client';
// Host setup (/host): your name, game name, ticket price, "Deal me a ticket", ways to win → create the game.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { Button, Input, Pill, Toggle, toast } from '@/components';
import { GAME_NAME_IDEAS, MAX_GAME_NAME_LENGTH, MAX_NAME_LENGTH, prizeSummary } from '@/core';
import { createGame } from '@/lib/api';
import { getSavedName, saveName } from '@/lib/device';
import { unlockSpeech } from '@/lib/speech';
import { resetDraft, updateDraft, useHostDraft } from './draft';
import { canGoBackInSite, keepInView, markPrizesOpenedFromSetup } from './nav';
import styles from './host.module.css';

const noSubscribe = () => () => undefined;

export function HostSetup() {
  const router = useRouter();
  const draft = useHostDraft();
  // The name typed last time on this device ('' on the server and while hydrating).
  const savedName = useSyncExternalStore(noSubscribe, getSavedName, () => '');
  const name = draft.name ?? savedName;
  const nameRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const created = useRef(false);
  const [creating, setCreating] = useState(false);

  // Once the game exists, the next visit to /host starts with a clean form.
  useEffect(
    () => () => {
      if (created.current) resetDraft();
    },
    [],
  );

  const ready = !!name.trim() && draft.prizes.length > 0;

  async function create() {
    if (busy.current) return;
    const hostName = name.trim();
    if (!hostName) {
      toast('Type your name first');
      nameRef.current?.focus();
      return;
    }
    if (!draft.prizes.length) {
      toast('Pick at least one way to win');
      return;
    }
    busy.current = true;
    setCreating(true);
    saveName(hostName);
    unlockSpeech(); // inside the tap: iOS needs it before the caller can speak
    const res = await createGame({
      hostName,
      name: draft.gameName.trim(),
      price: Number(draft.price) || 0,
      hostPlays: draft.hostPlays,
      prizes: draft.prizes,
    });
    if (!res.ok) {
      busy.current = false;
      setCreating(false);
      toast(res.error);
      return;
    }
    created.current = true;
    router.push(`/g/${res.code}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void create();
  }

  function goBack() {
    if (canGoBackInSite()) router.back();
    else router.push('/');
  }

  return (
    <form className={styles.page} onSubmit={onSubmit} noValidate>
      <div className={styles.top}>
        <button type="button" className={styles.back} onClick={goBack} aria-label="Back">
          <span aria-hidden="true">←</span>
        </button>
        <span className={styles.step}>New game</span>
      </div>

      <div className={styles.head}>
        <h1 className={styles.h1}>Host a game</h1>
        <p className={styles.sub}>Takes a minute. No sign-up for you or your players.</p>
      </div>

      <label className={styles.field}>
        <span className={styles.fieldLabel}>Your name</span>
        <Input
          ref={nameRef}
          value={name}
          onChange={(e) => updateDraft({ name: e.target.value.slice(0, MAX_NAME_LENGTH) })}
          onFocus={keepInView}
          placeholder="e.g. Priya"
          maxLength={MAX_NAME_LENGTH}
          autoComplete="given-name"
          autoCapitalize="words"
          enterKeyHint="done"
          name="hostName"
        />
        <span className={styles.fieldHint}>Players will see “{name.trim() || 'Priya'} invited you”.</span>
      </label>

      <div className={`${styles.field} ${styles.fieldWide}`}>
        <label className={styles.fieldLabel} htmlFor="game-name">
          Game name
        </label>
        <Input
          id="game-name"
          value={draft.gameName}
          onChange={(e) => updateDraft({ gameName: e.target.value.slice(0, MAX_GAME_NAME_LENGTH) })}
          onFocus={keepInView}
          placeholder="e.g. Diwali Night"
          maxLength={MAX_GAME_NAME_LENGTH}
          fontSize={24}
          weight={800}
          autoComplete="off"
          enterKeyHint="done"
          name="gameName"
        />
        <div className={styles.chips} role="group" aria-label="Quick picks for the game name">
          {GAME_NAME_IDEAS.map((idea) => (
            <Pill key={idea} size={40} selected={draft.gameName === idea} selectedLook="border" onClick={() => updateDraft({ gameName: idea })}>
              {idea}
            </Pill>
          ))}
        </div>
      </div>

      <div className={styles.settings}>
        <div className={`${styles.row} ${styles.rowPrice}`}>
          <label className={styles.rowText} htmlFor="ticket-price">
            <span className={styles.rowTitle}>
              Ticket price <span className={styles.optional}>OPTIONAL</span>
            </span>
            <span className={styles.rowSub}>Collected outside the app</span>
          </label>
          <label className={styles.price}>
            <span className={styles.rupee} aria-hidden="true">
              ₹
            </span>
            <input
              id="ticket-price"
              className={styles.priceInput}
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.price}
              onChange={(e) => updateDraft({ price: e.target.value.replace(/\D/g, '').slice(0, 5) })}
              onFocus={keepInView}
              placeholder="0"
              autoComplete="off"
              enterKeyHint="done"
              aria-label="Ticket price in rupees (optional)"
              name="price"
            />
          </label>
        </div>

        <button type="button" role="switch" aria-checked={draft.hostPlays} className={styles.row} onClick={() => updateDraft({ hostPlays: !draft.hostPlays })}>
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>Deal me a ticket</span>
            <span className={styles.rowSub}>Play while you call numbers</span>
          </span>
          <Toggle checked={draft.hostPlays} presentational />
        </button>

        <Link href="/host/prizes" className={styles.row} onClick={() => markPrizesOpenedFromSetup(true)}>
          <span className={styles.rowText}>
            <span className={styles.rowTitle}>Ways to win</span>
            <span className={styles.rowSub}>{prizeSummary(draft.prizes)}</span>
          </span>
          <span className={styles.change}>Change →</span>
        </Link>
      </div>

      <div className={styles.sticky}>
        <Button type="submit" size={62} block disabledLook={!ready || creating} aria-busy={creating || undefined}>
          {creating ? 'Creating your game…' : 'Create game & get link'}
        </Button>
      </div>
    </form>
  );
}
