// The admin's global date range, kept in the URL so it follows the operator from page to page:
//   ?range=today|yesterday|7d|30d|90d        (default 7d)
//   ?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD   India calendar days, both inclusive, at most 90 days
//   &cmp=1                                   compare with the period of the same length just before
// Pure: the clock is passed in.
import { ADMIN_RETENTION_DAYS } from '../store/types';
import { DAY_MS, istDay, istDayStart, parseIstDay, shortDay } from './time';

export const RANGE_OPTIONS = ['today', 'yesterday', '7d', '30d', '90d', 'custom'] as const;
export type RangeOption = (typeof RANGE_OPTIONS)[number];
export const RANGE_OPTION_LABEL: Record<RangeOption, string> = { today: 'Today', yesterday: 'Yesterday', '7d': '7 days', '30d': '30 days', '90d': '90 days', custom: 'Custom' };
export const DEFAULT_RANGE: RangeOption = '7d';

export interface Period {
  /** Epoch ms: 00:00 India time on the first day (inclusive) … 00:00 after the last day (exclusive). */
  from: number;
  to: number;
  /** Every India calendar day, oldest first ("YYYY-MM-DD"). */
  days: string[];
}
export interface AdminRange extends Period {
  key: RangeOption;
  /** First and last day, inclusive. */
  fromDay: string;
  toDay: string;
  /** "Last 7 days", "Today", "3 Nov – 12 Nov". */
  label: string;
  /** Compare with `prev`. */
  cmp: boolean;
  /** The period of the same length immediately before. */
  prev: Period;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const read = (params: Params, k: string): string => {
  if (params instanceof URLSearchParams) return params.get(k) ?? '';
  const v = params[k];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
};

const period = (from: number, to: number): Period => ({ from, to, days: Array.from({ length: Math.round((to - from) / DAY_MS) }, (_, i) => istDay(from + i * DAY_MS)) });

export function parseRange(params: Params, now: number): AdminRange {
  const today = istDayStart(now);
  const oldest = today - (ADMIN_RETENTION_DAYS - 1) * DAY_MS;
  const asked = read(params, 'range');
  let key: RangeOption = (RANGE_OPTIONS as readonly string[]).includes(asked) ? (asked as RangeOption) : DEFAULT_RANGE;
  let from = today;
  let to = today + DAY_MS;
  if (key === 'custom') {
    const a = parseIstDay(read(params, 'from'));
    const b = parseIstDay(read(params, 'to'));
    if (a === null && b === null) key = DEFAULT_RANGE;
    else {
      let lo = Math.min(a ?? b!, b ?? a!);
      let hi = Math.max(a ?? b!, b ?? a!);
      // Nothing older than the retention period is kept, and nothing has happened after today.
      hi = Math.min(Math.max(hi, oldest), today);
      lo = Math.min(Math.max(lo, oldest), hi);
      from = lo;
      to = hi + DAY_MS;
    }
  }
  if (key === 'yesterday') { from = today - DAY_MS; to = today; }
  else if (key !== 'custom' && key !== 'today') from = to - { '7d': 7, '30d': 30, '90d': 90 }[key] * DAY_MS;
  const p = period(from, to);
  const fromDay = p.days[0];
  const toDay = p.days[p.days.length - 1];
  const label = key === 'today' ? 'Today' : key === 'yesterday' ? 'Yesterday' : key === 'custom' ? (fromDay === toDay ? shortDay(fromDay) : `${shortDay(fromDay)} – ${shortDay(toDay)}`) : `Last ${RANGE_OPTION_LABEL[key]}`;
  return { ...p, key, fromDay, toDay, label, cmp: read(params, 'cmp') === '1', prev: period(from - (to - from), from) };
}

/** The range as URL parameters (defaults left out): what every admin link carries along. */
export function rangeParams(r: Pick<AdminRange, 'key' | 'fromDay' | 'toDay' | 'cmp'>): URLSearchParams {
  const p = new URLSearchParams();
  if (r.key !== DEFAULT_RANGE) p.set('range', r.key);
  if (r.key === 'custom') { p.set('from', r.fromDay); p.set('to', r.toDay); }
  if (r.cmp) p.set('cmp', '1');
  return p;
}

/** `path` with the range (and any extra parameters) as its query string. */
export function withRange(path: string, r: Pick<AdminRange, 'key' | 'fromDay' | 'toDay' | 'cmp'>, extra: Record<string, string | number | undefined | null | false> = {}): string {
  const p = rangeParams(r);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && v !== false && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

export interface Delta {
  /** Change against the previous period, as a fraction (0.25 = +25%). Null when there is nothing to compare with. */
  pct: number | null;
  dir: 'up' | 'down' | 'flat' | 'new';
}
export function delta(current: number, previous: number): Delta {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return { pct: null, dir: 'flat' };
  if (previous === 0) return current === 0 ? { pct: 0, dir: 'flat' } : { pct: null, dir: 'new' };
  const pct = (current - previous) / previous;
  return { pct, dir: Math.abs(pct) < 0.0005 ? 'flat' : pct > 0 ? 'up' : 'down' };
}
