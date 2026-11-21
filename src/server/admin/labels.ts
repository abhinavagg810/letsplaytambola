// Turns the keys the aggregates return into words for the admin pages, and builds the series the charts need.
import { countryName, regionName } from '../client-info';
import type { BreakdownRow } from '../insights/types';
import { shortDay } from './time';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "12 Nov 2026" from "2026-11-12". */
export const fullDay = (day: string): string => {
  const [y, m, d] = day.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''} ${y}`;
};

export const UNKNOWN = 'Unknown';

/** "IN" → "India". */
export const countryLabel = (key: string): string => (key ? countryName(key) : UNKNOWN);
/** "IN-MH" → "Maharashtra"; other countries: "CA, United States". */
export function regionLabel(key: string): string {
  if (!key) return UNKNOWN;
  const [country, region] = key.split('-');
  return country === 'IN' ? regionName(country, region) : `${region}, ${countryName(country)}`;
}
/** "Pune|MH|IN" → { city: "Pune", where: "Maharashtra" }. */
export function cityLabel(key: string): { city: string; where: string } {
  if (!key) return { city: UNKNOWN, where: '' };
  const [city, region, country] = key.split('|');
  const where = country === 'IN' ? (region ? regionName('IN', region) : 'India') : [region, country ? countryName(country) : ''].filter(Boolean).join(', ');
  return { city, where };
}

const SOURCE_NAMES: Record<string, string> = {
  direct: 'Direct / typed in', whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', google: 'Google', x: 'X (Twitter)', youtube: 'YouTube',
  bing: 'Bing', telegram: 'Telegram', 'google-app': 'Google app', linkedin: 'LinkedIn', snapchat: 'Snapchat',
};
export const sourceLabel = (key: string): string => (key ? SOURCE_NAMES[key] ?? key : UNKNOWN);

const DEVICE_NAMES: Record<string, string> = { phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop', bot: 'Bot', unknown: UNKNOWN };
export const deviceTypeLabel = (key: string): string => (key ? DEVICE_NAMES[key] ?? key : UNKNOWN);

const SCREEN_NAMES: Record<string, string> = {
  '0-359': 'Under 360 px (small phone)', '360-479': '360–479 px (phone)', '480-767': '480–767 px (large phone)',
  '768-1023': '768–1,023 px (tablet)', '1024-1439': '1,024–1,439 px (laptop)', '1440+': '1,440 px and wider (desktop)',
};
export const SCREEN_ORDER = Object.keys(SCREEN_NAMES);
export const screenLabel = (key: string): string => (key ? SCREEN_NAMES[key] ?? key : UNKNOWN);

const PAGE_NAMES: Record<string, string> = {
  home: 'Home', host: 'Host setup', host_prizes: 'Ways to win', join: 'Join with a code', privacy: 'Privacy Policy', terms: 'Terms of Use',
  game_invite: 'Game: invite (not joined)', game_finished: 'Game: finished (not joined)', game_lobby: 'Game: lobby', game_live: 'Game: live', game_results: 'Game: results',
  not_found: 'Game not found', other: 'Other page',
};
export const pageLabel = (key: string): string => (key ? PAGE_NAMES[key] ?? key : UNKNOWN);

const EVENT_NAMES: Record<string, string> = {
  session_start: 'Session started', session_end: 'Session paused or ended', page_view: 'Page view',
  cta_host: 'Home: “Host a game” tapped', cta_join: 'Home: “Join” tapped', cta_code: 'Home: code box used', cta_notify: 'Home: “Notify me” sent',
  host_name_typed: 'Host: name typed', host_preset: 'Host: preset chosen', host_amount_typed: 'Host: prize amount typed', host_price_set: 'Host: ticket price set',
  host_create_tap: 'Host: “Create game” tapped', host_created: 'Host: game created', host_create_failed: 'Host: create failed',
  share_whatsapp: 'Share: WhatsApp', share_copy: 'Share: copy link (lobby)', share_header_copy: 'Share: copy link (header)',
  join_name_typed: 'Join: name typed', join_tap: 'Join: “Join game” tapped', join_ok: 'Join: joined', join_failed: 'Join: failed', game_not_found: 'Join: game not found',
  game_start: 'Game: started', first_call: 'Game: first number called', auto_on: 'Game: auto-call on', auto_off: 'Game: auto-call off', mute_on: 'Sound off', mute_off: 'Sound on',
  claim_open: 'Claim: sheet opened', claim_valid: 'Claim: valid', claim_invalid: 'Claim: not valid', new_round: 'Game: new round', results_seen: 'Results seen',
  host_own_tap: '“Host my own game” tapped', toast: 'Message shown', offline: 'Went offline', online: 'Back online',
};
export const eventLabel = (name: string): string => EVENT_NAMES[name] ?? name;

const TOAST_NAMES: Record<string, string> = {
  need_name: 'Name missing', need_prize: 'No way to win picked', need_code: 'Code missing', no_players: 'Start with nobody joined', not_yet: 'Claim: not yet',
  taken: 'Claim: already won', not_called: 'Dab: number not called', not_on_ticket: 'Dab: not on ticket', network: 'No connection', rate_limited: 'Too many tries',
  server: 'Server problem', not_found: 'Game not found', finished: 'Game already finished', full: 'Game full', host_only: 'Host-only action', copy_failed: 'Copy failed',
  notify_failed: 'Notify-me failed', other: 'Other message',
};
export const toastLabel = (key: string): string => (key ? TOAST_NAMES[key] ?? key : UNKNOWN);

/** One value per day of the range (0 where a day has no row). */
export function dailySeries(rows: readonly BreakdownRow[], days: readonly string[], pick: 'devices' | 'sessions' | 'events'): { label: string; full: string; value: number }[] {
  const by = new Map(rows.map((r) => [r.key, r[pick]]));
  return days.map((day) => ({ label: shortDay(day), full: fullDay(day), value: by.get(day) ?? 0 }));
}

/** heat[dow][hour] from "d-hh" keys. */
export function heatGrid(rows: readonly BreakdownRow[], pick: 'devices' | 'sessions' | 'events'): number[][] {
  const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const r of rows) {
    const [d, h] = r.key.split('-').map(Number);
    if (d >= 0 && d < 7 && h >= 0 && h < 24) grid[d][h] = r[pick];
  }
  return grid;
}

/** key → row, for looking single values up. */
export const byKey = (rows: readonly BreakdownRow[]): Map<string, BreakdownRow> => new Map(rows.map((r) => [r.key, r]));
