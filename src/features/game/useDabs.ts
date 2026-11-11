import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameView } from '@core/types';
import { act } from './useOnline';

const same = (a: number[], b: number[]) => a.length === b.length && a.every((n) => b.includes(n));

/**
 * My dabs, optimistic: a tap shows at once, is sent to the server in order, and the local copy is dropped as soon
 * as the server view agrees with it (or after a short grace period — the server wins if it rejected something).
 * While offline the taps wait in the queue and are re-sent, in order, when the connection is back.
 */
export function useDabs(game: GameView, online: boolean) {
  const server = game.me?.dabs ?? [];
  const [local, setLocal] = useState<number[] | null>(null);
  const queue = useRef<number[]>([]);
  const busy = useRef(false);
  const grace = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const code = game.id;
  const dabs = local ?? server;
  const cur = useRef(dabs);
  cur.current = dabs;

  const flush = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    clearTimeout(grace.current);
    while (queue.current.length) {
      const r = await act(code, { type: 'dab', n: queue.current[0] }, true);
      if (r.offline) break;                 // keep it queued for later
      queue.current.shift();                // sent — or rejected by the server, in which case it is dropped
    }
    busy.current = false;
    if (!queue.current.length) grace.current = setTimeout(() => setLocal(null), 3000);
  }, [code]);

  const toggle = useCallback((n: number) => {
    const next = cur.current.includes(n) ? cur.current.filter((m) => m !== n) : [...cur.current, n];
    cur.current = next;
    setLocal(next);
    queue.current.push(n);
    if (online) void flush();
  }, [flush, online]);

  // Server caught up with what we show → hand control back to it.
  useEffect(() => {
    if (local && !queue.current.length && !busy.current && same(local, server)) { clearTimeout(grace.current); setLocal(null); }
  }, [local, server]);

  // Board reset / new tickets: nothing local survives.
  const epoch = `${game.round}:${game.me ? game.me.ticket.flat().join(',') : ''}:${game.called.length === 0}`;
  const lastEpoch = useRef(epoch);
  useEffect(() => {
    if (lastEpoch.current === epoch) return;
    lastEpoch.current = epoch;
    queue.current = [];
    setLocal(null);
  }, [epoch]);

  useEffect(() => () => clearTimeout(grace.current), []);
  return { dabs, toggle, flush, pending: () => queue.current.length };
}
