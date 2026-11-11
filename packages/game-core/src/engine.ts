// The authoritative game reducer. Pure: time and randomness come in through `Ctx`.
// Runs on the server (Edge Function) and is reused client-side for optimistic UI / tests.
import type {
  Actor, ApplyResult, ContactInvite, CreateGameInput, FeedItem, FeedKind, GameAction, GameDoc,
  GameView, InvitedUser, PlayerPublic, Prize, RoundRecord, TicketState, Tickets,
} from './types.ts';
import { REACTS, isRuleId, ruleName } from './data.ts';
import { genTicket } from './ticket.ts';
import { checkPattern } from './patterns.ts';

export interface Ctx { now: number; rng: () => number }

export const MIN_SEATS = 2;
export const MAX_SEATS = 30;
export const FEED_LIMIT = 40;
export const AUTO_SPEEDS: readonly number[] = [0, 5, 8, 12];

/** User-facing error copy. */
export const ERR = {
  hostOnly: 'Only the host can do that',
  full: 'Sorry — this game is full',
  overPot: 'Prizes add up to more than the pot',
  allCalled: 'All 90 numbers called',
  notLive: 'The game isn’t live right now',
  alreadyStarted: 'The game has already started',
  notEnded: 'This round isn’t over yet',
  notPlayer: 'You’re not in this game',
  notOnTicket: 'That number isn’t on your ticket',
  noPrize: 'That prize isn’t in this game',
  samePattern: 'You already won with that pattern',
  badReact: 'Can’t send that reaction',
  badAuto: 'Auto-call can be off, 5, 8 or 12 seconds',
  noContact: 'Contact not found',
  unknown: 'Unknown action',
} as const;

// No 0/O/1/I: they are easy to mix up when a code is read out loud.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 5-character join code. */
export function newCode(rng: () => number): string {
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += CODE_ALPHABET[Math.min(CODE_ALPHABET.length - 1, Math.floor(rng() * CODE_ALPHABET.length))];
  }
  return s;
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function firstName(name: string): string {
  return (name || '').trim().split(' ')[0] || '';
}

function pushFeed(doc: GameDoc, item: Omit<FeedItem, 'seq' | 'at'> & { kind: FeedKind }, now: number): void {
  doc.seq = (doc.seq || 0) + 1;
  doc.feed = [...(doc.feed || []), { ...item, seq: doc.seq, at: now }].slice(-FEED_LIMIT);
}

function cleanInvited(users: unknown): InvitedUser[] {
  if (!Array.isArray(users)) return [];
  const out: InvitedUser[] = [];
  for (const u of users) {
    if (!u || typeof u.uid !== 'string' || !u.uid || out.some((x) => x.uid === u.uid)) continue;
    out.push({ uid: u.uid, name: String(u.name ?? ''), username: typeof u.username === 'string' ? u.username : null, color: String(u.color ?? '') });
  }
  return out;
}

function cleanContacts(contacts: unknown): ContactInvite[] {
  if (!Array.isArray(contacts)) return [];
  const out: ContactInvite[] = [];
  for (const c of contacts) {
    if (!c || typeof c.id !== 'string' || !c.id || out.some((x) => x.id === c.id)) continue;
    out.push({ id: c.id, name: String(c.name ?? ''), phone: String(c.phone ?? ''), sent: !!c.sent });
  }
  return out;
}

function playerOf(actor: Actor, now: number): PlayerPublic {
  return { uid: actor.uid, name: actor.name, color: actor.color, username: actor.username ?? null, joinedAt: now };
}

function deal(ctx: Ctx): TicketState {
  return { ticket: genTicket(ctx.rng), dabs: [] };
}

/**
 * Build a new game. On `error` the game must NOT be saved (doc/tickets are still returned
 * so the shape is stable, but they are not a valid game).
 */
export function createGameDoc(
  input: CreateGameInput, host: Actor, code: string, ctx: Ctx,
): { doc: GameDoc; tickets: Tickets; error?: string } {
  const maxSeats = Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.floor(Number(input.maxSeats) || 0)));
  const price = Math.max(0, Number(input.price) || 0);
  const prizes: Prize[] = [];
  for (const p of Array.isArray(input.prizes) ? input.prizes : []) {
    if (!p || typeof p.id !== 'string' || !p.id || !isRuleId(p.rule) || prizes.some((x) => x.id === p.id)) continue;
    prizes.push({
      id: p.id,
      label: String(p.label ?? '').trim() || ruleName(p.rule),
      rule: p.rule,
      amt: price ? Math.max(0, Number(p.amt) || 0) : 0,
    });
  }
  const total = prizes.reduce((a, p) => a + p.amt, 0);
  const doc: GameDoc = {
    id: code,
    name: String(input.name ?? '').trim() || 'Tambola night',
    hostUid: host.uid, hostName: host.name, hostColor: host.color, hostUsername: host.username ?? null,
    status: 'lobby',
    round: 1,
    maxSeats,
    price,
    prizes,
    called: [],
    claims: {},
    players: [],
    invited: cleanInvited(input.invited).filter((u) => u.uid !== host.uid),
    contacts: cleanContacts(input.contacts).map((c) => ({ ...c, sent: false })),
    auto: 0,
    seq: 0,
    feed: [],
    history: [],
    createdAt: ctx.now, endedAt: null,
    version: 1,
  };
  const tickets: Tickets = {};
  if (price && total > price * maxSeats) return { doc, tickets, error: ERR.overPot };
  if (input.hostPlays) {
    doc.players.push(playerOf(host, ctx.now));
    tickets[host.uid] = deal(ctx);
  }
  return { doc, tickets };
}

