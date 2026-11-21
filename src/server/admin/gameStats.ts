// More numbers from game summaries (the documents the admin already reads): the overview's game KPIs with a daily series,
// and the distributions on the Engagement page. Pure, like stats.ts: no I/O, the clock is passed in.
import type { AdminGameRow } from '../store/types';
import { gameFacts, roundsOf } from './stats';
import type { RuleCount } from './stats';
import { istDay, istHour } from './time';
import { istDayIndex } from '../insights/aggregate';

export interface GameDay { day: string; created: number; started: number; finished: number; players: number }

export interface GameOverview {
  created: number;
  /** Games in which at least one round was started / finished. */
  started: number;
  finished: number;
  /** Tickets dealt: one per person per game. */
  players: number;
  /** Different devices that hosted or joined. */
  uniqueDevices: number;
  avgPlayers: number;
  /** Mean length of a finished round (start → finish), or null when none finished. */
  avgDurationMs: number | null;
  finishedRounds: number;
  /** finished / started, 0–1. */
  completionRate: number;
  /** Recorded only — the app never handles money. Prize amounts over every started round; ticket price × players over every started round. */
  prizeMoney: number;
  ticketMoney: number;
  pricedGames: number;
  /** By the India day the game was created, oldest first. */
  daily: GameDay[];
  /** heat[dow][hour]: games created, India time; dow 0 = Monday. */
  heat: number[][];
  picked: RuleCount[];
  won: RuleCount[];
}

const bump = (m: Map<string, RuleCount>, rule: string, label: string): void => {
  const c = m.get(rule);
  if (c) c.count += 1;
  else m.set(rule, { rule, label, count: 1 });
};
const top = (m: Map<string, RuleCount>, n: number): RuleCount[] =>
  [...m.values()].sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)).slice(0, n);

export function gameOverview(rows: readonly AdminGameRow[], days: readonly string[], now: number): GameOverview {
  const daily = new Map<string, GameDay>(days.map((day) => [day, { day, created: 0, started: 0, finished: 0, players: 0 }]));
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  const devices = new Set<string>();
  const picked = new Map<string, RuleCount>();
  const won = new Map<string, RuleCount>();
  let started = 0, finished = 0, players = 0, prizeMoney = 0, ticketMoney = 0, pricedGames = 0, durSum = 0, durN = 0, finishedRounds = 0;
  for (const row of rows) {
    const f = gameFacts(row, now);
    const d = daily.get(istDay(row.createdAt));
    if (f.started) started++;
    if (f.finished) finished++;
    players += f.players;
    if (f.price > 0) pricedGames++;
    if (row.hostDevice) devices.add(row.hostDevice);
    for (const id of Object.values(row.devices)) devices.add(id);
    if (d) {
      d.created += 1;
      d.players += f.players;
      if (f.started) d.started += 1;
      if (f.finished) d.finished += 1;
    }
    heat[(((istDayIndex(row.createdAt) + 3) % 7) + 7) % 7][istHour(row.createdAt)] += 1;
    for (const p of row.doc.prizes ?? []) bump(picked, p.rule, p.label);
    for (const r of roundsOf(row.doc)) {
      if (r.started) {
        prizeMoney += r.prizes.reduce((a, p) => a + (p.amount || 0), 0);
        ticketMoney += (row.doc.price || 0) * r.players;
      }
      if (r.finished) {
        finishedRounds++;
        if (r.startedAt !== null && r.finishedAt !== null && r.finishedAt >= r.startedAt) { durSum += r.finishedAt - r.startedAt; durN++; }
      }
      for (const p of r.prizes) if (p.winnerPid) bump(won, p.rule, p.label);
    }
  }
  return {
    created: rows.length, started, finished, players, uniqueDevices: devices.size,
    avgPlayers: rows.length ? players / rows.length : 0,
    avgDurationMs: durN ? durSum / durN : null, finishedRounds,
    completionRate: started ? finished / started : 0,
    prizeMoney, ticketMoney, pricedGames, daily: [...daily.values()], heat, picked: top(picked, 12), won: top(won, 12),
  };
}

// ---------------------------------------------------------------- distributions

/** The q-quantile (0–1) of numbers sorted ascending, by linear interpolation. Null for an empty list. */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Summary { n: number; p25: number | null; median: number | null; p75: number | null; mean: number | null }
export function summarise(values: readonly number[]): Summary {
  const s = [...values].sort((a, b) => a - b);
  return { n: s.length, p25: quantile(s, 0.25), median: quantile(s, 0.5), p75: quantile(s, 0.75), mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null };
}

