// Supabase store (production). Uses the SERVICE ROLE key, server-side only: the tables have row level
// security with no policies, so nothing else can read or write them. See supabase/migrations/0001_init.sql.
import { after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { GAME_TTL_MS, genCode } from '@/core';
import type { GameDoc, Ticket } from '@/core';
import type { CleanBatch } from '../insights/events';
import type {
  AdminDevice, AdminEvent, AdminIp, AdminParticipation, AuditRow, BreakdownQuery, BreakdownRow, DeviceListQuery, EraseResult, EventListQuery,
  FunnelQuery, FunnelStep, GameInsights, ParticipationDim, ParticipationRow, RequestContext, RetentionStats, TableCounts, TrafficTotals,
} from '../insights/types';
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

  /** `client` is for tests only: a stand-in for the Supabase client. */
  constructor(url: string, serviceRoleKey: string, client?: Pick<SupabaseClient, 'rpc' | 'from'>) {
    this.db = (client as SupabaseClient | undefined) ?? createClient(url, serviceRoleKey, {
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
      // Added by migration 0003; left out unless used, so the plain list keeps working before that migration is run.
      ...(f.priced ? { p_priced: true } : {}),
      ...(f.abandoned ? { p_abandoned: true } : {}),
    });
    if (error && (f.priced || f.abandoned) && SupabaseStore.notInstalled(error)) throw new Error('This filter needs supabase/migrations/0003_insights.sql — run it first');
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

  // ---------------------------------------------------------------- insights
  // Everything goes through the functions of supabase/migrations/0003_insights.sql; each returns ONE json value whose
  // keys already match the TypeScript shapes, so this adapter only passes arguments through.
  //
  // If that migration has not been run yet, the functions do not exist. Then: writes are dropped quietly (a player's
  // request never fails or waits because of analytics), reads return "nothing", and insightsStatus() says 'missing'
  // so the admin can show "run migration 0003" instead of crashing.

  private insightsState: { status: 'ok' | 'missing'; until: number } | null = null;

  /** True for "that function / table does not exist": PostgREST's schema-cache misses and Postgres' undefined_function / undefined_table. */
  private static notInstalled(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    return error.code === 'PGRST202' || error.code === 'PGRST205' || error.code === '42883' || error.code === '42P01';
  }

  private markInsights(status: 'ok' | 'missing'): void {
    // Re-check a missing migration every minute (the owner may be running it right now); trust "ok" for longer.
    this.insightsState = { status, until: Date.now() + (status === 'ok' ? 10 * 60_000 : 60_000) };
  }

  private insightsKnownMissing(): boolean {
    return !!this.insightsState && this.insightsState.status === 'missing' && this.insightsState.until > Date.now();
  }

  async insightsStatus(): Promise<'ok' | 'missing'> {
    if (this.insightsState && this.insightsState.until > Date.now()) return this.insightsState.status;
    const { error } = await this.db.rpc('insights_version');
    if (error && !SupabaseStore.notInstalled(error)) throw new Error(`insights_version failed: ${error.code ?? ''} ${error.message}`);
    this.markInsights(error ? 'missing' : 'ok');
    return error ? 'missing' : 'ok';
  }

  /** An insights read: the function's json, or `fallback` when the migration has not been run. Other errors are thrown. */
  private async insRead<T>(fn: string, args: Record<string, unknown>, fallback: T): Promise<T> {
    if (this.insightsKnownMissing()) return fallback;
    const { data, error } = await this.db.rpc(fn, args);
    if (error) {
      if (SupabaseStore.notInstalled(error)) {
        this.markInsights('missing');
        return fallback;
      }
      throw new Error(`${fn} failed: ${error.code ?? ''} ${error.message}`);
    }
    return (data ?? fallback) as T;
  }

  /** An insights write: never throws. */
  private async insWrite(fn: string, args: Record<string, unknown>): Promise<void> {
    if (this.insightsKnownMissing()) return;
    try {
      const { error } = await this.db.rpc(fn, args);
      if (!error) return;
      if (SupabaseStore.notInstalled(error)) {
        if (!this.insightsKnownMissing()) console.warn('[insights] not recording: run supabase/migrations/0003_insights.sql (see supabase/README.md)');
        this.markInsights('missing');
        return;
      }
      console.warn(`[insights] ${fn} failed: ${error.code ?? ''} ${error.message}`);
    } catch (e) {
      console.warn(`[insights] ${fn} failed:`, e instanceof Error ? e.message : e);
    }
  }

  async trackBatch(ctx: RequestContext, batch: CleanBatch): Promise<void> {
    await this.insWrite('track_batch', { p_ctx: ctx, p_session: batch.session, p_source: batch.source, p_events: batch.events });
  }

  async recordParticipation(ctx: RequestContext, p: { code: string; role: 'host' | 'player'; pid: string | null; name: string }): Promise<void> {
    await this.insWrite('record_participation', { p_ctx: ctx, p_code: p.code, p_role: p.role, p_pid: p.pid, p_name: p.name });
  }

  async recordWin(tokenHash: string, amount: number): Promise<void> {
    await this.insWrite('record_win', { p_token_hash: tokenHash, p_amount: Math.max(0, Math.floor(amount) || 0) });
  }

  eventBreakdown(q: BreakdownQuery): Promise<BreakdownRow[]> {
    return this.insRead('admin_event_breakdown', {
      p_from: iso(q.from), p_to: iso(q.to), p_dim: q.dim, p_names: q.names ?? null, p_device_type: q.deviceType ?? null,
      p_source: q.source ?? null, p_code: q.code ?? null, p_limit: q.limit ?? 500,
    }, []);
  }

  funnel(q: FunnelQuery): Promise<FunnelStep[]> {
    return this.insRead('admin_funnel', {
      p_from: iso(q.from), p_to: iso(q.to), p_steps: q.steps, p_device_type: q.deviceType ?? null, p_source: q.source ?? null, p_code: q.code ?? null,
    }, q.steps.map((step) => ({ step, any: 0, kept: 0 })));
  }

  trafficTotals(from: number, to: number): Promise<TrafficTotals> {
    return this.insRead('admin_traffic_totals', { p_from: iso(from), p_to: iso(to) },
      { visitors: 0, sessions: 0, events: 0, pageViews: 0, newDevices: 0, returningDevices: 0, timedSessions: 0, sessionMs: 0 });
  }

  participationBreakdown(from: number, to: number, dim: ParticipationDim): Promise<ParticipationRow[]> {
    return this.insRead('admin_participation_breakdown', { p_from: iso(from), p_to: iso(to), p_dim: dim }, []);
  }

  retention(now: number): Promise<RetentionStats> {
    const none = { eligible: 0, returned: 0 };
    return this.insRead('admin_retention', { p_now: iso(now) }, { cohorts: [], d1: none, d7: none, d30: none, hosts: 0, returningHosts: 0 });
  }

  listEvents(q: EventListQuery): Promise<{ total: number; rows: AdminEvent[] }> {
    return this.insRead('admin_list_events', {
      p_from: iso(q.from), p_to: iso(q.to), p_name: q.name ?? null, p_device: q.device ?? null, p_code: q.code ?? null,
      p_session: q.session ?? null, p_limit: q.limit, p_offset: q.offset,
    }, { total: 0, rows: [] });
  }

  listDevices(q: DeviceListQuery): Promise<{ total: number; rows: AdminDevice[] }> {
    return this.insRead('admin_list_devices', {
      p_search: q.search?.trim() || null, p_played: q.played === true, p_sort: q.sort ?? 'lastSeen', p_desc: q.dir !== 'asc', p_limit: q.limit, p_offset: q.offset,
    }, { total: 0, rows: [] });
  }

  getDevice(id: string): Promise<{ device: AdminDevice; ips: AdminIp[] } | null> {
    return this.insRead<{ device: AdminDevice; ips: AdminIp[] } | null>('admin_get_device', { p_device: id }, null);
  }

  gameInsights(code: string): Promise<GameInsights> {
    return this.insRead('admin_game_insights', { p_code: code }, { participations: [], events: [] });
  }

  gameHosts(codes: string[]): Promise<Record<string, AdminParticipation>> {
    if (codes.length === 0) return Promise.resolve({});
    return this.insRead('admin_game_hosts', { p_codes: codes }, {});
  }

  async tableCounts(): Promise<TableCounts> {
    const counts = await this.insRead<TableCounts | null>('admin_table_counts', {}, null);
    if (counts) return counts;
    // Before migration 0003: count the three original tables directly.
    const n = async (table: string, col: string): Promise<number> => {
      const { count, error } = await this.db.from(table).select(col, { count: 'exact', head: true });
      if (error) throw new Error(`count ${table} failed: ${error.code ?? ''} ${error.message}`);
      return count ?? 0;
    };
    const [games, players, notify_numbers] = await Promise.all([n('games', 'code'), n('players', 'pid'), n('notify_numbers', 'phone')]);
    return { games, players, notify_numbers, devices: 0, device_ips: 0, participations: 0, events: 0, admin_audit: 0 };
  }

  listAudit(limit: number): Promise<AuditRow[]> {
    return this.insRead('admin_list_audit', { p_limit: limit }, []);
  }

  async eraseDevice(id: string): Promise<EraseResult> {
    const { data, error } = await this.db.rpc('admin_erase_device', { p_device: id });
    if (error) {
      if (SupabaseStore.notInstalled(error)) throw new Error('Run supabase/migrations/0003_insights.sql first');
      throw new Error(`admin_erase_device failed: ${error.code ?? ''} ${error.message}`);
    }
    return data as EraseResult;
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