const HOST_ONLY: Record<string, true> = {
  start: true, draw: true, setAuto: true, restart: true, end: true, nextRound: true,
  invite: true, addContacts: true, markContactSent: true,
};

/**
 * Apply one action. Never mutates its inputs. When `ok` is false nothing changed and
 * `error` is the toast to show. `docChanged`/`touched` say what has to be persisted.
 */
export function applyAction(
  doc0: GameDoc, tickets0: Tickets, action: GameAction, actor: Actor, ctx: Ctx,
): ApplyResult {
  const doc = clone(doc0);
  const tickets = clone(tickets0);
  const touched: string[] = [];
  const fail = (error: string): ApplyResult =>
    ({ ok: false, error, doc: clone(doc0), tickets: clone(tickets0), touched: [], docChanged: false });
  const noop = (): ApplyResult =>
    ({ ok: true, doc: clone(doc0), tickets: clone(tickets0), touched: [], docChanged: false });
  const saved = (): ApplyResult => {
    doc.version = (doc.version || 0) + 1;
    return { ok: true, doc, tickets, touched, docChanged: true };
  };
  const touch = (uid: string) => { if (!touched.includes(uid)) touched.push(uid); };

  const isHost = actor.uid === doc.hostUid;
  const player = doc.players.find((p) => p.uid === actor.uid);
  const type: string = action && (action as { type?: string }).type || '';

  if (HOST_ONLY[type] && !isHost) return fail(ERR.hostOnly);

  switch (action.type) {
    case 'join': {
      if (player) return noop();
      // A host who chose not to play just watches and calls; a finished game is view-only.
      if (isHost || doc.status === 'ended') return noop();
      if (doc.players.length >= doc.maxSeats) return fail(ERR.full);
      doc.players.push(playerOf(actor, ctx.now));
      tickets[actor.uid] = deal(ctx);
      touch(actor.uid);
      doc.invited = doc.invited.filter((u) => u.uid !== actor.uid);
      pushFeed(doc, { kind: 'join', uid: actor.uid, name: actor.name, text: `${actor.name} grabbed a ticket` }, ctx.now);
      return saved();
    }

    case 'start': {
      if (doc.status !== 'lobby') return fail(ERR.alreadyStarted);
      doc.status = 'live';
      pushFeed(doc, { kind: 'start', text: `${firstName(doc.hostName)} started the game` }, ctx.now);
      return saved();
    }

    case 'draw': {
      if (doc.status !== 'live') return fail(ERR.notLive);
      const rest: number[] = [];
      for (let n = 1; n <= 90; n++) if (!doc.called.includes(n)) rest.push(n);
      if (!rest.length) return fail(ERR.allCalled);
      const n = rest[Math.min(rest.length - 1, Math.floor(ctx.rng() * rest.length))];
      doc.called.push(n);
      if (doc.called.length >= 90) doc.auto = 0;
      return saved();
    }

    case 'setAuto': {
      if (!AUTO_SPEEDS.includes(action.auto)) return fail(ERR.badAuto);
      if (doc.auto === action.auto) return noop();
      doc.auto = action.auto;
      return saved();
    }

    case 'restart': {
      const fresh = !!action.fresh;
      doc.called = [];
      doc.claims = {};
      doc.auto = 0;
      doc.status = 'live';
      doc.endedAt = null;
      for (const p of doc.players) {
        tickets[p.uid] = fresh || !tickets[p.uid] ? deal(ctx) : { ticket: tickets[p.uid].ticket, dabs: [] };
        touch(p.uid);
      }
      pushFeed(doc, { kind: 'reset', text: fresh ? 'Board reset — fresh tickets' : 'Board reset' }, ctx.now);
      return saved();
    }

    case 'end': {
      if (doc.status === 'ended') return noop();
      doc.status = 'ended';
      doc.auto = 0;
      doc.endedAt = ctx.now;
      pushFeed(doc, { kind: 'end', text: 'Round over' }, ctx.now);
      return saved();
    }

    case 'nextRound': {
      if (doc.status !== 'ended') return fail(ERR.notEnded);
      doc.history = [...(doc.history || []), currentRound(doc, ctx.now)];
      doc.round++;
      doc.called = [];
      doc.claims = {};
      doc.auto = 0;
      doc.feed = [];
      doc.status = 'lobby';
      doc.endedAt = null;
      for (const p of doc.players) { tickets[p.uid] = deal(ctx); touch(p.uid); }
      pushFeed(doc, { kind: 'info', text: `Round ${doc.round} — fresh tickets dealt` }, ctx.now);
      return saved();
    }

    case 'dab': {
      const mine = tickets[actor.uid];
      if (!player || !mine) return fail(ERR.notPlayer);
      if (doc.status !== 'live') return fail(ERR.notLive);
      const n = action.n;
      if (!Number.isInteger(n) || !mine.ticket.some((row) => row.includes(n)) || n === 0) return fail(ERR.notOnTicket);
      if (!doc.called.includes(n)) return fail(`Not yet! ${n} hasn’t been called`);
      mine.dabs = mine.dabs.includes(n) ? mine.dabs.filter((m) => m !== n) : [...mine.dabs, n];
      // Only this player's private ticket changed; the shared doc is untouched.
      return { ok: true, doc, tickets, touched: [actor.uid], docChanged: false };
    }

    case 'claim': {
      const mine = tickets[actor.uid];
      if (!player || !mine) return fail(ERR.notPlayer);
      if (doc.status !== 'live') return fail(ERR.notLive);
      const z = doc.prizes.find((x) => x.id === action.prizeId);
      if (!z) return fail(ERR.noPrize);
      const taken = doc.claims[z.id];
      if (taken) return fail(`${z.label} already went to ${taken.name}`);
      const same = doc.prizes.filter((x) => x.rule === z.rule);
      const earlier = same.slice(0, same.findIndex((x) => x.id === z.id)).find((x) => !doc.claims[x.id]);
      if (earlier) return fail(`Claim ${earlier.label} first`);
      if (same.some((x) => doc.claims[x.id] && doc.claims[x.id].uid === actor.uid)) return fail(ERR.samePattern);
      if (checkPattern(mine.ticket, mine.dabs, doc.called, z.rule)) {
        doc.claims[z.id] = { uid: actor.uid, name: player.name, at: ctx.now };
        pushFeed(doc, { kind: 'win', uid: actor.uid, name: player.name, label: z.label, amount: z.amt, text: `${z.label} for ${player.name}` }, ctx.now);
        if (doc.prizes.every((y) => doc.claims[y.id])) {
          doc.status = 'ended';
          doc.auto = 0;
          doc.endedAt = ctx.now;
          pushFeed(doc, { kind: 'end', text: 'All prizes claimed' }, ctx.now);
        }
      } else {
        pushFeed(doc, { kind: 'bogey', uid: actor.uid, text: `Bogey! ${player.name}’s ${z.label} didn’t check out` }, ctx.now);
      }
      return saved();
    }

    case 'react': {
      if (!isHost && !player) return fail(ERR.notPlayer);
      if (!REACTS.includes(action.text)) return fail(ERR.badReact);
      pushFeed(doc, { kind: 'react', who: firstName(actor.name), text: action.text }, ctx.now);
      return saved();
    }

    case 'invite': {
      const before = doc.invited.length;
      for (const u of cleanInvited(action.users)) {
        if (u.uid === doc.hostUid) continue;
        if (doc.players.some((p) => p.uid === u.uid) || doc.invited.some((x) => x.uid === u.uid)) continue;
        doc.invited.push(u);
      }
      return doc.invited.length === before ? noop() : saved();
    }

    case 'addContacts': {
      const before = doc.contacts.length;
      for (const c of cleanContacts(action.contacts)) {
        if (!doc.contacts.some((x) => x.id === c.id)) doc.contacts.push(c);
      }
      if (doc.contacts.length === before) return noop();
      // Make room for everyone who was just invited (prototype behaviour), up to the hard cap.
      const unjoined = doc.contacts.filter((c) => !doc.players.some((p) => p.name === c.name)).length;
      doc.maxSeats = Math.min(MAX_SEATS, Math.max(doc.maxSeats, doc.players.length + unjoined));
      return saved();
    }

    case 'markContactSent': {
      const c = doc.contacts.find((x) => x.id === action.contactId);
      if (!c) return fail(ERR.noContact);
      if (c.sent) return noop();
      c.sent = true;
      return saved();
    }
  }
  return fail(ERR.unknown);
}

function currentRound(doc: GameDoc, now: number): RoundRecord {
  return {
    round: doc.round,
    claims: clone(doc.claims),
    prizes: clone(doc.prizes),
    price: doc.price,
    uids: doc.players.map((p) => p.uid),
    calledCount: doc.called.length,
    endedAt: doc.endedAt ?? now,
  };
}

/** Every finished round of a game: its history plus the current round once it has ended. */
export function roundsOf(doc: GameDoc): RoundRecord[] {
  return [...(doc.history || []), ...(doc.status === 'ended' ? [currentRound(doc, doc.createdAt)] : [])];
}

/**
 * What one viewer may see: the public doc plus ONLY their own ticket.
 * The host's phone-contact list is stripped for everyone but the host.
 */
export function project(doc: GameDoc, tickets: Tickets, viewerUid: string | null): GameView {
  const mine = viewerUid != null && Object.prototype.hasOwnProperty.call(tickets, viewerUid) ? tickets[viewerUid] : null;
  const view: GameView = { ...clone(doc), me: mine ? clone(mine) : null };
  if (viewerUid == null || viewerUid !== doc.hostUid) view.contacts = [];
  return view;
}
