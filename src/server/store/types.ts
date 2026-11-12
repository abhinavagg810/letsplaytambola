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

/**
 * How long the summary of an expired game is kept for the operator's statistics (days after the last activity).
 * Tickets and dabs are erased at 24 hours; after this many days the whole game is deleted for good.
 * The same number is the default of purge_expired_games() / admin_retention_days() in supabase/migrations/0002_admin.sql.
 */
export const ADMIN_RETENTION_DAYS = 90;
export const ADMIN_RETENTION_MS = ADMIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
/** Most games one admin list page may ask for. */
export const ADMIN_MAX_PAGE = 100;
/** Most games one admin statistics read loads (newest first). */
export const ADMIN_MAX_RANGE_ROWS = 5000;

/** Which games an admin read wants. Times are epoch ms and compare with the game's creation time. */
export interface AdminGameFilter {
  from?: number;
  to?: number;
  /** 'open' = lobby or live. 'expired' = lobby/live but idle for more than 24h. */
  status?: 'lobby' | 'live' | 'done' | 'expired' | 'open';
  /** Matches the code, the game name or the host name (case-insensitive, anywhere). */
  search?: string;
  /** Only games this device hosted or joined (short device id). */
  device?: string;
  /** Only games with activity at or after this time. */
  activeSince?: number;
}
export interface AdminGameQuery extends AdminGameFilter {
  sort?: 'created' | 'players' | 'activity';
  dir?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

/**
 * A game as the admin sees it: the public document plus anonymous device ids. Never tickets, marks or token hashes.
 * A "short device id" is the first 8 hex characters of the stored SHA-256 of a device token.
 */
export interface AdminGameRow {
  code: string;
  /** In lists `events` is left out (empty array); adminGetGame has it. */
  doc: GameDoc;
  createdAt: number;
  /** Last activity (epoch ms). */
  updatedAt: number;
  /** True once tickets and dabs have been erased (24h after the last activity). */
  erased: boolean;
  /** Short device id of the host. */
  hostDevice: string;
  /** pid → short device id, for everyone holding a ticket. */
  devices: Record<string, string>;
}
export interface AdminGamePage { total: number; rows: AdminGameRow[] }
export interface AdminNotifyRow { phone: string; createdAt: number }

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
  /** Save a new game under a fresh code that no stored game uses (active or retained). Returns the code. */
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

  /**
   * Housekeeping: erase tickets and dabs of games idle for 24h, delete games idle for ADMIN_RETENTION_DAYS.
   * Returns how many games were erased or deleted.
   */
  purge(): Promise<number>;

  // ---- admin reads. Only ever called behind requireAdmin(). They return no ticket, no marks, no token hash.
  /** One page of games (limit is capped at ADMIN_MAX_PAGE), with the total that match. */
  adminListGames(query: AdminGameQuery): Promise<AdminGamePage>;
  /** Every matching game, newest first, for statistics (capped at ADMIN_MAX_RANGE_ROWS; `total` tells when it was cut). */
  adminGamesInRange(filter: AdminGameFilter): Promise<AdminGamePage>;
  /** One game with its events, or null. Includes expired games that are still retained. */
  adminGetGame(code: string): Promise<AdminGameRow | null>;
  /** "Notify me" numbers, newest first. */
  adminListNotifyNumbers(page: { limit: number; offset: number }): Promise<{ total: number; rows: AdminNotifyRow[] }>;
  /** How many "Notify me" numbers were saved in [from, to). */
  adminCountNotifyNumbers(from: number, to: number): Promise<number>;
}

/** No free code found after many tries (practically impossible: 28 million codes). */
export class CodeSpaceError extends Error {}
