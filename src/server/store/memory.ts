// In-memory store: the default when the Supabase env vars are absent.
// Kept on globalThis so Next.js dev hot reload (which re-evaluates modules) does not lose games.
// One process only — on serverless hosts use the Supabase store.
import { GAME_TTL_MS, genCode } from '@/core';
import { ADMIN_MAX_PAGE, ADMIN_MAX_RANGE_ROWS, ADMIN_RETENTION_MS, CodeSpaceError } from './types';
import type {
  AdminGameFilter, AdminGamePage, AdminGameQuery, AdminGameRow, AdminNotifyRow,
  CommitWrite, GameStore, NewGame, PlayerWrite, StoredGame, StoredPlayer,
} from './types';

/** A stored game plus the memory store's own bookkeeping. */
interface MemoryGame extends StoredGame {
  createdAt: number;
  /** Set when tickets and dabs were erased (the game expired). */
  erasedAt?: number;
}

interface MemoryData {
  games: Map<string, MemoryGame>;
  /** "Notify me" numbers → when they were saved. */
  phones: Map<string, number>;
  lastSweep?: number;
}

const KEY = '__lpt_memory_store_v2__';
const SWEEP_EVERY_MS = 60_000;
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
/** The anonymous id the admin sees for a device: the first 8 hex characters of its token hash. */
const shortId = (hash: string): string => hash.slice(0, 8);
const newData = (): MemoryData => ({ games: new Map(), phones: new Map() });

export class MemoryStore implements GameStore {
  readonly kind = 'memory' as const;

  constructor(private readonly data: MemoryData = newData(), private readonly now: () => number = Date.now) {}

  private expired(g: MemoryGame): boolean {
    return this.now() - g.updatedAt > GAME_TTL_MS;
  }

  /** The game while players can still use it; null once it has expired (it may still be retained for the admin). */
  private live(code: string): MemoryGame | null {
    const g = this.data.games.get(code);
    if (!g) return null;
    if (this.expired(g)) {
      this.erase(g);
      return null;
    }
    return g;
  }

  /** Erase the private data of an expired game: every ticket and every dab. The public document stays. */
  private erase(g: MemoryGame): boolean {
    if (g.erasedAt !== undefined) return false;
    for (const p of g.players) {
      p.ticket = [];
      p.marks = [];
      p.rev += 1;
    }
    g.erasedAt = this.now();
    return true;
  }

  /**
   * Erase tickets and dabs of games idle for 24h; delete games idle for ADMIN_RETENTION_DAYS.
   * Returns how many games were erased or deleted.
   */
  purgeExpired(): number {
    const now = this.now();
    this.data.lastSweep = now;
    let n = 0;
    for (const [code, g] of [...this.data.games]) {
      if (now - g.updatedAt > ADMIN_RETENTION_MS) {
        this.data.games.delete(code);
        n++;
      } else if (this.expired(g) && this.erase(g)) {
        n++;
      }
    }
    return n;
  }

  async purge(): Promise<number> {
    return this.purgeExpired();
  }

  /** Housekeeping without a timer: at most once a minute, piggy-backed on normal calls. */
  private sweep(): void {
    if (this.now() - (this.data.lastSweep ?? 0) >= SWEEP_EVERY_MS) this.purgeExpired();
  }

