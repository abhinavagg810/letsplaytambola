import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@/backend/types';
import { say } from '@/lib/speech';
import { MOTION } from '@/theme/tokens';
import { toast } from '@/ui';
import { speechFor } from '@core/data.ts';
import type { FeedItem, GameView } from '@core/types';

export interface WinBanner { mine: boolean; label: string; amount: number; name: string }
export interface Bubble { seq: number; who: string; text: string }

/**
 * Last feed seq this device handled while a game was live, by game code. Results reads (and clears) it so the
 * win that ended the round is still announced and the confetti runs once on arrival.
 */
export const liveSeen = new Map<string, number>();

const rnd = () => 1 + Math.floor(Math.random() * 90);

/**
 * Everything on the play screen that is driven by *changes* in the game rather than its current state:
 *  - the ball roll: a newly called number shakes for 12 × 75ms before it is revealed (and spoken). Until then
 *    `called` excludes it, so the board, ticket hints and dabbing all treat it as not yet called.
 *  - feed diffing on `seq`: win banner + confetti + voice, bogey voice + toast, start voice, reaction bubbles.
 */
export function useGameEvents(game: GameView, user: User) {
  // ---- roll
  const total = game.called.length;
  const [revealed, setRevealed] = useState(total);
  const [rollNum, setRollNum] = useState<number | null>(null);
  const latest = useRef(game.called);
  latest.current = game.called;
  const shown = Math.min(revealed, total);
  const rolling = total > shown;
  useEffect(() => {
    if (total <= revealed) { if (total < revealed) setRevealed(total); return; }
    let k = 0;
    setRollNum(rnd());
    const t = setInterval(() => {
      if (++k >= MOTION.shakeFrames) {
        clearInterval(t);
        const c = latest.current;
        setRevealed(c.length); setRollNum(null);
        if (c.length) say(speechFor(c[c.length - 1]), true);
        return;
      }
      setRollNum(rnd());
    }, MOTION.shakeFrameMs);
    return () => clearInterval(t);
  }, [total, revealed]);
  const called = rolling ? game.called.slice(0, shown) : game.called;

  // ---- feed
  const [banner, setBanner] = useState<WinBanner | null>(null);
  const [confettiAt, setConfettiAt] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const seen = useRef<number | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const bannerT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(() => { timers.current.delete(t); fn(); }, ms);
    timers.current.add(t);
    return t;
  }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); clearTimeout(bannerT.current); }, []);

  const party = useCallback(() => setConfettiAt(Date.now()), []);
  const clearBanner = useCallback(() => { clearTimeout(bannerT.current); setBanner(null); }, []);

  useEffect(() => {
    const feed: FeedItem[] = game.feed || [];
    if (seen.current === null) {
      // First mount: everything already in the feed is old news — except a start nobody has heard yet.
      seen.current = game.seq || 0;
      liveSeen.set(game.id, seen.current);
      const lastItem = feed[feed.length - 1];
      if (lastItem?.kind === 'start' && !game.called.length) say("Let's play Tambola!", true);
      return;
    }
    if ((game.seq || 0) < seen.current) seen.current = game.seq || 0;
    const from = seen.current;
    const fresh = feed.filter((f) => f.seq > from);
    if (!fresh.length) return;
    seen.current = game.seq || fresh[fresh.length - 1].seq;
    liveSeen.set(game.id, seen.current);
    const reacts: Bubble[] = [];
    for (const f of fresh) {
      if (f.kind === 'win') {
        party();
        say(`${f.label} for ${f.name}!`);
        clearTimeout(bannerT.current);
        setBanner({ mine: f.uid === user.uid, label: f.label ?? '', amount: f.amount ?? 0, name: f.name ?? '' });
        bannerT.current = setTimeout(() => setBanner(null), MOTION.bannerMs);
      } else if (f.kind === 'bogey') {
        say('Oh no! Bogey!');
        toast(f.uid === user.uid ? 'Bogey! Not quite — check your dabs' : f.text ?? 'Bogey!');
      } else if (f.kind === 'start') {
        say("Let's play Tambola!", true);
      } else if (f.kind === 'reset') {
        clearBanner();
        if (f.text) toast(f.text === 'Board reset — fresh tickets' ? 'Board reset — fresh tickets dealt' : f.text);
      } else if (f.kind === 'react') {
        reacts.push({ seq: f.seq, who: f.who ?? '', text: f.text ?? '' });
      }
    }
    if (reacts.length) {
      setBubbles((b) => [...b, ...reacts].slice(-4));
      const gone = new Set(reacts.map((r) => r.seq));
      later(() => setBubbles((b) => b.filter((x) => !gone.has(x.seq))), MOTION.reactionMs + 200);
    }
  }, [game.seq, game.feed, game.id, game.called.length, user.uid, party, later, clearBanner]);

  return { rolling, rollNum, called, banner, confettiAt, bubbles };
}
