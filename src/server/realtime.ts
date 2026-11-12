// The "something changed" ping. After a commit the server posts { v: version } on the Supabase Realtime
// Broadcast channel `g:CODE`; browsers subscribed to it (anon key) refetch their own view through the API.
// The ping carries no game data. Sent over Realtime's HTTP endpoint, so the server holds no websocket
// (this is the same REST call supabase-js makes for channel.send() on a channel that is not subscribed).
import { REALTIME_EVENT, realtimeChannel } from '@/core';
import { supabaseConfigured } from './store';

/** Never throws; a lost ping only means browsers pick the change up on their next poll. No-op in memory mode. */
export async function broadcastChanged(code: string, version: number): Promise<boolean> {
  if (!supabaseConfigured()) return false;
  const base = process.env.SUPABASE_URL!.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  try {
    const res = await fetch(`${base}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ messages: [{ topic: realtimeChannel(code), event: REALTIME_EVENT, payload: { v: version } }] }),
      signal: AbortSignal.timeout(2500),
      cache: 'no-store',
    });
    if (!res.ok) console.warn(`[realtime] broadcast for ${code} answered ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn(`[realtime] broadcast for ${code} failed:`, e instanceof Error ? e.message : e);
    return false;
  }
}
