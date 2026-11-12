// Shared types for the game engine, the server and the browser. Pure data, no platform APIs.

export type RuleId =
  | 'early5' | 'early7' | 'early9' | 'lucky3' | 'laddoo' | 'temp'
  | 'top' | 'middle' | 'bottom' | 'railway' | 'bamboo'
  | 'corners' | 'star' | 'six' | 'kings' | 'queens'
  | 'pyramid' | 'rpyramid' | 'diamond' | 'one24'
  | 'breakfast' | 'lunch' | 'dinner' | 'day' | 'night'
  | 'full';

/** 3 rows x 9 columns; 0 = blank cell. */
export type Ticket = number[][];

export type GameStatus = 'lobby' | 'live' | 'done';

/** Auto-call: 0 = off, otherwise seconds between numbers. The timer itself runs in the host's browser. */
export type AutoSeconds = 4 | 6 | 8 | 10;
export type AutoSetting = 0 | AutoSeconds;

export interface Prize {
  /** Unique within the game. In v2 this equals `rule` (a pattern can be picked once). */
  id: string;
  rule: RuleId;
  /** Display name, e.g. "Top Line". */
  label: string;
  winnerPid: string | null;
  /** The winner's display name at the time of the win. */
  winnerName: string | null;
  /** Epoch ms, or null while open. */
  wonAt: number | null;
  /** Prize money in rupees, for information only (0 when the game has no ticket price or has not started). */
  amount: number;
}

/** What a visitor sees of a prize before joining. */
export interface PrizeInfo {
  id: string;
  rule: RuleId;
  label: string;
}

export interface PublicPlayer {
  /** Public player id. Device tokens never appear in any document or response. */
  pid: string;
  /** Display name; a duplicate becomes "Meera (2)". */
  name: string;
  /** Avatar colour (CSS colour string), by join order. */
  color: string;
  joinedAt: number;
}

interface EventBase {
  /** Increases by 1 per event for the life of the game (across rounds). */
  seq: number;
  /** Epoch ms (server clock). */
  at: number;
}
export type GameEvent =
  | (EventBase & { kind: 'join'; pid: string; name: string })
  | (EventBase & { kind: 'start' })
  | (EventBase & { kind: 'call'; n: number })
  | (EventBase & { kind: 'win'; pid: string; name: string; prizeId: string; label: string })
  | (EventBase & { kind: 'round'; round: number });
export type GameEventInput =
  | { kind: 'join'; pid: string; name: string }
  | { kind: 'start' }
  | { kind: 'call'; n: number }
  | { kind: 'win'; pid: string; name: string; prizeId: string; label: string }
  | { kind: 'round'; round: number };

/** The public game document: everything every member of the game may see. No tickets, no marks, no tokens. */
export interface GameDoc {
  code: string;
  name: string;
  hostName: string;
  /** The host's player id when the host also plays ("Deal me a ticket"), otherwise null. */
  hostPid: string | null;
  /** Ticket price in rupees, information only. 0 = not set. */
  price: number;
  status: GameStatus;
  /** Numbers called this round, in call order. */
  called: number[];
  auto: AutoSetting;
  /** 1 for the first round; +1 on every "Play again". */
  round: number;
  prizes: Prize[];
  players: PublicPlayer[];
  /** The last EVENT_LIMIT events (join, start, call, win, round), oldest first. */
  events: GameEvent[];
  /** `seq` of the newest event ever written (0 = none). */
  seq: number;
  createdAt: number;
  /** Last change to this public document (epoch ms). */
  updatedAt: number;
  /** +1 on every change to this public document. Marking a ticket does not change it. */
  version: number;
  /** When the current round started (epoch ms); null in the lobby. Absent on games made before this was recorded. */
  startedAt?: number | null;
  /** When the current round finished (epoch ms); null until then. */
  finishedAt?: number | null;
  /**
   * Earlier rounds, oldest first (the last HISTORY_LIMIT), written by "Play again". Server-side only:
   * it is used for the operator's statistics and is never part of a view sent to a browser.
   */
  history?: RoundRecord[];
}

