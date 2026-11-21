// CSV exports of the insights tables (events, devices), and the URL filters they share with their pages.
import { placeLabel } from '../client-info';
import { EVENT_NAMES } from '../insights/events';
import type { AdminDevice, AdminEvent, DeviceListQuery, DeviceListSort, EventListQuery } from '../insights/types';
import { DEVICE_LIST_SORTS } from '../insights/types';
import { uaSummary } from '../insights/ua';
import { isGameCode } from '@/core';
import type { GameStore } from '../store';
import { EXPORT_MAX_ROWS } from './queries';
import { csv } from './stats';
import { formatIst } from './time';

type Params = Record<string, string | string[] | undefined> | URLSearchParams;
const read = (params: Params, k: string): string => {
  if (params instanceof URLSearchParams) return params.get(k) ?? '';
  const v = params[k];
  return Array.isArray(v) ? v[0] ?? '' : v ?? '';
};
const pageOf = (params: Params): number => {
  const n = Number.parseInt(read(params, 'page'), 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 100000) : 1;
};

export const EVENTS_PAGE = 50;
export interface EventsFilter { name: string; device: string; code: string; session: string; page: number }

export function parseEventsFilter(params: Params): EventsFilter {
  const name = read(params, 'name');
  const device = read(params, 'device').trim().toLowerCase();
  const code = read(params, 'code').trim().toUpperCase();
  const session = read(params, 'session').trim();
  return {
    name: EVENT_NAMES.includes(name) ? name : '',
    device: /^[0-9a-f]{8}$/.test(device) ? device : '',
    code: isGameCode(code) ? code : '',
    session: /^[A-Za-z0-9-]{8,40}$/.test(session) ? session : '',
    page: pageOf(params),
  };
}

export function eventsQuery(f: EventsFilter, from: number, to: number, limit: number = EVENTS_PAGE, offset: number = (f.page - 1) * EVENTS_PAGE): EventListQuery {
  return { from, to, ...(f.name ? { name: f.name } : {}), ...(f.device ? { device: f.device } : {}), ...(f.code ? { code: f.code } : {}), ...(f.session ? { session: f.session } : {}), limit, offset };
}

export const propsText = (props: AdminEvent['props']): string => Object.entries(props).map(([k, v]) => `${k}=${v}`).join(' ');

export async function allEvents(store: GameStore, f: EventsFilter, from: number, to: number): Promise<AdminEvent[]> {
  const out: AdminEvent[] = [];
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += 200) {
    const page = await store.listEvents(eventsQuery(f, from, to, 200, offset));
    out.push(...page.rows);
    if (page.rows.length < 200 || out.length >= page.total) break;
  }
  return out.slice(0, EXPORT_MAX_ROWS);
}

export function eventsCsv(rows: readonly AdminEvent[]): string {
  return csv(
    ['Time (IST)', 'Event', 'Properties', 'Game code', 'Path', 'Device id', 'Session', 'Source', 'Device type', 'OS', 'Browser', 'In-app browser', 'City', 'Region', 'Country'],
    rows.map((e) => [formatIst(e.at), e.name, propsText(e.props), e.code, e.path, e.device, e.session, e.source, e.deviceType, e.os, e.browser, e.inApp, e.city, e.region, e.country]),
  );
}

export const DEVICES_PAGE = 25;
export interface DevicesFilter { q: string; played: boolean; sort: DeviceListSort; dir: 'asc' | 'desc'; page: number }

export function parseDevicesFilter(params: Params): DevicesFilter {
  const sort = read(params, 'sort');
  return {
    q: read(params, 'q').trim().slice(0, 60),
    played: read(params, 'played') === '1',
    sort: (DEVICE_LIST_SORTS as readonly string[]).includes(sort) ? (sort as DeviceListSort) : 'lastSeen',
    dir: read(params, 'dir') === 'asc' ? 'asc' : 'desc',
    page: pageOf(params),
  };
}

export function devicesQuery(f: DevicesFilter, limit: number = DEVICES_PAGE, offset: number = (f.page - 1) * DEVICES_PAGE): DeviceListQuery {
  return { ...(f.q ? { search: f.q } : {}), played: f.played, sort: f.sort, dir: f.dir, limit, offset };
}

export function devicesQueryString(f: DevicesFilter, over: Partial<DevicesFilter> = {}): string {
  const v = { ...f, ...over };
  const p = new URLSearchParams();
  if (v.q) p.set('q', v.q);
  if (v.played) p.set('played', '1');
  if (v.sort !== 'lastSeen') p.set('sort', v.sort);
  if (v.dir !== 'desc') p.set('dir', v.dir);
  if (v.page > 1) p.set('page', String(v.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function allDevices(store: GameStore, f: DevicesFilter): Promise<AdminDevice[]> {
  const out: AdminDevice[] = [];
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += 100) {
    const page = await store.listDevices(devicesQuery(f, 100, offset));
    out.push(...page.rows);
    if (page.rows.length < 100 || out.length >= page.total) break;
  }
  return out.slice(0, EXPORT_MAX_ROWS);
}

export function devicesCsv(rows: readonly AdminDevice[]): string {
  return csv(
    ['Device id', 'Last name used', 'First seen (IST)', 'Last seen (IST)', 'Sessions', 'Games hosted', 'Games joined', 'Prizes won', 'Recorded amount won (INR)',
      'Latest IP address', 'Location', 'Time zone', 'Device type', 'OS and browser', 'Language', 'Screen', 'First source', 'First referrer', 'First campaign', 'First landing page'],
    rows.map((d) => [d.id, d.lastName, formatIst(d.firstSeen), formatIst(d.lastSeen), d.sessions, d.gamesHosted, d.gamesJoined, d.prizesWon, d.amountWon,
      d.ip, placeLabel(d), d.timezone ?? d.clientTz, d.deviceType, uaSummary({ ...d, device: d.deviceType }), d.language, d.screenW && d.screenH ? `${d.screenW}x${d.screenH}` : '',
      d.firstSource, d.firstReferrer, [d.firstUtmSource, d.firstUtmMedium, d.firstUtmCampaign].filter(Boolean).join(' / '), d.firstLanding]),
  );
}
