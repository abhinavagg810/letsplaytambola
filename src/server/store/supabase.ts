// Supabase store (production). Uses the SERVICE ROLE key, server-side only: the tables have row level
// security with no policies, so nothing else can read or write them. See supabase/migrations/0001_init.sql.
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GAME_TTL_MS, genCode } from '@/core';
import type { GameDoc, Ticket } from '@/core';
import { CodeSpaceError } from './types';
import type { CommitWrite, GameStore, NewGame, PlayerWrite, StoredGame } from './types';

/** Postgres SQLSTATEs we act on. */
const SERIALIZATION_FAILURE = '40001'; // raised by commit_game on a version / rev conflict
const UNIQUE_VIOLATION = '23505'; // code in use (create) or this device already has a seat (join)

interface GameRow {
  doc: GameDoc;
  version: number;
  host_token_hash: string;
  updated_at: string;
}
interface PlayerRow {
  pid: string;
  token_hash: string;
  ticket: Ticket;
  marks: number[] | null;
  rev: number;
}

const playerJson = (w: PlayerWrite) => ({
  pid: w.pid,
  ticket: w.ticket,
  marks: w.marks,
  rev: w.rev,
  ...(w.rev === null ? { token_hash: w.tokenHash } : {}),
});

export class SupabaseStore implements GameStore {
  readonly kind = 'supabase' as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, {
      // A server has no browser session to keep.
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  async create(game: NewGame, rng: () => number): Promise<string> {
    for (let attempt = 0; attempt < 12; attempt++) {
      const code = genCode(rng);
      const { error } = await this.db.rpc('commit_game', {
        p_code: code,
        p_version: null,
        p_doc: { ...game.doc, code, version: 1 },
        p_players: game.players.map(playerJson),
        p_host_token_hash: game.hostTokenHash,
      });
      if (!error) return code;
      if (error.code === UNIQUE_VIOLATION) continue; // code in use by an active game: try another
      throw new Error(`commit_game (create) failed: ${error.code ?? ''} ${error.message}`);
    }
    throw new CodeSpaceError('no free game code');
  }

  async load(code: string): Promise<StoredGame | null> {
    const [game, players] = await Promise.all([
      this.db.from('games').select('doc, version, host_token_hash, updated_at').eq('code', code).maybeSingle<GameRow>(),
      this.db.from('players').select('pid, token_hash, ticket, marks, rev').eq('code', code).returns<PlayerRow[]>(),
    ]);
    if (game.error) throw new Error(`load game failed: ${game.error.code ?? ''} ${game.error.message}`);
    if (players.error) throw new Error(`load players failed: ${players.error.code ?? ''} ${players.error.message}`);
    const row = game.data;
    if (!row) return null;
    const updatedAt = Date.parse(row.updated_at);
    // Expired games are treated as gone even before purge_expired_games() removes them.
    if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > GAME_TTL_MS) return null;
    // The two reads are not one snapshot. That is safe: every write re-checks the game version
    // (and each player row's rev) inside commit_game, so a stale mix can only cause a retry.
    return {
      doc: { ...row.doc, code, version: row.version },
      version: row.version,
      hostTokenHash: row.host_token_hash,
      players: (players.data ?? []).map((p) => ({ pid: p.pid, tokenHash: p.token_hash, ticket: p.ticket, marks: p.marks ?? [], rev: p.rev })),
      updatedAt,
    };
  }

  async commit(code: string, expectedVersion: number, write: CommitWrite): Promise<'ok' | 'conflict'> {
    const { error } = await this.db.rpc('commit_game', {
      p_code: code,
      p_version: expectedVersion,
      p_doc: write.doc,
      p_players: write.players.map(playerJson),
    });
    if (!error) return 'ok';
    if (error.code === SERIALIZATION_FAILURE || error.code === UNIQUE_VIOLATION) return 'conflict';
    throw new Error(`commit_game failed: ${error.code ?? ''} ${error.message}`);
  }

  async touch(code: string): Promise<void> {
    const { error } = await this.db.from('games').update({ updated_at: new Date().toISOString() }).eq('code', code);
    if (error) throw new Error(`touch failed: ${error.code ?? ''} ${error.message}`);
  }

  async saveNotifyNumber(phone: string): Promise<void> {
    const { error } = await this.db.from('notify_numbers').upsert({ phone }, { onConflict: 'phone', ignoreDuplicates: true });
    if (error) throw new Error(`save notify number failed: ${error.code ?? ''} ${error.message}`);
  }
}
