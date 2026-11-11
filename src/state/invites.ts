import { useEffect } from 'react';
import { backend } from '@/backend';
import type { PeekGame } from '@/backend/types';
import { createStore } from '@/lib/store';

/** Open games I've been invited to (teal cards on Home, badge on the Home tab). Polled while a tab screen is mounted. */
export const invitesStore = createStore<{ list: PeekGame[] }>({ list: [] });
export const refreshInvites = () => backend.listInvites().then((list) => invitesStore.set({ list })).catch(() => {});
export function useInvitePolling(uid: string | null | undefined) {
  useEffect(() => {
    if (!uid) return;
    refreshInvites();
    const t = setInterval(refreshInvites, 5000);
    return () => clearInterval(t);
  }, [uid]);
}
