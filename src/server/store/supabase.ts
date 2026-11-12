// Supabase store (production). Uses the SERVICE ROLE key, server-side only: the tables have row level
// security with no policies, so nothing else can read or write them. See supabase/migrations/0001_init.sql.
import { after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GAME_TTL_MS, genCode } from '@/core';
import type { GameDoc, Ticket } from '@/core';
import { ADMIN_MAX_PAGE, ADMIN_MAX_RANGE_ROWS, ADMIN_RETENTION_DAYS, CodeSpaceError } from './types';
import type {
  AdminGameFilter, AdminGamePage, AdminGameQuery, AdminGameRow, AdminNotifyRow,
  CommitWrite, GameStore, NewGame, PlayerWrite, StoredGame,
} from './types';

/** The purge also runs from the app (at most this often per server instance), so it does not depend on pg_cron. */
const PURGE_EVERY_MS = 60 * 60_000;
const iso = (ms: number | undefined): string | null => (ms === undefined ? null : new Date(ms).toISOString());

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
  private lastPurge = 0;

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
      if (!error) {
        await this.purgeIfDue();
        return code;
      }
      if (error.code === UNIQUE_VIOLATION) continue; // code in use by an active or a retained game: try another
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
    // Expired games are treated as gone, whether or not purge_expired_games() has erased their tickets yet.
    // (Their rows are retained for the admin's statistics; nothing in the public app reads them. The purge
    // never moves updated_at, and commit_game refuses expired or erased games, so an expired game stays expired.)
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
    // Only a game that is still active can be touched: an expired one must stay expired.
    const { error } = await this.db.from('games').update({ updated_at: new Date().toISOString() })
      .eq('code', code).gte('updated_at', new Date(Date.now() - GAME_TTL_MS).toISOString());
    if (error) throw new Error(`touch failed: ${error.code ?? ''} ${error.message}`);
  }

  async saveNotifyNumber(phone: string): Promise<void> {
    const { error } = await this.db.from('notify_numbers').upsert({ phone }, { onConflict: 'phone', ignoreDuplicates: true });
    if (error) throw new Error(`save notify number failed: ${error.code ?? ''} ${error.message}`);
  }

  async purge(): Promise<number> {
    this.lastPurge = Date.now();
    const { data, error } = await this.db.rpc('purge_expired_games', { p_retention_days: ADMIN_RETENTION_DAYS });
    if (error) throw new Error(`purge_expired_games failed: ${error.code ?? ''} ${error.message}`);
    return typeof data === 'number' ? data : 0;
  }

  /** Best effort: a failed purge must never fail the request it rides on. */
  private async purgeIfDue(): Promise<void> {
    if (Date.now() - this.lastPurge < PURGE_EVERY_MS) return;
    this.lastPurge = Date.now(); // claim the slot now so parallel requests don't all purge
    const run = () => this.purge().catch((e) => console.warn('[store] purge failed:', e instanceof Error ? e.message : e));
    // Housekeeping must not slow the page down: run it after the response has been sent.
    try {
      after(run);
    } catch {
      void run(); // not inside a request (tests, scripts)
    }
  }

  // ---------------------------------------------------------------- admin reads
  // All of them go through the admin_* SQL functions (supabase/migrations/0002_admin.sql), which never
  // select a ticket, marks or a full token hash. Each returns ONE json value, so PostgREST's row cap does not apply.

  private async listGames(f: AdminGameFilter, sort: string, desc: boolean, limit: number, offset: number): Promise<AdminGamePage> {
    await this.purgeIfDue();
    const { data, error } = await this.db.rpc('admin_list_games', {
      p_from: iso(f.from),
      p_to: iso(f.to),
      p_status: f.status ?? null,
      p_search: f.search?.trim() || null,
      p_device: f.device ?? null,
      p_active_since: iso(f.activeSince),
      p_sort: sort,
      p_desc: desc,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw new Error(`admin_list_games failed: ${error.code ?? ''} ${error.message}`);
    const page = data as { total?: number; rows?: AdminGameRow[] } | null;
    return { total: Number(page?.total ?? 0), rows: (page?.rows ?? []).map(adminRow) };
  }

  async adminListGames(query: AdminGameQuery): Promise<AdminGamePage> {
    const limit = Math.min(ADMIN_MAX_PAGE, Math.max(1, Math.floor(query.limit)));
    return this.listGames(query, query.sort ?? 'created', query.dir !== 'asc', limit, Math.max(0, Math.floor(query.offset)));
  }

  async adminGamesInRange(filter: AdminGameFilter): Promise<AdminGamePage> {
    return this.listGames(filter, 'created', true, ADMIN_MAX_RANGE_ROWS, 0);
  }

  async adminGetGame(code: string): Promise<AdminGameRow | null> {
    await this.purgeIfDue();
    const { data, error } = await this.db.rpc('admin_get_game', { p_code: code });
    if (error) throw new Error(`admin_get_game failed: ${error.code ?? ''} ${error.message}`);
    return data ? adminRow(data as AdminGameRow) : null;
  }

  async adminListNotifyNumbers(page: { limit: number; offset: number }): Promise<{ total: number; rows: AdminNotifyRow[] }> {
    const limit = Math.min(ADMIN_MAX_PAGE, Math.max(1, Math.floor(page.limit)));
    const offset = Math.max(0, Math.floor(page.offset));
    const { data, error, count } = await this.db.from('notify_numbers').select('phone, created_at', { count: 'exact' })
      .order('created_at', { ascending: false }).order('phone').range(offset, offset + limit - 1)
      .returns<{ phone: string; created_at: string }[]>();
    if (error) throw new Error(`list notify numbers failed: ${error.code ?? ''} ${error.message}`);
    return { total: count ?? 0, rows: (data ?? []).map((r) => ({ phone: r.phone, createdAt: Date.parse(r.created_at) })) };
  }

  async adminCountNotifyNumbers(from: number, to: number): Promise<number> {
    const { error, count } = await this.db.from('notify_numbers').select('phone', { count: 'exact', head: true })
      .gte('created_at', new Date(from).toISOString()).lt('created_at', new Date(to).toISOString());
    if (error) throw new Error(`count notify numbers failed: ${error.code ?? ''} ${error.message}`);
    return count ?? 0;
  }
}

/** Copy exactly the admin fields out of what the database returned (belt and braces: nothing else can ride along). */
function adminRow(r: AdminGameRow): AdminGameRow {
  return {
    code: String(r.code),
    doc: { ...r.doc, code: String(r.code), events: Array.isArray(r.doc?.events) ? r.doc.events : [] },
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    erased: r.erased === true,
    hostDevice: String(r.hostDevice ?? ''),
    devices: r.devices && typeof r.devices === 'object' ? r.devices : {},
  };
}
