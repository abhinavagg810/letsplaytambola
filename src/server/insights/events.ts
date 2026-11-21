// The analytics events the site may record: a SERVER-SIDE whitelist. A name that is not here is dropped; a property that is
// not listed for its event, or has the wrong type, length or value, is dropped. Nothing free-form is ever stored.
// Pure (no I/O) so it is unit-tested and shared by POST /api/t and the tests.
import { isGameCode } from '@/core';

type Spec =
  | { t: 'enum'; v: readonly string[] }
  | { t: 'str'; max: number; re?: RegExp }
  | { t: 'int'; min: number; max: number }
  | { t: 'bool' };

const en = (...v: string[]): Spec => ({ t: 'enum', v });
const str = (max: number, re?: RegExp): Spec => ({ t: 'str', max, re });
const int = (min: number, max: number): Spec => ({ t: 'int', min, max });
const bool: Spec = { t: 'bool' };

export const PAGES = ['home', 'host', 'host_prizes', 'join', 'privacy', 'terms', 'game_invite', 'game_finished', 'game_lobby', 'game_live', 'game_results', 'not_found', 'other'] as const;
export const ROLES = ['host', 'player', 'visitor'] as const;
/** Why a create / join / claim was refused: the API's own error codes. */
export const REASONS = ['forbidden', 'invalid', 'state', 'not_yet', 'taken', 'full', 'no_token', 'bad_request', 'not_found', 'rate_limited', 'busy', 'server', 'network', 'other'] as const;
/** Classes of message shown in a toast. The text itself is never sent. */
export const TOAST_CLASSES = ['need_name', 'need_prize', 'need_code', 'no_players', 'not_yet', 'taken', 'not_called', 'not_on_ticket', 'network', 'rate_limited', 'server', 'not_found', 'finished', 'full', 'host_only', 'copy_failed', 'notify_failed', 'info', 'other'] as const;

const SLUG = /^[a-z0-9][a-z0-9._-]*$/;
const HOSTNAME = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const PATH = /^\/[A-Za-z0-9/_\-.[\]]*$/;

