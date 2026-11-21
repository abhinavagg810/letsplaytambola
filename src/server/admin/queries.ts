// Turns the admin pages' URL parameters into store queries, and store rows into what the pages and exports show.
import { rupees } from '@/core';
import { getStore } from '../store';
import { ADMIN_MAX_PAGE, ADMIN_RETENTION_DAYS, ADMIN_RETENTION_MS } from '../store';
import type { AdminGameQuery, AdminGameRow, GameStore } from '../store';
import { placeLabel } from '../client-info';
import type { AdminParticipation } from '../insights/types';
import { uaSummary } from '../insights/ua';
import { STATUS_LABEL, csv, gameFacts } from './stats';
import { DAY_MS, formatIst, istDay, parseIstDay } from './time';

export const PAGE_SIZE = 25;
/** The most rows an export writes. */
export const EXPORT_MAX_ROWS = 5000;
/** A game counts as "live now" when it is in the lobby or live and something happened this recently. */
export const LIVE_NOW_MS = 15 * 60_000;

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? '' : v ?? '');

export const GAME_STATUSES = ['lobby', 'live', 'done', 'expired'] as const;
export const GAME_SORTS = ['created', 'players', 'activity'] as const;
/** The plays table's saved quick filters. */
export const GAME_QUICK = ['live', 'priced', 'abandoned'] as const;
export const GAME_QUICK_LABEL: Record<(typeof GAME_QUICK)[number], string> = { live: 'Live now', priced: 'With ticket price', abandoned: 'Abandoned in lobby' };

/** The plays table's filters as typed in the URL, cleaned up. Empty string = not set. */
export interface GamesFilter {
  q: string;
  status: '' | (typeof GAME_STATUSES)[number];
  /** '' = none. live: lobby or live with activity in the last 15 minutes (any date); priced: has a ticket price; abandoned: left in the lobby for over an hour. */
  quick: '' | (typeof GAME_QUICK)[number];
  /** India calendar days, "YYYY-MM-DD". */
  from: string;
  to: string;
  sort: (typeof GAME_SORTS)[number];
  dir: 'asc' | 'desc';
  page: number;
}

export function parseGamesFilter(params: Params | URLSearchParams, now: number): GamesFilter {
  const get = (k: string): string => (params instanceof URLSearchParams ? params.get(k) ?? '' : one(params[k]));
  const status = get('status');
  const sort = get('sort');
  const quick = get('quick');
  const oldest = istDay(now - ADMIN_RETENTION_MS);
  const today = istDay(now);
  // Dates outside the last 90 days are pulled back in: nothing older is kept.
  const day = (v: string): string => {
    if (parseIstDay(v) === null) return '';
    return v < oldest ? oldest : v > today ? today : v;
  };
  let from = day(get('from'));
  let to = day(get('to'));
  if (from && to && from > to) [from, to] = [to, from];
  const page = Number.parseInt(get('page'), 10);
  return {
    q: get('q').trim().slice(0, 60),
    quick: (GAME_QUICK as readonly string[]).includes(quick) ? (quick as GamesFilter['quick']) : '',
    status: (GAME_STATUSES as readonly string[]).includes(status) ? (status as GamesFilter['status']) : '',
    from,
    to,
    sort: (GAME_SORTS as readonly string[]).includes(sort) ? (sort as GamesFilter['sort']) : 'created',
    dir: get('dir') === 'asc' ? 'asc' : 'desc',
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100000) : 1,
  };
}

export function gamesQuery(f: GamesFilter, now: number, limit: number = PAGE_SIZE, offset: number = (f.page - 1) * PAGE_SIZE): AdminGameQuery {
  const from = parseIstDay(f.from);
  const to = parseIstDay(f.to);
  const floor = now - ADMIN_RETENTION_DAYS * DAY_MS - DAY_MS;
  if (f.quick === 'live') {
    // "Live now" is about this moment, whatever date range is selected.
    return { from: floor, status: 'open', activeSince: now - LIVE_NOW_MS, ...(f.q ? { search: f.q } : {}), sort: f.sort, dir: f.dir, limit, offset };
  }
  return {
    // Never further back than the retention period.
    from: Math.max(from ?? 0, floor),
    ...(to !== null ? { to: to + DAY_MS } : {}),
    ...(f.quick === 'priced' ? { priced: true } : {}),
    ...(f.quick === 'abandoned' ? { abandoned: true } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.q ? { search: f.q } : {}),
    sort: f.sort,
    dir: f.dir,
    limit,
    offset,
  };
}

/** The filter as a query string (for links, pagination and the export), leaving out defaults. */
export function gamesQueryString(f: GamesFilter, over: Partial<GamesFilter> = {}): string {
  const v = { ...f, ...over };
  const p = new URLSearchParams();
  if (v.q) p.set('q', v.q);
  if (v.status) p.set('status', v.status);
  if (v.quick) p.set('quick', v.quick);
  if (v.from) p.set('from', v.from);
  if (v.to) p.set('to', v.to);
  if (v.sort !== 'created') p.set('sort', v.sort);
  if (v.dir !== 'desc') p.set('dir', v.dir);
  if (v.page > 1) p.set('page', String(v.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

/** Every game matching the filter (all pages), up to EXPORT_MAX_ROWS, in the filter's order. */
export async function allGames(f: GamesFilter, now: number, store: GameStore = getStore()): Promise<AdminGameRow[]> {
  const out: AdminGameRow[] = [];
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += ADMIN_MAX_PAGE) {
    const page = await store.adminListGames(gamesQuery(f, now, ADMIN_MAX_PAGE, offset));
    out.push(...page.rows);
    if (page.rows.length < ADMIN_MAX_PAGE || out.length >= page.total) break;
  }
  return out.slice(0, EXPORT_MAX_ROWS);
}

/** `hosts`: code → the host's participation (place, device, source), when the insights have it. */
export function gamesCsv(rows: readonly AdminGameRow[], now: number, hosts: Record<string, AdminParticipation> = {}): string {
  return csv(
    ['Created (IST)', 'Code', 'Game name', 'Host', 'Status', 'Players', 'Numbers called', 'Round', 'Ticket price (INR)', 'Prizes won', 'Prizes total', 'Recorded pot (INR)', 'Last activity (IST)',
      'Host location', 'Host device', 'Host source', 'Host device id'],
    rows.map((row) => {
      const g = gameFacts(row, now);
      const h = hosts[row.code];
      return [formatIst(g.createdAt), g.code, g.name, g.hostName, STATUS_LABEL[g.status], g.players, g.called, g.round, g.price, g.prizesWon, g.prizesTotal, g.pot, formatIst(g.updatedAt),
        h ? placeLabel(h) : '', h ? uaSummary({ ...h, device: h.deviceType }) : '', h?.source ?? '', row.hostDevice];
    }),
  );
}

/** code → host participation for many games (asked in chunks). */
export async function hostsOf(rows: readonly AdminGameRow[], store: GameStore = getStore()): Promise<Record<string, AdminParticipation>> {
  const out: Record<string, AdminParticipation> = {};
  for (let i = 0; i < rows.length; i += 500) Object.assign(out, await store.gameHosts(rows.slice(i, i + 500).map((r) => r.code)));
  return out;
}

export const csvResponse = (body: string, filename: string): Response =>
  new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });

/** "₹50" or "—" when the game has no ticket price. */
export const priceText = (price: number): string => (price > 0 ? rupees(price) : '—');
