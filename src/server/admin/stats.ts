// Pure helpers that turn admin game rows into the numbers the admin pages show.
// No I/O and no clock: the same code serves the memory store, the Supabase store and the tests.
import { GAME_TTL_MS } from '@/core';
import type { GameDoc, Prize, RoundRecord } from '@/core';
import type { AdminGameRow } from '../store/types';
import { DAY_MS, istDay, istDayStart, istHour } from './time';

// ---------------------------------------------------------------- one game

export type AdminStatus = 'lobby' | 'live' | 'done' | 'expired';
export const STATUS_LABEL: Record<AdminStatus, string> = { lobby: 'Lobby', live: 'Live', done: 'Finished', expired: 'Expired' };

/** Finished stays Finished; a game left in the lobby or mid-game for 24 hours is Expired. */
export function adminStatus(row: Pick<AdminGameRow, 'doc' | 'updatedAt'>, now: number): AdminStatus {
  if (row.doc.status === 'done') return 'done';
  return now - row.updatedAt > GAME_TTL_MS ? 'expired' : row.doc.status;
}

/** Players can no longer open this game (24h without activity) — whatever its status. */
export function isExpired(row: Pick<AdminGameRow, 'updatedAt'>, now: number): boolean {
  return now - row.updatedAt > GAME_TTL_MS;
}

export interface RoundView extends RoundRecord {
  /** The round the game is in now (as opposed to one remembered in doc.history). */
  current: boolean;
  started: boolean;
  finished: boolean;
}

/** When the current round started: recorded on the document, else worked out from the events that are left. */
function currentStartedAt(doc: GameDoc): number | null {
  if (typeof doc.startedAt === 'number') return doc.startedAt;
  if (doc.status === 'lobby') return null;
  for (let i = (doc.events ?? []).length - 1; i >= 0; i--) if (doc.events[i].kind === 'start') return doc.events[i].at;
  return null;
}

/** Every round of a game, oldest first: the remembered ones, then the current one. */
export function roundsOf(doc: GameDoc): RoundView[] {
  const past: RoundView[] = (doc.history ?? []).map((r) => ({ ...r, prizes: r.prizes ?? [], current: false, started: true, finished: true }));
  const finishedAt = typeof doc.finishedAt === 'number' ? doc.finishedAt : doc.status === 'done' ? doc.updatedAt : null;
  return [
    ...past,
    {
      round: doc.round,
      startedAt: currentStartedAt(doc),
      finishedAt,
      called: (doc.called ?? []).length,
      players: (doc.players ?? []).length,
      prizes: doc.prizes ?? [],
      current: true,
      started: doc.status !== 'lobby',
      finished: doc.status === 'done',
    },
  ];
}

const sumAmounts = (prizes: readonly Prize[]): number => prizes.reduce((a, p) => a + (p.amount || 0), 0);
const wonCount = (prizes: readonly Prize[]): number => prizes.filter((p) => p.winnerPid).length;

export interface GameFacts {
  code: string;
  name: string;
  hostName: string;
  status: AdminStatus;
  expired: boolean;
  players: number;
  /** Numbers called in the current round. */
  called: number;
  round: number;
  price: number;
  prizesTotal: number;
  /** Prizes won in the current round. */
  prizesWon: number;
  createdAt: number;
  /** Last activity. */
  updatedAt: number;
  /** Current round. */
  startedAt: number | null;
  finishedAt: number | null;
  /** Current round: start → finish, or start → last activity while it is not finished. Null before the start. */
  durationMs: number | null;
  /** At least one round was started / finished. */
  started: boolean;
  finished: boolean;
  /** Recorded prize money over every started round (ticket price × players). Information only: the app never handles money. */
  pot: number;
}

export function gameFacts(row: AdminGameRow, now: number): GameFacts {
  const { doc } = row;
  const rounds = roundsOf(doc);
  const cur = rounds[rounds.length - 1];
  const end = cur.finishedAt ?? (cur.started ? row.updatedAt : null);
  return {
    code: row.code,
    name: doc.name,
    hostName: doc.hostName,
    status: adminStatus(row, now),
    expired: isExpired(row, now),
    players: cur.players,
    called: cur.called,
    round: doc.round,
    price: doc.price || 0,
    prizesTotal: cur.prizes.length,
    prizesWon: wonCount(cur.prizes),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    startedAt: cur.startedAt,
    finishedAt: cur.finishedAt,
    durationMs: cur.startedAt !== null && end !== null ? Math.max(0, end - cur.startedAt) : null,
    started: rounds.some((r) => r.started),
    finished: rounds.some((r) => r.finished),
    pot: rounds.filter((r) => r.started).reduce((a, r) => a + sumAmounts(r.prizes), 0),
  };
}