  async create(game: NewGame, rng: () => number): Promise<string> {
    this.purgeExpired();
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = genCode(rng);
      // A code stays taken while its game is stored at all, including the 90 days it is retained after expiring.
      if (this.data.games.has(code)) continue;
      const now = this.now();
      this.data.games.set(code, {
        doc: { ...copy(game.doc), code, version: 1 },
        version: 1,
        hostTokenHash: game.hostTokenHash,
        players: game.players.map((p) => newRow(p)),
        updatedAt: now,
        createdAt: now,
      });
      return code;
    }
    throw new CodeSpaceError('no free game code');
  }

  async load(code: string): Promise<StoredGame | null> {
    this.sweep();
    const g = this.live(code);
    if (!g) return null;
    const { doc, version, hostTokenHash, players, updatedAt } = g;
    return copy({ doc, version, hostTokenHash, players, updatedAt });
  }

  async commit(code: string, expectedVersion: number, write: CommitWrite): Promise<'ok' | 'conflict'> {
    const g = this.live(code);
    if (!g || g.version !== expectedVersion) return 'conflict';
    // Check everything first, then write: all or nothing.
    for (const w of write.players) {
      if (w.rev === null) {
        if (!w.tokenHash) throw new Error('a new player needs a token hash');
        if (g.players.some((p) => p.pid === w.pid || p.tokenHash === w.tokenHash)) return 'conflict';
      } else if (g.players.find((p) => p.pid === w.pid)?.rev !== w.rev) {
        return 'conflict';
      }
    }
    for (const w of write.players) {
      if (w.rev === null) {
        g.players.push(newRow(w));
      } else {
        const row = g.players.find((p) => p.pid === w.pid)!;
        row.ticket = copy(w.ticket);
        row.marks = w.marks.slice();
        row.rev += 1;
      }
    }
    if (write.doc) {
      g.version += 1;
      g.doc = { ...copy(write.doc), code, version: g.version };
    }
    g.updatedAt = this.now();
    return 'ok';
  }

  async touch(code: string): Promise<void> {
    const g = this.live(code);
    if (g) g.updatedAt = this.now();
  }

  async saveNotifyNumber(phone: string): Promise<void> {
    if (!this.data.phones.has(phone)) this.data.phones.set(phone, this.now());
  }

  // ---------------------------------------------------------------- admin reads

  /** The admin's view of a game. Built field by field so a ticket, marks or a token hash can never slip in. */
  private adminRow(g: MemoryGame, withEvents: boolean): AdminGameRow {
    const doc = copy(g.doc);
    if (!withEvents) doc.events = [];
    const devices: Record<string, string> = {};
    for (const p of g.players) devices[p.pid] = shortId(p.tokenHash);
    return {
      code: doc.code,
      doc,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      erased: g.erasedAt !== undefined,
      hostDevice: shortId(g.hostTokenHash),
      devices,
    };
  }

  private adminFilter(f: AdminGameFilter): MemoryGame[] {
    this.purgeExpired();
    const q = f.search?.trim().toLowerCase();
    const out: MemoryGame[] = [];
    for (const g of this.data.games.values()) {
      if (f.from !== undefined && g.createdAt < f.from) continue;
      if (f.to !== undefined && g.createdAt >= f.to) continue;
      if (f.activeSince !== undefined && g.updatedAt < f.activeSince) continue;
      if (q && !(g.doc.code.toLowerCase().includes(q) || g.doc.name.toLowerCase().includes(q) || g.doc.hostName.toLowerCase().includes(q))) continue;
      if (f.device && shortId(g.hostTokenHash) !== f.device && !g.players.some((p) => shortId(p.tokenHash) === f.device)) continue;
      if (f.status) {
        const status = g.doc.status === 'done' ? 'done' : this.expired(g) ? 'expired' : g.doc.status;
        if (f.status === 'open' ? status !== 'lobby' && status !== 'live' : status !== f.status) continue;
      }
      out.push(g);
    }
    return out;
  }

  async adminListGames(query: AdminGameQuery): Promise<AdminGamePage> {
    const games = this.adminFilter(query);
    const key = (g: MemoryGame): number =>
      query.sort === 'players' ? g.doc.players.length : query.sort === 'activity' ? g.updatedAt : g.createdAt;
    const sign = query.dir === 'asc' ? 1 : -1;
    games.sort((a, b) => sign * (key(a) - key(b)) || (a.doc.code < b.doc.code ? -1 : 1));
    const limit = Math.min(ADMIN_MAX_PAGE, Math.max(1, Math.floor(query.limit)));
    const offset = Math.max(0, Math.floor(query.offset));
    return { total: games.length, rows: games.slice(offset, offset + limit).map((g) => this.adminRow(g, false)) };
  }

  async adminGamesInRange(filter: AdminGameFilter): Promise<AdminGamePage> {
    const games = this.adminFilter(filter).sort((a, b) => b.createdAt - a.createdAt || (a.doc.code < b.doc.code ? -1 : 1));
    return { total: games.length, rows: games.slice(0, ADMIN_MAX_RANGE_ROWS).map((g) => this.adminRow(g, false)) };
  }

  async adminGetGame(code: string): Promise<AdminGameRow | null> {
    this.purgeExpired();
    const g = this.data.games.get(code);
    return g ? this.adminRow(g, true) : null;
  }

  async adminListNotifyNumbers(page: { limit: number; offset: number }): Promise<{ total: number; rows: AdminNotifyRow[] }> {
    const all = [...this.data.phones].map(([phone, createdAt]) => ({ phone, createdAt })).sort((a, b) => b.createdAt - a.createdAt || (a.phone < b.phone ? -1 : 1));
    const limit = Math.min(ADMIN_MAX_PAGE, Math.max(1, Math.floor(page.limit)));
    const offset = Math.max(0, Math.floor(page.offset));
    return { total: all.length, rows: all.slice(offset, offset + limit) };
  }

  async adminCountNotifyNumbers(from: number, to: number): Promise<number> {
    let n = 0;
    for (const at of this.data.phones.values()) if (at >= from && at < to) n++;
    return n;
  }

  /** For tests. */
  get notifyNumbers(): string[] {
    return [...this.data.phones.keys()];
  }

  /** For tests: the raw private rows of a game, expired or not. */
  rawPlayers(code: string): StoredPlayer[] | null {
    const g = this.data.games.get(code);
    return g ? copy(g.players) : null;
  }
}

function newRow(w: PlayerWrite): StoredPlayer {
  return { pid: w.pid, ticket: copy(w.ticket), marks: w.marks.slice(), tokenHash: w.tokenHash ?? '', rev: 1 };
}

/** The process-wide store. */
export function getMemoryStore(): MemoryStore {
  const g = globalThis as unknown as Record<string, MemoryData | undefined>;
  const data = (g[KEY] ??= newData());
  return new MemoryStore(data);
}
