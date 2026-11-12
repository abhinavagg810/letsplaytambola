// India time for the admin pages. India has one time zone and no daylight saving: UTC+05:30, always.
// Pure arithmetic (no Intl), so the output is the same on every server.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A Date whose UTC fields read as the India wall clock for `ms`. */
const shifted = (ms: number): Date => new Date(ms + IST_OFFSET_MS);
const two = (n: number): string => String(n).padStart(2, '0');

/** "2026-11-12": the India calendar day of `ms`. */
export function istDay(ms: number): string {
  const d = shifted(ms);
  return `${d.getUTCFullYear()}-${two(d.getUTCMonth() + 1)}-${two(d.getUTCDate())}`;
}

/** 0–23: the India hour of `ms`. */
export function istHour(ms: number): number {
  return shifted(ms).getUTCHours();
}

/** Epoch ms of 00:00 India time on the India day that contains `ms`. */
export function istDayStart(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

/** Epoch ms of 00:00 India time on "YYYY-MM-DD", or null when that is not a real date. */
export function parseIstDay(day: unknown): number | null {
  if (typeof day !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (!Number.isFinite(utc) || istDay(utc - IST_OFFSET_MS) !== day) return null;
  return utc - IST_OFFSET_MS;
}

function clock(d: Date): string {
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${two(d.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

/** "12 Nov 2026, 9:41 pm IST" */
export function formatIst(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const d = shifted(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${clock(d)} IST`;
}

/** "9:41:07 pm IST" — for timelines within one game. */
export function formatIstTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  const d = shifted(ms);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())} ${h < 12 ? 'am' : 'pm'} IST`;
}

/** "12 Nov" from "2026-11-12". */
export function shortDay(day: string): string {
  const [, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''}`;
}

/** "1h 12m", "4m 05s", "38s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${two(m)}m`;
  if (m > 0) return `${m}m ${two(s % 60)}s`;
  return `${s}s`;
}

/** "12 am", "1 pm" … for the hour-of-day chart. */
export function hourLabel(h: number): string {
  return `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'am' : 'pm'}`;
}