/** Summary of a distribution given as (value, how many times) pairs. */
export function summariseCounts(pairs: readonly (readonly [number, number])[]): Summary {
  const values: number[] = [];
  for (const [v, n] of pairs) for (let i = 0; i < Math.min(n, 100_000); i++) values.push(v);
  return summarise(values);
}

export interface Bucket { label: string; count: number }
/** Count values into buckets given by their upper bounds (inclusive); the last bucket takes everything above. */
export function histogram(values: readonly number[], bounds: readonly number[], labels: readonly string[]): Bucket[] {
  const out = labels.map((label) => ({ label, count: 0 }));
  for (const v of values) {
    let i = bounds.findIndex((b) => v <= b);
    if (i < 0) i = labels.length - 1;
    out[i].count += 1;
  }
  return out;
}

const MIN = 60_000;

export interface GameDistributions {
  games: number;
  /** People holding a ticket per game. */
  playersPerGame: Bucket[];
  players: Summary;
  /** Length of finished rounds. */
  duration: Bucket[];
  durationMs: Summary;
  /** How many rounds a game went on to (1 = never replayed). */
  rounds: Bucket[];
  /** Games that finished at least one round, and those that started another. */
  finishedGames: number;
  replayedGames: number;
  /** Recorded prize money per started game (games with none are left out of the summary). */
  prizeMoney: Bucket[];
  prizeMoneySummary: Summary;
  /** Numbers called per finished round. */
  called: Summary;
  /** Created → the first person other than the host joins; created → the first round starts; first join → start. */
  toFirstJoinMs: Summary;
  toStartMs: Summary;
  lobbyMs: Summary;
  /** Games created that nobody else ever joined / that never started. */
  noJoin: number;
  neverStarted: number;
}

export function gameDistributions(rows: readonly AdminGameRow[], now: number): GameDistributions {
  const players: number[] = [], durations: number[] = [], rounds: number[] = [], money: number[] = [], called: number[] = [];
  const toJoin: number[] = [], toStart: number[] = [], lobby: number[] = [];
  let finishedGames = 0, replayedGames = 0, noJoin = 0, neverStarted = 0;
  for (const row of rows) {
    const { doc } = row;
    const f = gameFacts(row, now);
    const all = roundsOf(doc);
    players.push(f.players);
    rounds.push(doc.round || 1);
    if (f.finished) finishedGames++;
    if (f.finished && (doc.round || 1) > 1) replayedGames++;
    if (!f.started) neverStarted++;
    let prize = 0;
    for (const r of all) {
      if (r.started) prize += r.prizes.reduce((a, p) => a + (p.amount || 0), 0);
      if (r.finished) {
        called.push(r.called);
        if (r.startedAt !== null && r.finishedAt !== null && r.finishedAt >= r.startedAt) durations.push(r.finishedAt - r.startedAt);
      }
    }
    if (f.started) money.push(prize);
    const firstJoin = (doc.players ?? []).filter((p) => p.pid !== doc.hostPid).map((p) => p.joinedAt).filter((t) => typeof t === 'number').sort((a, b) => a - b)[0];
    const firstStart = all.find((r) => r.started && r.startedAt !== null)?.startedAt ?? null;
    if (firstJoin === undefined) noJoin++;
    else toJoin.push(Math.max(0, firstJoin - row.createdAt));
    if (firstStart !== null) {
      toStart.push(Math.max(0, firstStart - row.createdAt));
      if (firstJoin !== undefined && firstJoin <= firstStart) lobby.push(firstStart - firstJoin);
    }
  }
  const withMoney = money.filter((m) => m > 0);
  return {
    games: rows.length,
    playersPerGame: histogram(players, [0, 1, 2, 3, 4, 5, 10, 20], ['0', '1', '2', '3', '4', '5', '6–10', '11–20', '21+']),
    players: summarise(players),
    duration: histogram(durations, [5 * MIN, 10 * MIN, 20 * MIN, 30 * MIN, 45 * MIN, 60 * MIN], ['< 5 min', '5–10', '10–20', '20–30', '30–45', '45–60', '60 min +']),
    durationMs: summarise(durations),
    rounds: histogram(rounds, [1, 2, 3], ['1 round', '2 rounds', '3 rounds', '4 or more']),
    finishedGames, replayedGames,
    prizeMoney: histogram(money, [0, 100, 500, 1000, 5000], ['None', '₹1–100', '₹101–500', '₹501–1K', '₹1K–5K', 'Over ₹5K']),
    prizeMoneySummary: summarise(withMoney),
    called: summarise(called),
    toFirstJoinMs: summarise(toJoin), toStartMs: summarise(toStart), lobbyMs: summarise(lobby),
    noJoin, neverStarted,
  };
}