/** name → the properties it may carry. */
export const EVENTS: Record<string, Record<string, Spec>> = {
  // once per browser tab session
  session_start: {
    ref: str(80, HOSTNAME), // document.referrer host, never the full URL
    utm_source: str(60, SLUG), utm_medium: str(60, SLUG), utm_campaign: str(60, SLUG),
    landing: str(80, PATH),
    sw: int(0, 20000), sh: int(0, 20000), vw: int(0, 20000), vh: int(0, 20000),
    dpr: int(0, 1000), // device pixel ratio × 100
    tz: str(40, /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/),
    touch: bool, pwa: bool,
    conn: en('slow-2g', '2g', '3g', '4g', '5g', 'wifi', 'cellular', 'ethernet', 'none', 'other'),
  },
  /** Sent when the tab is hidden or closed; `ms` is the time the page was visible so far in this session. */
  session_end: { ms: int(0, 86_400_000) },
  page_view: { page: en(...PAGES), role: en(...ROLES) },
  // home page
  cta_host: {}, cta_join: {}, cta_code: {}, cta_notify: {},
  // host setup
  host_name_typed: {}, host_preset: { preset: str(24, /^[A-Za-z0-9 &'+-]+$/) }, host_amount_typed: {}, host_price_set: {},
  host_create_tap: {}, host_created: {}, host_create_failed: { reason: en(...REASONS) },
  // sharing
  share_whatsapp: {}, share_copy: {}, share_header_copy: {},
  // joining
  join_name_typed: {}, join_tap: {}, join_ok: {}, join_failed: { reason: en(...REASONS) }, game_not_found: {},
  // in the game
  game_start: {}, first_call: {}, auto_on: {}, auto_off: {}, mute_on: {}, mute_off: {},
  claim_open: {}, claim_valid: { prize: str(16, /^[a-z0-9]+$/), called: int(0, 90) }, claim_invalid: { prize: str(16, /^[a-z0-9]+$/), reason: en('not_yet', 'taken', 'other') },
  new_round: {}, results_seen: { role: en(...ROLES) }, host_own_tap: {},
  // ads: an ad slot was at least half on screen for a second (once per slot per page view)
  ad_seen: { slot: en('lobby_player', 'lobby_host', 'results') },
  // problems
  toast: { cls: en(...TOAST_CLASSES) },
  offline: {}, online: {},
};

export const EVENT_NAMES: readonly string[] = Object.keys(EVENTS);

/** Limits of POST /api/t. */
export const TRACK_MAX_BYTES = 16 * 1024;
export const TRACK_MAX_EVENTS = 50;
/** An event may say it happened at most this long before the batch was sent. */
export const TRACK_MAX_AGE_MS = 60 * 60_000;

export type PropValue = string | number | boolean;
export interface CleanEvent {
  name: string;
  /** Epoch ms (server clock minus the age the client reported). */
  at: number;
  /** Game code, when the event belongs to a game. */
  code: string | null;
  /** Site path with the game code masked: "/", "/host", "/g/[code]". */
  path: string | null;
  props: Record<string, PropValue>;
}

function cleanProp(spec: Spec, v: unknown): PropValue | undefined {
  switch (spec.t) {
    case 'enum': return typeof v === 'string' && spec.v.includes(v) ? v : undefined;
    case 'str': {
      if (typeof v !== 'string') return undefined;
      const s = v.trim();
      return s && s.length <= spec.max && (!spec.re || spec.re.test(s)) ? s : undefined;
    }
    case 'int': return typeof v === 'number' && Number.isInteger(v) && v >= spec.min && v <= spec.max ? v : undefined;
    case 'bool': return typeof v === 'boolean' ? v : undefined;
  }
}

/** "/g/K7RQ2" → "/g/[code]"; query and hash dropped; anything odd → null. */
export function cleanPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.startsWith('/')) return null;
  let p = raw.split(/[?#]/)[0].slice(0, 120);
  if (/^\/g\/[^/]+\/?$/i.test(p)) p = '/g/[code]';
  if (p.length > 1) p = p.replace(/\/+$/, '');
  return p.length <= 80 && PATH.test(p) ? p : null;
}

/** One raw event from a batch → a clean one, or null when it is not on the whitelist. */
export function cleanEvent(raw: unknown, now: number): CleanEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const name = r.n;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(EVENTS, name)) return null;
  const specs = EVENTS[name];
  const props: Record<string, PropValue> = {};
  const given = r.d && typeof r.d === 'object' && !Array.isArray(r.d) ? (r.d as Record<string, unknown>) : {};
  for (const key of Object.keys(specs)) {
    const v = cleanProp(specs[key], given[key]);
    if (v !== undefined) props[key] = v;
  }
  const age = typeof r.o === 'number' && Number.isFinite(r.o) ? Math.min(Math.max(0, Math.floor(r.o)), TRACK_MAX_AGE_MS) : 0;
  const code = typeof r.c === 'string' && isGameCode(r.c.toUpperCase()) ? r.c.toUpperCase() : null;
  return { name, at: now - age, code, path: cleanPath(r.p), props };
}

export interface CleanBatch {
  /** Random id of the browser tab session. */
  session: string;
  /** Where this session came from, as worked out by the browser (utm_source, else the referrer's host, else "direct"). */
  source: string;
  events: CleanEvent[];
}

const SESSION_ID = /^[A-Za-z0-9-]{8,40}$/;

/** A referrer host or utm_source as one short lower-case label: "l.facebook.com" → "facebook", "" → "direct". */
export function normaliseSource(raw: unknown, inApp?: string | null): string {
  let s = typeof raw === 'string' ? raw.trim().toLowerCase().replace(/^www\./, '').slice(0, 60) : '';
  if (!s || !/^[a-z0-9][a-z0-9._-]*$/.test(s)) s = 'direct';
  if (/(^|\.)whatsapp\.(com|net)$|^wa\.me$|^whatsapp$|^wa$/.test(s)) s = 'whatsapp';
  else if (/(^|\.)facebook\.com$|^fb\.(com|me)$|^fb$/.test(s)) s = 'facebook';
  else if (/(^|\.)instagram\.com$|^ig$/.test(s)) s = 'instagram';
  else if (/(^|\.)google\.[a-z.]+$/.test(s)) s = 'google';
  else if (/^t\.co$|(^|\.)twitter\.com$|(^|\.)x\.com$/.test(s)) s = 'x';
  else if (/(^|\.)youtube\.com$|^youtu\.be$/.test(s)) s = 'youtube';
  else if (/(^|\.)bing\.com$/.test(s)) s = 'bing';
  else if (/^t\.me$|(^|\.)telegram\.org$/.test(s)) s = 'telegram';
  // A link tapped inside an app arrives with no referrer; the app's built-in browser is the best clue there is.
  if (s === 'direct' && inApp) s = inApp.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'direct';
  return s;
}

/**
 * A request body of POST /api/t → the clean batch, or null when the envelope itself is unusable.
 * Body: { sid, src?, e: [{ n, o?, p?, c?, d? }, …] }. Events beyond TRACK_MAX_EVENTS are dropped.
 */
export function cleanBatch(body: unknown, now: number, inApp?: string | null): CleanBatch | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.sid !== 'string' || !SESSION_ID.test(b.sid) || !Array.isArray(b.e)) return null;
  const events: CleanEvent[] = [];
  for (const raw of b.e.slice(0, TRACK_MAX_EVENTS)) {
    const e = cleanEvent(raw, now);
    if (e) events.push(e);
  }
  return { session: b.sid, source: normaliseSource(b.src, inApp), events };
}