/** What one player won in a game, over every round. */
export function winsOf(doc: GameDoc, pid: string): { count: number; amount: number; labels: string[] } {
  const out = { count: 0, amount: 0, labels: [] as string[] };
  for (const r of roundsOf(doc)) {
    for (const p of r.prizes) {
      if (p.winnerPid !== pid) continue;
      out.count += 1;
      out.amount += p.amount || 0;
      out.labels.push(p.label);
    }
  }
  return out;
}

// ---------------------------------------------------------------- date ranges

export const RANGE_KEYS = ['today', '7d', '30d', '90d'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const RANGE_LABEL: Record<RangeKey, string> = { today: 'Today', '7d': '7 days', '30d': '30 days', '90d': '90 days' };
const RANGE_DAYS: Record<RangeKey, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90 };

export function isRangeKey(v: unknown): v is RangeKey {
  return typeof v === 'string' && (RANGE_KEYS as readonly string[]).includes(v);
}

export interface DateRange {
  key: RangeKey;
  /** Epoch ms, inclusive: 00:00 India time on the first day. */
  from: number;
  /** Epoch ms, exclusive: 00:00 India time after today. */
  to: number;
  /** Every India calendar day in the range, oldest first ("YYYY-MM-DD"). */
  days: string[];
}

/** Whole India calendar days ending today: "7 days" = today and the six days before it. */
export function rangeFor(key: RangeKey, now: number): DateRange {
  const n = RANGE_DAYS[key];
  const to = istDayStart(now) + DAY_MS;
  const from = to - n * DAY_MS;
  return { key, from, to, days: Array.from({ length: n }, (_, i) => istDay(from + i * DAY_MS)) };
}

// ---------------------------------------------------------------- dashboard

export interface RuleCount { rule: string; label: string; count: number }
export interface DayCount { day: string; games: number; players: number }

export interface DashboardStats {
  gamesCreated: number;
  /** Games in which at least one round was started / finished. */
  gamesStarted: number;
  gamesFinished: number;
  /** Tickets dealt: one per person per game (the same person in two games counts twice). */
  totalPlayers: number;
  /** Different devices that hosted or joined. */
  uniqueDevices: number;
  /** totalPlayers / gamesCreated. */
  avgPlayers: number;
  /** Mean numbers called over every finished round. */
  avgCalled: number;
  finishedRounds: number;
  /** Games with a ticket price. */
  pricedGames: number;
  /** pricedGames / gamesCreated, 0–1. */
  pricedShare: number;
  /** Recorded prize money over every started round. Information only. */
  pot: number;
  /** One entry per day of the range, oldest first, by the day the game was created (India time). */
  daily: DayCount[];
  /** Games created per India hour of the day, index 0–23. */
  hours: number[];
  /** Ways to win by how many games picked them, most first (top 10). */
  picked: RuleCount[];
  /** Ways to win by how many times they were won, over every round, most first (top 10). */
  won: RuleCount[];
}

function top(counts: Map<string, RuleCount>, n: number): RuleCount[] {
  return [...counts.values()].sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)).slice(0, n);
}
function bump(counts: Map<string, RuleCount>, p: Pick<Prize, 'rule' | 'label'>): void {
  const c = counts.get(p.rule);
  if (c) c.count += 1;
  else counts.set(p.rule, { rule: p.rule, label: p.label, count: 1 });
}

/** `days` = the days to chart (from rangeFor); games created on other days still count in the totals. */
export function dashboardStats(rows: readonly AdminGameRow[], days: readonly string[], now: number): DashboardStats {
  const daily = new Map<string, DayCount>(days.map((day) => [day, { day, games: 0, players: 0 }]));
  const hours = Array.from({ length: 24 }, () => 0);
  const devices = new Set<string>();
  const picked = new Map<string, RuleCount>();
  const won = new Map<string, RuleCount>();
  let gamesStarted = 0, gamesFinished = 0, totalPlayers = 0, pricedGames = 0, pot = 0, calledSum = 0, finishedRounds = 0;

  for (const row of rows) {
    const facts = gameFacts(row, now);
    if (facts.started) gamesStarted++;
    if (facts.finished) gamesFinished++;
    totalPlayers += facts.players;
    if (facts.price > 0) pricedGames++;
    pot += facts.pot;
    if (row.hostDevice) devices.add(row.hostDevice);
    for (const d of Object.values(row.devices)) devices.add(d);
    const day = daily.get(istDay(row.createdAt));
    if (day) {
      day.games += 1;
      day.players += facts.players;
    }
    hours[istHour(row.createdAt)] += 1;
    for (const p of row.doc.prizes ?? []) bump(picked, p);
    for (const r of roundsOf(row.doc)) {
      if (r.finished) {
        finishedRounds++;
        calledSum += r.called;
      }
      for (const p of r.prizes) if (p.winnerPid) bump(won, p);
    }
  }

  const gamesCreated = rows.length;
  return {
    gamesCreated, gamesStarted, gamesFinished, totalPlayers,
    uniqueDevices: devices.size,
    avgPlayers: gamesCreated ? totalPlayers / gamesCreated : 0,
    avgCalled: finishedRounds ? calledSum / finishedRounds : 0,
    finishedRounds,
    pricedGames,
    pricedShare: gamesCreated ? pricedGames / gamesCreated : 0,
    pot,
    daily: [...daily.values()],
    hours,
    picked: top(picked, 10),
    won: top(won, 10),
  };
}

