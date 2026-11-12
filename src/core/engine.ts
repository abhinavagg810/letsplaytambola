// The game rules. Pure: time and randomness come from `ctx`; nothing here touches the network or storage.
// The server runs every action through `applyAction`; the same checks decide what each device may see (`projectView`).
import {
  AUTO_SECONDS, AVATAR_COLORS, DEFAULT_GAME_NAME, MAX_GAME_NAME_LENGTH, MAX_NAME_LENGTH, MAX_PLAYERS, MAX_PRICE,
  isRuleId, ruleName,
} from './data';
import { checkPattern } from './patterns';
import { genTicket } from './ticket';
import { assignPrizeAmounts } from './prizeMoney';
import type {
  Actor, CreateGameInput, Ctx, EngineError, EngineErrorCode, EngineResult, GameAction, GameDoc, GameEventInput,
  GameState, GameView, MemberView, PlayerState, Prize, PublicPlayer, RuleId, VisitorView,
} from './types';

/** How many events the public document keeps. */
export const EVENT_LIMIT = 30;

/** Every user-facing message the engine can return (ported from the prototype's toasts where it has one). */
export const COPY = {
  nameFirst: 'Type your name first',
  nameToJoin: 'Type your name to join',
  nameTooLong: `Names can be up to ${MAX_NAME_LENGTH} letters`,
  gameNameTooLong: `Game names can be up to ${MAX_GAME_NAME_LENGTH} letters`,
  pickOne: 'Pick at least one way to win',
  badPrize: 'That way to win isn’t on our list',
  badPrice: `Ticket price must be a whole number up to ₹${MAX_PRICE}`,
  hostOnly: 'Only the host can do that',
  noPlayers: 'Share the link — no one has joined yet',
  alreadyStarted: 'The game has already started',
  notStarted: 'The game hasn’t started yet',
  gameOver: 'This game has finished',
  joinDone: (host: string) => `This game has finished — ask ${host} to start another round`,
  hostCannotJoin: 'You’re hosting this game',
  full: 'This game is full',
  noTicket: 'Join the game to get a ticket',
  notOnTicket: (n: number) => `${n} isn’t on your ticket`,
  notCalled: (n: number) => `${n} hasn’t been called yet`,
  noPrize: 'That prize isn’t part of this game',
  alreadyWon: (winner: string, prize: string) => `${winner} already won ${prize}`,
  notYet: (prize: string) => `Not yet for ${prize} — keep playing!`,
  roundNotOver: 'Finish this round first',
  badAuto: 'Auto call can be 4, 6, 8 or 10 seconds',
  badAction: 'Something went wrong — please try again',
} as const;

const fail = (code: EngineErrorCode, error: string): EngineError => ({ ok: false, error, code });
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Trim and collapse runs of white space (names are single-line). */
export function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

