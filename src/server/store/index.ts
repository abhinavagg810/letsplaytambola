// Picks the store: Supabase when both server env vars are set, otherwise in-memory.
import { getMemoryStore } from './memory';
import { SupabaseStore } from './supabase';
import type { GameStore } from './types';

export type { CommitWrite, GameStore, NewGame, PlayerWrite, StoredGame, StoredPlayer } from './types';
export { CodeSpaceError } from './types';

const KEY = '__lpt_supabase_store_v1__';

export function supabaseConfigured(): boolean {
  return !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}

export function getStore(): GameStore {
  if (!supabaseConfigured()) return getMemoryStore();
  const g = globalThis as unknown as Record<string, SupabaseStore | undefined>;
  return (g[KEY] ??= new SupabaseStore(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!));
}
