// Storage contract. Two adapters: memory (local dev, zero setup) and supabase (production).
import type { GameDoc, PlayerState } from '@/core';

/** A player's private row as stored. `tokenHash` never leaves the server. */
export interface StoredPlayer extends PlayerState {
  /** SHA-256 (hex) of the device token that owns this seat. */
  tokenHash: string;
  /** +1 on every change to this row; used for compare-and-swap. */
  rev: number;
}

export interface StoredGame {
  doc: GameDoc;
  /** Same as doc.version. */
  version: number;
  hostTokenHash: string;
  players: StoredPlayer[];
  /** Last activity (epoch ms): any commit or touch. Games expire 24h after this. */
  updatedAt: number;
}

export interface PlayerWrite extends PlayerState {
  /** null = a new row (a join; `tokenHash` required). A number = update only if the row still has this rev. */
  rev: number | null;
  tokenHash?: string;
}

export interface NewGame {
  /** The public document; the store fills in `code`. */
  doc: GameDoc;
  hostTokenHash: string;
  players: PlayerWrite[];
}

export interface CommitWrite {
  /** The next public document (its version must be expectedVersion + 1), or null when only private rows changed. */
  doc: GameDoc | null;
  players: PlayerWrite[];
}

export interface GameStore {
  readonly kind: 'memory' | 'supabase';
  /** Save a new game under a fresh code that no active game uses. Returns the code. */
  create(game: NewGame, rng: () => number): Promise<string>;
  /** The game, or null when it does not exist or has expired (24h without activity). */
  load(code: string): Promise<StoredGame | null>;
  /**
   * Compare-and-swap: write only if the game is still at `expectedVersion` (and every updated player row
   * at its `rev`). All or nothing. 'conflict' = someone else got in first: reload and try again.
   */
  commit(code: string, expectedVersion: number, write: CommitWrite): Promise<'ok' | 'conflict'>;
  /** Count as activity without changing anything (pushes the expiry out). */
  touch(code: string): Promise<void>;
  /** Remember a "Notify me" WhatsApp number (10 digits). Saving the same number twice is fine. */
  saveNotifyNumber(phone: string): Promise<void>;
}

/** No free code found after many tries (practically impossible: 28 million codes). */
export class CodeSpaceError extends Error {}