/** "Meera" → "Meera (2)" when a Meera is already in (case-insensitive), then "(3)" … */
export function uniqueDisplayName(name: string, taken: readonly string[]): string {
  const used = new Set(taken.map((t) => t.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let k = 2; ; k++) {
    const candidate = `${name} (${k})`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

function genPid(rng: () => number, taken: Record<string, unknown>): string {
  const A = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (;;) {
    let s = 'p';
    for (let i = 0; i < 9; i++) s += A[Math.min(A.length - 1, Math.floor(rng() * A.length))];
    if (!Object.prototype.hasOwnProperty.call(taken, s)) return s;
  }
}

function pushEvent(doc: GameDoc, ev: GameEventInput, now: number): void {
  doc.seq += 1;
  doc.events = [...doc.events, { ...ev, seq: doc.seq, at: now } as GameDoc['events'][number]].slice(-EVENT_LIMIT);
}

function addPlayer(state: GameState, name: string, ctx: Ctx): PublicPlayer {
  const { doc } = state;
  const pid = genPid(ctx.rng, state.players);
  const player: PublicPlayer = {
    pid,
    name: uniqueDisplayName(name, doc.players.map((p) => p.name)),
    color: AVATAR_COLORS[doc.players.length % AVATAR_COLORS.length],
    joinedAt: ctx.now,
  };
  doc.players.push(player);
  state.players[pid] = { pid, ticket: genTicket(ctx.rng), marks: [] };
  return player;
}

/** Validate the host's setup and build a new game in the lobby. `code` must already be unique. */
export function createGame(input: CreateGameInput, code: string, ctx: Ctx): EngineResult {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<CreateGameInput>;
  const hostName = cleanName(raw.hostName);
  if (!hostName) return fail('invalid', COPY.nameFirst);
  if (hostName.length > MAX_NAME_LENGTH) return fail('invalid', COPY.nameTooLong);

  const name = cleanName(raw.name) || DEFAULT_GAME_NAME;
  if (name.length > MAX_GAME_NAME_LENGTH) return fail('invalid', COPY.gameNameTooLong);

  const price = raw.price === undefined || raw.price === null ? 0 : raw.price;
  if (typeof price !== 'number' || !Number.isInteger(price) || price < 0 || price > MAX_PRICE) return fail('invalid', COPY.badPrice);

  if (raw.hostPlays !== undefined && typeof raw.hostPlays !== 'boolean') return fail('invalid', COPY.badAction);
  const hostPlays = raw.hostPlays !== false;

  if (!Array.isArray(raw.prizes) || raw.prizes.length === 0) return fail('invalid', COPY.pickOne);
  const rules: RuleId[] = [];
  for (const r of raw.prizes as unknown[]) {
    if (!isRuleId(r) || rules.includes(r)) return fail('invalid', COPY.badPrize);
    rules.push(r);
  }
  const prizes: Prize[] = rules.map((rule) => ({ id: rule, rule, label: ruleName(rule), winnerPid: null, winnerName: null, wonAt: null, amount: 0 }));

  const state: GameState = {
    doc: {
      code, name, hostName, hostPid: null, price, status: 'lobby', called: [], auto: 0, round: 1,
      prizes, players: [], events: [], seq: 0, createdAt: ctx.now, updatedAt: ctx.now, version: 1,
    },
    players: {},
  };
  if (!hostPlays) return { ok: true, state, changed: true, touched: [] };
  const host = addPlayer(state, hostName, ctx);
  state.doc.hostPid = host.pid;
  return { ok: true, state, changed: true, touched: [host.pid], pid: host.pid };
}

/**
 * Apply one action. Never mutates `state`; on success returns the next state.
 * `changed` says whether the public document changed (then its `version` is one higher).
 */
export function applyAction(state: GameState, action: GameAction, actor: Actor, ctx: Ctx): EngineResult {
  if (!action || typeof action !== 'object' || typeof (action as { type?: unknown }).type !== 'string') {
    return fail('invalid', COPY.badAction);
  }
  const next = clone(state);
  const { doc } = next;
  const me: PlayerState | null = actor.pid ? next.players[actor.pid] ?? null : null;
  const publicMe = me ? doc.players.find((p) => p.pid === me.pid) ?? null : null;

  /** Finish a change to the public document. */
  const commit = (touched: string[] = [], pid?: string): EngineResult => {
    doc.version += 1;
    doc.updatedAt = ctx.now;
    return { ok: true, state: next, changed: true, touched, ...(pid ? { pid } : {}) };
  };
  const unchanged = (pid?: string): EngineResult => ({ ok: true, state, changed: false, touched: [], ...(pid ? { pid } : {}) });

  switch (action.type) {
    case 'join': {
      // Same device again (double tap, reopened link): they are already in.
      if (me) return unchanged(me.pid);
      if (actor.isHost) return fail('state', COPY.hostCannotJoin);
      const name = cleanName(action.name);
      if (!name) return fail('invalid', COPY.nameToJoin);
      if (name.length > MAX_NAME_LENGTH) return fail('invalid', COPY.nameTooLong);
      if (doc.status === 'done') return fail('state', COPY.joinDone(doc.hostName));
      if (doc.players.length >= MAX_PLAYERS) return fail('full', COPY.full);
      const p = addPlayer(next, name, ctx);
      // A late joiner adds their ticket price to the prizes that are still open.
      if (doc.status === 'live') assignPrizeAmounts(doc);
      pushEvent(doc, { kind: 'join', pid: p.pid, name: p.name }, ctx.now);
      return commit([p.pid], p.pid);
    }

    case 'start': {
      if (!actor.isHost) return fail('forbidden', COPY.hostOnly);
      if (doc.status !== 'lobby') return fail('state', doc.status === 'live' ? COPY.alreadyStarted : COPY.gameOver);
      if (doc.players.length === 0) return fail('state', COPY.noPlayers);
      doc.status = 'live';
      assignPrizeAmounts(doc);
      pushEvent(doc, { kind: 'start' }, ctx.now);
      return commit();
    }

    case 'draw': {
      if (!actor.isHost) return fail('forbidden', COPY.hostOnly);
      if (doc.status !== 'live') return fail('state', doc.status === 'lobby' ? COPY.notStarted : COPY.gameOver);
      const calledSet = new Set(doc.called);
      const left: number[] = [];
      for (let n = 1; n <= 90; n++) if (!calledSet.has(n)) left.push(n);
      if (left.length === 0) {
        // Cannot normally happen (the 90th call ends the game) — heal rather than get stuck.
        doc.status = 'done';
        doc.auto = 0;
        return commit();
      }
      const n = left[Math.min(left.length - 1, Math.floor(ctx.rng() * left.length))];
      doc.called.push(n);
      pushEvent(doc, { kind: 'call', n }, ctx.now);
      if (doc.called.length === 90) {
        doc.status = 'done';
        doc.auto = 0;
      }
      return commit();
    }

    case 'setAuto': {
      if (!actor.isHost) return fail('forbidden', COPY.hostOnly);
      if (doc.status !== 'live') return fail('state', doc.status === 'lobby' ? COPY.notStarted : COPY.gameOver);
      const auto = action.auto;
      if (auto !== 0 && !AUTO_SECONDS.includes(auto)) return fail('invalid', COPY.badAuto);
      if (doc.auto === auto) return unchanged();
      doc.auto = auto;
      return commit();
    }

    case 'mark': {
      if (!me) return fail('forbidden', COPY.noTicket);
      if (doc.status !== 'live') return fail('state', doc.status === 'lobby' ? COPY.notStarted : COPY.gameOver);
      const n = action.n;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 90) return fail('invalid', COPY.badAction);
      if (action.on !== undefined && typeof action.on !== 'boolean') return fail('invalid', COPY.badAction);
      if (!me.ticket.some((row) => row.includes(n))) return fail('invalid', COPY.notOnTicket(n));
      if (!doc.called.includes(n)) return fail('invalid', COPY.notCalled(n));
      const has = me.marks.includes(n);
      const want = action.on === undefined ? !has : action.on;
      if (want === has) return unchanged();
      me.marks = want ? [...me.marks, n] : me.marks.filter((m) => m !== n);
      // Private change only: the public document (and its version) stays as it is.
      return { ok: true, state: next, changed: false, touched: [me.pid] };
    }

    case 'claim': {
      if (!me || !publicMe) return fail('forbidden', COPY.noTicket);
      if (doc.status !== 'live') return fail('state', doc.status === 'lobby' ? COPY.notStarted : COPY.gameOver);
      const prize = typeof action.prizeId === 'string' ? doc.prizes.find((p) => p.id === action.prizeId) : undefined;
      if (!prize) return fail('invalid', COPY.noPrize);
      if (prize.winnerPid) return fail('taken', COPY.alreadyWon(prize.winnerName ?? 'Someone', prize.label));
      if (!checkPattern(me.ticket, me.marks, doc.called, prize.rule)) return fail('not_yet', COPY.notYet(prize.label));
      prize.winnerPid = me.pid;
      prize.winnerName = publicMe.name;
      prize.wonAt = ctx.now;
      pushEvent(doc, { kind: 'win', pid: me.pid, name: publicMe.name, prizeId: prize.id, label: prize.label }, ctx.now);
      if (doc.prizes.every((p) => p.winnerPid)) {
        doc.status = 'done';
        doc.auto = 0;
      }
      return commit();
    }

    case 'newRound': {
      if (!actor.isHost) return fail('forbidden', COPY.hostOnly);
      if (doc.status !== 'done') return fail('state', COPY.roundNotOver);
      doc.status = 'lobby';
      doc.called = [];
      doc.auto = 0;
      doc.round += 1;
      for (const p of doc.prizes) {
        p.winnerPid = null;
        p.winnerName = null;
        p.wonAt = null;
        p.amount = 0;
      }
      const touched: string[] = [];
      for (const p of doc.players) {
        next.players[p.pid] = { pid: p.pid, ticket: genTicket(ctx.rng), marks: [] };
        touched.push(p.pid);
      }
      pushEvent(doc, { kind: 'round', round: doc.round }, ctx.now);
      return commit(touched);
    }
  }
  return fail('invalid', COPY.badAction);
}

/**
 * What one device may see. The host and players get the public document plus their OWN ticket and marks;
 * anyone else gets the invite card only. Nothing from `state.players` other than the actor's entry is ever copied.
 */
export function projectView(state: GameState, actor: Actor, now: number): GameView {
  const { doc } = state;
  const mine = actor.pid ? state.players[actor.pid] ?? null : null;
  const publicMe = mine ? doc.players.find((p) => p.pid === mine.pid) ?? null : null;

  if (!actor.isHost && !(mine && publicMe)) {
    const view: VisitorView = {
      code: doc.code, name: doc.name, hostName: doc.hostName, price: doc.price, status: doc.status, round: doc.round,
      playerCount: doc.players.length,
      prizes: doc.prizes.map((p) => ({ id: p.id, rule: p.rule, label: p.label })),
      version: doc.version, now,
      you: { role: 'visitor' },
    };
    return view;
  }

  const own = mine && publicMe ? { pid: mine.pid, ticket: clone(mine.ticket), marks: mine.marks.slice() } : null;
  const you: MemberView['you'] = actor.isHost
    ? { role: 'host', name: publicMe?.name ?? doc.hostName, ...(own ?? {}) }
    : { role: 'player', name: publicMe!.name, ...own! };
  return { ...clone(doc), playerCount: doc.players.length, now, you };
}

/** The newest win event, for the banner ("Meera wins Top Line!"). */
export function latestWin(doc: Pick<GameDoc, 'events'>): Extract<GameDoc['events'][number], { kind: 'win' }> | null {
  for (let i = doc.events.length - 1; i >= 0; i--) {
    const e = doc.events[i];
    if (e.kind === 'win') return e;
  }
  return null;
}

/** Type guards for views: `view.you.role` alone does not narrow the whole view in TypeScript. */
export function isMember(view: GameView | null | undefined): view is MemberView {
  return !!view && view.you.role !== 'visitor';
}
export function isVisitor(view: GameView | null | undefined): view is VisitorView {
  return !!view && view.you.role === 'visitor';
}
