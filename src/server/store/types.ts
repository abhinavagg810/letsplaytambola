// Storage contract. Two adapters: memory (local dev, zero setup) and supabase (production).
import type { GameDoc, PlayerState } from '@/core';
import type { ContactInput, ContactTopic } from '@/lib/contact';
import type { CleanBatch } from '../insights/events';
import type {
  AdminDevice, AdminIp, AdminEvent, AdminParticipation, AuditRow, BreakdownQuery, BreakdownRow, DeviceListQuery, EraseResult, EventListQuery,
  FunnelQuery, FunnelStep, GameInsights, ParticipationDim, ParticipationRow, RequestContext, RetentionStats, TableCounts, TrafficTotals,
} from '../insights/types';

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
  /** Only games with a ticket price. */
  priced?: boolean;
  /** Only games left in the lobby: never started (or waiting for another round) and idle for more than ABANDONED_AFTER_MS. */
  abandoned?: boolean;
}
/** A lobby with no activity for this long counts as abandoned. */
export const ABANDONED_AFTER_MS = 60 * 60_000;
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

/** One message sent with the contact form, as the admin sees it. Every text field is what the person typed: render it as text. */
export interface AdminContactMessage {
  id: number;
  createdAt: number;
  topic: ContactTopic;
  name: string | null;
  replyTo: string | null;
  message: string;
  /** The site page the person came from. */
  page: string | null;
  /** When the admin marked it as read; null = unread. */
  readAt: number | null;
  /** Short device id (first 8 hex characters of the token hash), or null when the request had no device token. */
  device: string | null;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  inApp: string | null;
  language: string | null;
}
export interface ContactListQuery {
  topic?: ContactTopic;
  /** Matches the name, reply-to or message (case-insensitive, anywhere). */
  search?: string;
  status?: 'read' | 'unread';
  limit: number;
  offset: number;
}
export interface ContactPage {
  /** Messages that match the query. */
  total: number;
  /** Unread messages in all (any topic, any search). */
  unread: number;
  rows: AdminContactMessage[];
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

  // ---- insights: first-party analytics (src/server/insights). Writes never throw into a player's request;
  // reads are only ever called behind requireAdmin(). Devices appear as short ids; IPs only in these admin reads.
  /** 'missing' = the database has not been given supabase/migrations/0003_insights.sql yet (the public game still works). */
  insightsStatus(): Promise<'ok' | 'missing'>;
  /** Store one accepted POST /api/t. */
  trackBatch(ctx: RequestContext, batch: CleanBatch): Promise<void>;
  /** A game was created (host) or joined (player) from this request. */
  recordParticipation(ctx: RequestContext, p: { code: string; role: 'host' | 'player'; pid: string | null; name: string }): Promise<void>;
  /** This device won a prize worth `amount` rupees (recorded only). */
  recordWin(tokenHash: string, amount: number): Promise<void>;

  eventBreakdown(q: BreakdownQuery): Promise<BreakdownRow[]>;
  funnel(q: FunnelQuery): Promise<FunnelStep[]>;
  trafficTotals(from: number, to: number): Promise<TrafficTotals>;
  participationBreakdown(from: number, to: number, dim: ParticipationDim): Promise<ParticipationRow[]>;
  retention(now: number): Promise<RetentionStats>;
  listEvents(q: EventListQuery): Promise<{ total: number; rows: AdminEvent[] }>;
  listDevices(q: DeviceListQuery): Promise<{ total: number; rows: AdminDevice[] }>;
  getDevice(id: string): Promise<{ device: AdminDevice; ips: AdminIp[] } | null>;
  gameInsights(code: string): Promise<GameInsights>;
  /** code → the host's participation (place, device, source). */
  gameHosts(codes: string[]): Promise<Record<string, AdminParticipation>>;
  tableCounts(): Promise<TableCounts>;
  listAudit(limit: number): Promise<AuditRow[]>;
  /** Delete everything tied to a short device id and anonymise its names in stored games. Writes an audit line. */
  eraseDevice(id: string): Promise<EraseResult>;

  // ---- contact form (/contact). 'missing' = the database has not been given supabase/migrations/0004_contact.sql yet.
  contactStatus(): Promise<'ok' | 'missing'>;
  /** Store one message with the request's IP / place / device. 'missing' = not stored (migration 0004 not run). Other failures throw. */
  saveContactMessage(ctx: RequestContext, msg: ContactInput): Promise<'ok' | 'missing'>;
  /** Admin: one page of messages, newest first (limit capped at ADMIN_MAX_PAGE). Empty when 0004 is missing. */
  adminListContactMessages(q: ContactListQuery): Promise<ContactPage>;
  /** Admin: how many messages are unread (0 when 0004 is missing). */
  adminCountUnreadContact(): Promise<number>;
  /** Admin: mark as read (true) or unread (false). False when there is no such message. */
  adminSetContactRead(id: number, read: boolean): Promise<boolean>;
  /** Admin: delete one message for good and write an audit line. False when there is no such message. */
  adminDeleteContactMessage(id: number): Promise<boolean>;
}

/** No free code found after many tries (practically impossible: 28 million codes). */
export class CodeSpaceError extends Error {}