// ---------------------------------------------------------------- devices ("players")

export interface DeviceGame {
  code: string;
  name: string;
  createdAt: number;
  role: 'host' | 'player';
  /** The name this device used in the game (a host without a ticket: the host name). */
  playedAs: string;
  hasTicket: boolean;
  wins: number;
  amount: number;
  prizeLabels: string[];
}

/** A "player" in the admin is a browser on a device (a short anonymous id) — not a person. */
export interface DeviceStats {
  id: string;
  /** Names typed on this device, most recent first, no repeats. */
  names: string[];
  /** Games joined as a player (not as the host). */
  joined: number;
  hosted: number;
  prizesWon: number;
  /** Recorded prize money won. Information only. */
  amount: number;
  firstSeen: number;
  /** The last activity of any game this device was in. */
  lastSeen: number;
  /** Newest first. */
  games: DeviceGame[];
}

export function deviceStats(rows: readonly AdminGameRow[]): DeviceStats[] {
  const byId = new Map<string, { stats: DeviceStats; named: { name: string; at: number }[] }>();
  const add = (id: string, row: AdminGameRow, game: DeviceGame, seenAt: number): void => {
    if (!id) return;
    let e = byId.get(id);
    if (!e) {
      e = { stats: { id, names: [], joined: 0, hosted: 0, prizesWon: 0, amount: 0, firstSeen: seenAt, lastSeen: row.updatedAt, games: [] }, named: [] };
      byId.set(id, e);
    }
    const s = e.stats;
    if (game.role === 'host') s.hosted += 1;
    else s.joined += 1;
    s.prizesWon += game.wins;
    s.amount += game.amount;
    s.firstSeen = Math.min(s.firstSeen, seenAt);
    s.lastSeen = Math.max(s.lastSeen, row.updatedAt);
    s.games.push(game);
    e.named.push({ name: game.playedAs, at: seenAt });
  };

  for (const row of rows) {
    const { doc } = row;
    let hostSeated = false;
    for (const p of doc.players ?? []) {
      const id = row.devices[p.pid];
      if (!id) continue;
      const isHost = p.pid === doc.hostPid;
      if (isHost) hostSeated = true;
      const w = winsOf(doc, p.pid);
      add(id, row, {
        code: row.code, name: doc.name, createdAt: row.createdAt, role: isHost ? 'host' : 'player',
        playedAs: p.name, hasTicket: true, wins: w.count, amount: w.amount, prizeLabels: w.labels,
      }, p.joinedAt ?? row.createdAt);
    }
    if (!hostSeated) {
      add(row.hostDevice, row, {
        code: row.code, name: doc.name, createdAt: row.createdAt, role: 'host',
        playedAs: doc.hostName, hasTicket: false, wins: 0, amount: 0, prizeLabels: [],
      }, row.createdAt);
    }
  }

  return [...byId.values()].map(({ stats, named }) => {
    const names: string[] = [];
    for (const n of named.sort((a, b) => b.at - a.at)) if (!names.includes(n.name)) names.push(n.name);
    stats.games.sort((a, b) => b.createdAt - a.createdAt || (a.code < b.code ? -1 : 1));
    return { ...stats, names };
  });
}

export const DEVICE_SORTS = ['lastSeen', 'firstSeen', 'games', 'hosted', 'prizes', 'amount'] as const;
export type DeviceSort = (typeof DEVICE_SORTS)[number];

/** Search by a name used (case-insensitive, anywhere) or by the device id, then sort. */
export function filterDevices(list: readonly DeviceStats[], opts: { search?: string; sort?: DeviceSort; dir?: 'asc' | 'desc' }): DeviceStats[] {
  const q = opts.search?.trim().toLowerCase();
  const key = (d: DeviceStats): number => {
    switch (opts.sort) {
      case 'firstSeen': return d.firstSeen;
      case 'games': return d.joined + d.hosted;
      case 'hosted': return d.hosted;
      case 'prizes': return d.prizesWon;
      case 'amount': return d.amount;
      default: return d.lastSeen;
    }
  };
  const sign = opts.dir === 'asc' ? 1 : -1;
  return list
    .filter((d) => !q || d.id.includes(q) || d.names.some((n) => n.toLowerCase().includes(q)))
    .sort((a, b) => sign * (key(a) - key(b)) || (a.id < b.id ? -1 : 1));
}

// ---------------------------------------------------------------- CSV

/** One CSV cell. Text that a spreadsheet could read as a formula (=, +, -, @ …) is defused with a leading quote mark. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csv(header: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
