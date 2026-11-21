// Shapes of the first-party analytics ("insights"): what is stored, what the admin asks, what comes back.
// The memory store keeps these objects as they are; supabase/migrations/0003_insights.sql has the same shapes as tables,
// and its admin_* functions return JSON with exactly these (camelCase) keys.
import type { CleanEvent, PropValue } from './events';

/** Everything the server knows about the request that carried an event, a create or a join. Built from headers only. */
export interface RequestContext {
  /** SHA-256 of the device token, or null for a visitor that sent none. */
  tokenHash: string | null;
  at: number;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  postal: string | null;
  deviceType: string;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  inApp: string | null;
  /** The raw User-Agent, capped. */
  ua: string | null;
  language: string | null;
}

// ---------------------------------------------------------------- stored rows (server only)

export interface StoredDevice {
  tokenHash: string;
  firstSeen: number;
  lastSeen: number;
  /** Browser tab sessions started. */
  sessions: number;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  timezone: string | null;
  postal: string | null;
  deviceType: string | null;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  inApp: string | null;
  ua: string | null;
  language: string | null;
  screenW: number | null;
  screenH: number | null;
  viewportW: number | null;
  viewportH: number | null;
  /** Device pixel ratio × 100. */
  dpr: number | null;
  clientTz: string | null;
  touch: boolean | null;
  connection: string | null;
  standalone: boolean | null;
  /** First touch: how this device first arrived. Never overwritten. */
  firstReferrer: string | null;
  firstUtmSource: string | null;
  firstUtmMedium: string | null;
  firstUtmCampaign: string | null;
  firstLanding: string | null;
  firstSource: string | null;
  gamesHosted: number;
  gamesJoined: number;
  prizesWon: number;
  /** Recorded prize money won (information only). */
  amountWon: number;
  lastName: string | null;
}

export interface StoredIp {
  tokenHash: string;
  ip: string;
  country: string | null;
  region: string | null;
  city: string | null;
  firstSeen: number;
  lastSeen: number;
  hits: number;
}

export interface StoredEvent {
  id: number;
  at: number;
  /** Token hash, or null. */
  device: string | null;
  session: string;
  name: string;
  code: string | null;
  path: string | null;
  props: Record<string, PropValue>;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  inApp: string | null;
  source: string | null;
}

export interface StoredParticipation {
  code: string;
  tokenHash: string;
  role: 'host' | 'player';
  /** The seat, when this device holds a ticket. */
  pid: string | null;
  at: number;
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  deviceType: string | null;
  os: string | null;
  osVersion: string | null;
  browser: string | null;
  browserVersion: string | null;
  inApp: string | null;
}

export interface AuditRow {
  id: number;
  at: number;
  action: string;
  /** What it was done to (a short device id). */
  target: string;
  detail: Record<string, number | string>;
}

/** Everything the insights keep, as plain arrays (the memory store's own data, and the seed of the SQL parity test). */
export interface InsightsData {
  devices: StoredDevice[];
  ips: StoredIp[];
  events: StoredEvent[];
  participations: StoredParticipation[];
  audit: AuditRow[];
  nextEventId: number;
  nextAuditId: number;
}

// ---------------------------------------------------------------- what the admin sees (short device ids only)

export type AdminDevice = Omit<StoredDevice, 'tokenHash'> & { id: string };
export type AdminIp = Omit<StoredIp, 'tokenHash'>;
export type AdminEvent = Omit<StoredEvent, 'device'> & { device: string | null };
export type AdminParticipation = Omit<StoredParticipation, 'tokenHash'> & { device: string; source: string | null };

export const BREAKDOWN_DIMS = ['all', 'name', 'step', 'day', 'hourdow', 'country', 'region', 'city', 'device_type', 'os', 'browser', 'in_app', 'source', 'path', 'code', 'screen'] as const;
export type BreakdownDim = (typeof BREAKDOWN_DIMS)[number] | `prop:${string}`;

export interface EventFilter {
  from: number;
  to: number;
  /** Only these event names. */
  names?: string[];
  deviceType?: string;
  source?: string;
  code?: string;
}
export interface BreakdownQuery extends EventFilter {
  dim: BreakdownDim;
  limit?: number;
}
export interface BreakdownRow {
  key: string;
  events: number;
  sessions: number;
  /** Different devices (a visitor without a device token counts once per session). */
  devices: number;
}

export interface FunnelQuery extends Omit<EventFilter, 'names'> {
  /** Step keys in order (see the "step" dimension). */
  steps: string[];
}
export interface FunnelStep {
  step: string;
  /** Visitors who did this step at all in the period. */
  any: number;
  /** Visitors who did this step AND every step before it. Never rises from one step to the next. */
  kept: number;
}

export interface TrafficTotals {
  visitors: number;
  sessions: number;
  events: number;
  pageViews: number;
  /** Devices first seen in the period. */
  newDevices: number;
  /** Devices active in the period that were first seen before it. */
  returningDevices: number;
  /** Sessions that reported a duration, and the sum of those durations. */
  timedSessions: number;
  sessionMs: number;
}

export const PARTICIPATION_DIMS = ['country', 'region', 'city', 'device_type', 'os', 'browser'] as const;
export type ParticipationDim = (typeof PARTICIPATION_DIMS)[number];
export interface ParticipationRow {
  key: string;
  /** Games hosted from here. */
  games: number;
  /** Tickets held from here (joins, and hosts who play). */
  players: number;
  devices: number;
}

export interface CohortRow {
  /** Monday of the week the devices were first seen (India calendar), "YYYY-MM-DD". */
  week: string;
  size: number;
  /** active[k] = devices of this cohort active k weeks after their first week (k = 0 is the first week itself). */
  active: number[];
}
export interface ReturnRate { eligible: number; returned: number }
export interface RetentionStats {
  cohorts: CohortRow[];
  /** Devices first seen at least N days ago that were active again N or more days after their first day. */
  d1: ReturnRate;
  d7: ReturnRate;
  d30: ReturnRate;
  /** Devices that hosted at all / on two or more different India days. */
  hosts: number;
  returningHosts: number;
}

export interface EventListQuery {
  from?: number;
  to?: number;
  name?: string;
  /** Short device id. */
  device?: string;
  code?: string;
  session?: string;
  limit: number;
  offset: number;
}

export const DEVICE_LIST_SORTS = ['lastSeen', 'firstSeen', 'sessions', 'hosted', 'joined', 'won', 'amount'] as const;
export type DeviceListSort = (typeof DEVICE_LIST_SORTS)[number];
export interface DeviceListQuery {
  /** Part of the short id, the last name used, the city or the IP address. */
  search?: string;
  /** Only devices that hosted or joined a game. */
  played?: boolean;
  sort?: DeviceListSort;
  dir?: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface GameInsights {
  participations: AdminParticipation[];
  /** Analytics events of this game, oldest first (at most 500). */
  events: AdminEvent[];
}

export interface EraseResult {
  /** False when no stored row belongs to that id. */
  found: boolean;
  devices: number;
  ips: number;
  events: number;
  participations: number;
  /** Game summaries whose names were replaced. */
  games: number;
  /** Of those, games still being played: they keep the seat (and its link to the device) until they expire. */
  activeGames: number;
}

export const INSIGHT_TABLES = ['games', 'players', 'notify_numbers', 'devices', 'device_ips', 'participations', 'events', 'admin_audit'] as const;
export type TableCounts = Record<(typeof INSIGHT_TABLES)[number], number>;

/** The name written over a person's names when their device is erased. */
export const ERASED_NAME = 'Erased player';

export type { CleanEvent };