/** What is remembered of a round once the host starts the next one. No tickets, no marks. */
export interface RoundRecord {
  round: number;
  startedAt: number | null;
  finishedAt: number | null;
  /** How many numbers had been called. */
  called: number;
  /** How many people held a ticket. */
  players: number;
  prizes: Prize[];
}

/** A player's private state. Only ever sent to that player's own device. */
export interface PlayerState {
  pid: string;
  ticket: Ticket;
  /** Numbers the player has dabbed (always called numbers on their own ticket). */
  marks: number[];
}

/** Everything the server keeps for a game. */
export interface GameState {
  doc: GameDoc;
  /** Private state keyed by pid. */
  players: Record<string, PlayerState>;
}

/** Who is acting, as worked out by the server from the device token. */
export interface Actor {
  isHost: boolean;
  /** The actor's player id when they hold a ticket in this game. */
  pid: string | null;
}

/** Injected by the caller so the engine stays pure. */
export interface Ctx {
  /** Epoch ms. */
  now: number;
  /** Uniform in [0, 1). */
  rng: () => number;
}

export interface CreateGameInput {
  /** 1–24 characters after trimming. */
  hostName: string;
  /** Up to 32 characters; empty = "Tambola Night". */
  name?: string;
  /** Whole rupees 0–99999; 0 or missing = no price. */
  price?: number;
  /** "Deal me a ticket" — default true. */
  hostPlays?: boolean;
  /** Rule ids of the ways to win, in display order: at least one, no repeats. */
  prizes: RuleId[];
}

export type GameAction =
  | { type: 'join'; name: string }
  | { type: 'start' }
  | { type: 'draw' }
  | { type: 'setAuto'; auto: AutoSetting }
  /** Dab or un-dab `n` on your own ticket. Without `on` it toggles; with `on` it sets (safe to retry). */
  | { type: 'mark'; n: number; on?: boolean }
  | { type: 'claim'; prizeId: string }
  | { type: 'newRound' };
export type GameActionType = GameAction['type'];

/**
 * Why an action was refused:
 * forbidden = not allowed for this device (maps to HTTP 403); invalid = bad input;
 * state = not possible in the game's current status; not_yet = claim checked and not complete;
 * taken = prize already won; full = no seats left.
 */
export type EngineErrorCode = 'forbidden' | 'invalid' | 'state' | 'not_yet' | 'taken' | 'full';

export interface EngineError {
  ok: false;
  /** User-facing copy, ready for a toast. */
  error: string;
  code: EngineErrorCode;
}

export interface EngineOk {
  ok: true;
  state: GameState;
  /** The public document changed (its `version` went up by one): persist it and tell everyone. */
  changed: boolean;
  /** pids whose private state (ticket / marks) is new or changed. */
  touched: string[];
  /** Set by `join` (and by create when the host plays): the pid dealt to the actor. */
  pid?: string;
}
export type EngineResult = EngineOk | EngineError;

// ---------------------------------------------------------------- per-device views

export type YouView =
  /** The host. `pid`, `ticket` and `marks` are present only when the host also plays. */
  | { role: 'host'; name: string; pid?: string; ticket?: Ticket; marks?: number[] }
  | { role: 'player'; name: string; pid: string; ticket: Ticket; marks: number[] }
  | { role: 'visitor' };

/** What the host and the players get: the public document plus their own ticket. */
export interface MemberView extends GameDoc {
  playerCount: number;
  /** Server clock (epoch ms) when this view was made — compare with event `at` times, not the device clock. */
  now: number;
  you: Exclude<YouView, { role: 'visitor' }>;
}

/** What a device that has not joined gets: only what the Join card shows. */
export interface VisitorView {
  code: string;
  name: string;
  hostName: string;
  price: number;
  status: GameStatus;
  round: number;
  playerCount: number;
  prizes: PrizeInfo[];
  version: number;
  now: number;
  you: { role: 'visitor' };
}

export type GameView = MemberView | VisitorView;
