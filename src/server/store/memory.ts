// In-memory store: the default when the Supabase env vars are absent.
// Kept on globalThis so Next.js dev hot reload (which re-evaluates modules) does not lose games.
// One process only — on serverless hosts use the Supabase store.
import { GAME_TTL_MS, genCode } from '@/core';
import { CodeSpaceError } from './types';
import type { CommitWrite, GameStore, NewGame, PlayerWrite, StoredGame, StoredPlayer } from './types';

interface MemoryData {
  games: Map<string, StoredGame>;
  phones: Set<string>;
}

const KEY = '__lpt_memory_store_v1__';
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class MemoryStore implements GameStore {
  readonly kind = 'memory' as const;

  constructor(private readonly data: MemoryData = { games: new Map(), phones: new Set() }, private readonly now: () => number = Date.now) {}

  private live(code: string): StoredGame | null {
    const g = this.data.games.get(code);
    if (!g) return null;
    if (this.now() - g.updatedAt > GAME_TTL_MS) {
      this.data.games.delete(code);
      return null;
    }
    return g;
  }

  /** Drop every expired game. */
  purgeExpired(): number {
    let n = 0;
    for (const code of [...this.data.games.keys()]) if (!this.live(code)) n++;
    return n;
  }

  async create(game: NewGame, rng: () => number): Promise<string> {
    this.purgeExpired();
    for (let attempt = 0; attempt < 50; attempt++) {
      const code = genCode(rng);
      if (this.live(code)) continue;
      const now = this.now();
      this.data.games.set(code, {
        doc: { ...copy(game.doc), code, version: 1 },
        version: 1,
        hostTokenHash: game.hostTokenHash,
        players: game.players.map((p) => newRow(p)),
        updatedAt: now,
      });
      return code;
    }
    throw new CodeSpaceError('no free game code');
  }

  async load(code: string): Promise<StoredGame | null> {
    const g = this.live(code);
    return g ? copy(g) : null;
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
    this.data.phones.add(phone);
  }

  /** For tests. */
  get notifyNumbers(): string[] {
    return [...this.data.phones];
  }
}

function newRow(w: PlayerWrite): StoredPlayer {
  return { pid: w.pid, ticket: copy(w.ticket), marks: w.marks.slice(), tokenHash: w.tokenHash ?? '', rev: 1 };
}

/** The process-wide store. */
export function getMemoryStore(): MemoryStore {
  const g = globalThis as unknown as Record<string, MemoryData | undefined>;
  const data = (g[KEY] ??= { games: new Map(), phones: new Set() });
  return new MemoryStore(data);
}
