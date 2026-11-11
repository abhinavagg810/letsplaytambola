// Pure helpers for the Results / Settle-up / Games / Profile screens.
import type { GameDoc, PlayerPublic, Prize } from './types.ts';
import { roundsOf } from './engine.ts';
import { DELETED_NAME } from './data.ts';

export type Fmt = (n: number) => string;

/** "₹1,250" — Indian digit grouping (12,34,567), no Intl needed. */
export function formatINR(n: number, symbol: string = '₹'): string {
  const r = Math.round(Number(n) || 0);
  const digits = String(Math.abs(r));
  let out = digits;
  if (digits.length > 3) {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = `${rest},${last3}`;
  }
  return `${r < 0 ? '−' : ''}${symbol}${out}`;
}

export interface PlayerResult {
  player: PlayerPublic;
  /** Prizes this player won in the current round. */
  won: Prize[];
  /** Total winnings. */
  w: number;
  /** Winnings minus the ticket price. The host's own ticket is not a cost. */
  net: number;
}

export interface RoundResults {
  /** price x players who joined */
  pot: number;
  /** One entry per player, in join order. */
  results: PlayerResult[];
  /** Winners only: highest winnings first, then most prizes. */
  ranked: PlayerResult[];
}

/** Results of the current round of a game. */
export function roundResults(doc: GameDoc): RoundResults {
  const claims = doc.claims || {};
  const price = doc.price || 0;
  const results = doc.players.map((player) => {
    const won = doc.prizes.filter((z) => claims[z.id] && claims[z.id].uid === player.uid);
    const w = won.reduce((a, z) => a + (z.amt || 0), 0);
    return { player, won, w, net: w - (player.uid === doc.hostUid ? 0 : price) };
  });
  const ranked = results.filter((r) => r.won.length).sort((a, b) => b.w - a.w || b.won.length - a.won.length);
  return { pot: price * doc.players.length, results, ranked };
}

/** The one-line summary at the top of Settle-up. */
export function settleSummary(doc: GameDoc, viewerUid: string | null, fmt: Fmt = formatINR): string {
  if (!doc.price) return 'Just for fun — bragging rights only.';
  const { pot, results } = roundResults(doc);
  if (viewerUid != null && viewerUid === doc.hostUid) {
    const out = results.filter((r) => r.player.uid !== doc.hostUid).reduce((a, r) => a + r.w, 0);
    return `You collected ${fmt(pot)} · pay out ${fmt(out)} · ${fmt(pot - out)} stays with you`;
  }
  const mine = viewerUid != null ? results.find((r) => r.player.uid === viewerUid) : undefined;
  const hostFirst = doc.hostName === DELETED_NAME ? DELETED_NAME : doc.hostName.split(' ')[0];
  return mine && mine.w ? `${hostFirst} owes you ${fmt(mine.w)}` : `Pot ${fmt(pot)} · better luck next round`;
}

/** Note about unclaimed prizes / unassigned pot ('' when there is nothing to say). */
export function unclaimedNote(doc: GameDoc, fmt: Fmt = formatINR): string {
  const claims = doc.claims || {};
  const price = doc.price || 0;
  const pot = price * doc.players.length;
  const un = doc.prizes.filter((z) => !claims[z.id]);
  const left = price ? pot - doc.prizes.reduce((a, z) => a + (z.amt || 0), 0) : 0;
  const parts: string[] = [];
  if (un.length) {
    parts.push(`${un.map((z) => z.label).join(', ')} unclaimed${price ? ' (' + fmt(un.reduce((a, z) => a + z.amt, 0)) + ')' : ''}`);
  }
  if (left > 0) parts.push(`${fmt(left)} of the pot unassigned`);
  return parts.length ? parts.join(' · ') + ' — roll it into the next round?' : '';
}

/** Plain-text results for sharing (WhatsApp). */
export function shareResultsText(doc: GameDoc, fmt: Fmt = formatINR): string {
  const claims = doc.claims || {};
  const lines = [
    `${doc.name} — Round ${doc.round} results`,
    ...doc.prizes.map((z) => `${z.label}: ${claims[z.id] ? claims[z.id].name : 'Unclaimed'}${doc.price ? ' (' + fmt(z.amt) + ')' : ''}`),
  ];
  return lines.join('\n');
}

/**
 * One player's result across every finished round of a game.
 * `money` is true when any of those rounds had a ticket price.
 */
export function gameNet(doc: GameDoc, uid: string): { net: number; wonLabels: string[]; money: boolean } {
  const host = doc.hostUid === uid;
  let net = 0;
  let money = false;
  const wonLabels: string[] = [];
  for (const r of roundsOf(doc)) {
    const pz = r.prizes.filter((z) => r.claims[z.id] && r.claims[z.id].uid === uid);
    net += pz.reduce((a, z) => a + (z.amt || 0), 0) - (r.uids.includes(uid) && !host ? r.price : 0);
    wonLabels.push(...pz.map((z) => z.label));
    if (r.price) money = true;
  }
  return { net, wonLabels, money };
}

/** Lifetime numbers for the Profile screen, over the games this user hosted or played. */
export function profileStats(docs: GameDoc[], uid: string): { games: number; wins: number; net: number; money: boolean } {
  let games = 0;
  let wins = 0;
  let net = 0;
  let money = false;
  for (const doc of docs) {
    const involved = doc.hostUid === uid || doc.players.some((p) => p.uid === uid)
      || (doc.history || []).some((r) => r.uids.includes(uid));
    if (!involved) continue;
    games++;
    const g = gameNet(doc, uid);
    wins += g.wonLabels.length;
    net += g.net;
    if (g.money) money = true;
  }
  return { games, wins, net, money };
}
