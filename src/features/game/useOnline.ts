import { useEffect } from 'react';
import { Platform } from 'react-native';
import { backend } from '@/backend';
import type { ActionResult } from '@/backend/types';
import { createStore } from '@/lib/store';
import { toast } from '@/ui';
import type { GameAction } from '@core/types';

/**
 * Connectivity for the play screen.
 * Web: navigator.onLine + online/offline events. Native: there is no netinfo dependency, so a failed
 * request marks us offline and the next successful one marks us online again.
 */
const isWeb = Platform.OS === 'web';
const webOnline = () => (typeof navigator === 'undefined' || navigator.onLine !== false);
export const net = createStore({ online: isWeb ? webOnline() : true });

let listening = false;
function listen() {
  if (listening || !isWeb || typeof window === 'undefined') return;
  listening = true;
  const sync = () => net.set({ online: webOnline() });
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

export function useOnline(): boolean {
  useEffect(listen, []);
  return net.use((s) => s.online);
}

const looksOffline = (msg: string) => /network|failed to fetch|fetch failed|offline|timed? ?out|connection/i.test(msg);

export type ActOutcome = ActionResult & { offline?: boolean };

/**
 * `backend.act` that never throws. Network failures come back as `{ ok:false, offline:true }` (and flip the offline banner on);
 * rule errors are toasted unless `quiet`.
 */
export async function act(code: string, action: GameAction, quiet?: boolean): Promise<ActOutcome> {
  if (isWeb && !webOnline()) { net.set({ online: false }); return { ok: false, error: 'You’re offline', offline: true }; }
  try {
    const r = await backend.act(code, action);
    if (!r.ok && looksOffline(r.error)) { if (!isWeb) net.set({ online: false }); return { ...r, offline: true }; }
    if (!isWeb && !net.get().online) net.set({ online: true });
    if (!r.ok && !quiet) toast(r.error);
    return r;
  } catch {
    if (!isWeb) net.set({ online: false });
    return { ok: false, error: 'You’re offline', offline: true };
  }
}

/** Native only: while offline, try a cheap read every few seconds to notice the connection coming back. */
export function useReconnectProbe(code: string, online: boolean) {
  useEffect(() => {
    if (online || isWeb) return;
    const t = setInterval(() => {
      backend.getGame(code).then(() => net.set({ online: true })).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [code, online]);
}
