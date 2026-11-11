// Shared contract for the game engine. Pure data, no platform imports.
// NOTE: relative imports inside packages/game-core must include the ".ts" extension
// (the same files are bundled into the Supabase Edge Function, which runs on Deno).

export type RuleId =
  | 'early5' | 'early7' | 'early9' | 'lucky3' | 'laddoo' | 'temp'
  | 'top' | 'middle' | 'bottom' | 'railway' | 'bamboo'
  | 'corners' | 'star' | 'six' | 'kings' | 'queens'
  | 'pyramid' | 'rpyramid' | 'diamond' | 'one24'
  | 'breakfast' | 'lunch' | 'dinner' | 'day' | 'night' | 'full';

/** 3 rows x 9 columns, 0 = blank. */
export type Ticket = number[][];

export interface Prize { id: string; label: string; rule: RuleId; amt: number }

/** A prize while it is being configured on the create screen. */
export interface PrizeCfg extends Prize { on: boolean; custom: boolean }

export interface PlayerPublic { uid: string; name: string; color: string; username: string | null; joinedAt: number }

export interface Claim { uid: string; name: string; at: number }

export type FeedKind = 'info' | 'win' | 'bogey' | 'react' | 'start' | 'end' | 'join' | 'reset';
export interface FeedItem {
  seq: number; kind: FeedKind; at: number; text?: string;
  uid?: string; name?: string; label?: string; amount?: number; who?: string;
}

export interface RoundRecord {
  round: number; claims: Record<string, Claim>; prizes: Prize[]; price: number;
  uids: string[]; calledCount: number; endedAt: number;
}

export interface ContactInvite { id: string; name: string; phone: string; sent: boolean }
export interface InvitedUser { uid: string; name: string; username: string | null; color: string }

/** Everything about a game that every member may see. Contains NO tickets or dabs. */
export interface GameDoc {
  id: string;            // == code, 5 chars A-Z0-9
  name: string;
  hostUid: string; hostName: string; hostColor: string; hostUsername: string | null;
  status: 'lobby' | 'live' | 'ended';
  round: number;
  maxSeats: number;
  price: number;
  prizes: Prize[];
  called: number[];
  claims: Record<string, Claim>;   // prizeId -> claim
  players: PlayerPublic[];
  invited: InvitedUser[];
  contacts: ContactInvite[];       // only meaningful to the host; stripped for others by project()
  auto: 0 | 5 | 8 | 12;
  seq: number;
  feed: FeedItem[];                // last 40
  history: RoundRecord[];
  createdAt: number; endedAt: number | null;
  version: number;                 // optimistic concurrency
}

/** Private per-player state. Stored separately from GameDoc; only its owner may read it. */
export interface TicketState { ticket: Ticket; dabs: number[] }
export type Tickets = Record<string, TicketState>; // uid -> state

/** What one viewer receives: the public doc plus only their own ticket. */
export interface GameView extends GameDoc { me: TicketState | null }

export interface Actor { uid: string; name: string; color: string; username: string | null }

export type GameAction =
  | { type: 'join' }
  | { type: 'start' }
  | { type: 'draw' }
  | { type: 'setAuto'; auto: 0 | 5 | 8 | 12 }
  | { type: 'restart'; fresh: boolean }
  | { type: 'end' }
  | { type: 'nextRound' }
  | { type: 'dab'; n: number }
  | { type: 'claim'; prizeId: string }
  | { type: 'react'; text: string }
  | { type: 'invite'; users: InvitedUser[] }
  | { type: 'addContacts'; contacts: ContactInvite[] }
  | { type: 'markContactSent'; contactId: string };

export interface CreateGameInput {
  name: string; maxSeats: number; price: number; hostPlays: boolean;
  prizes: Prize[]; invited: InvitedUser[]; contacts: ContactInvite[];
}

/** Result of applying an action. `error` is user-facing copy (shown as a toast). */
export interface ApplyResult {
  ok: boolean; error?: string;
  doc: GameDoc; tickets: Tickets;
  /** uids whose TicketState changed and must be persisted */
  touched: string[];
  /** true when `doc` changed and must be persisted (version already bumped) */
  docChanged: boolean;
}
