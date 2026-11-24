// First-party usage events → POST /api/t (see docs/API.md). No third-party service, no cookies.
//
//   track('share_whatsapp', { code })     queue one event; returns at once
//
// Events are sent in small batches: every few seconds, when the batch is full, and when the tab is hidden or closed
// (navigator.sendBeacon). Nothing here can block the UI or throw: on the server, with storage blocked, or with the request
// blocked by an ad blocker, it quietly does nothing. The server keeps only names and properties on its whitelist
// (src/server/insights/events.ts) and works out the IP address, place and device from the request itself.
import { getDeviceToken, getSavedName } from './device';

type Props = Record<string, string | number | boolean | null | undefined>;
interface Queued { n: string; t: number; p: string; c?: string; d?: Props }

const ENDPOINT = '/api/t';
const FLUSH_MS = 4000;
/** Send as soon as this many events wait. */
const BATCH = 20;
const SID_KEY = 'lpt:sid';
const SRC_KEY = 'lpt:src';
const MS_KEY = 'lpt:ms';

const queue: Queued[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;
/** Fallbacks for when sessionStorage is blocked. */
const mem: Record<string, string> = {};

const here = (): boolean => typeof window !== 'undefined' && !window.location.pathname.startsWith('/admin');

function sget(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key) ?? mem[key] ?? null;
  } catch {
    return mem[key] ?? null;
  }
}
function sset(key: string, value: string): void {
  mem[key] = value;
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // blocked: the in-memory copy lasts for this page
  }
}

function randomId(): string {
  const b = new Uint8Array(12);
  try {
    crypto.getRandomValues(b);
  } catch {
    for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

const codeOf = (path: string): string | undefined => /^\/g\/([A-Za-z0-9]{5})\/?$/.exec(path)?.[1].toUpperCase();

/** Queue one event. `props.code` (a game code) is sent as the event's game; the rest as its properties. Never throws. */
export function track(name: string, props?: Props): void {
  try {
    if (!here()) return;
    const { code, ...d } = props ?? {};
    const p = window.location.pathname;
    queue.push({ n: name, t: Date.now(), p, c: typeof code === 'string' ? code : codeOf(p), d });
    if (queue.length >= BATCH) flush();
    else timer ??= setTimeout(flush, FLUSH_MS);
  } catch {
    // never let analytics break the page
  }
}

/** Send what is queued. `closing` = the tab is going away: use sendBeacon, which survives the page. */
export function flush(closing?: unknown): void {
  try {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!queue.length || typeof window === 'undefined') return;
    const now = Date.now();
    const body = JSON.stringify({
      sid: sget(SID_KEY) ?? '',
      tk: getDeviceToken(),
      src: sget(SRC_KEY) ?? 'direct',
      e: queue.splice(0, 40).map((q) => ({ n: q.n, o: now - q.t, p: q.p, c: q.c, d: q.d })),
    });
    if (closing === true && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(ENDPOINT, body)) return;
    void fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' }, cache: 'no-store' }).catch(() => undefined);
    if (queue.length) timer = setTimeout(flush, 250);
  } catch {
    // dropped: an ad blocker, no network, storage blocked …
  }
}

// ---------------------------------------------------------------- pages

const PAGES: Record<string, string> = {
  '/': 'home', '/host': 'host', '/host/prizes': 'host_prizes', '/join': 'join', '/privacy': 'privacy', '/terms': 'terms',
  '/about': 'about', '/contact': 'contact', '/how-to-play': 'how_to_play', '/ways-to-win': 'guide_ways', '/tambola-number-calls': 'number_calls',
};
let lastPage = '';

/** A page view of a normal page. Game pages (/g/CODE) are counted by what they show: see trackGameView. */
export function trackPage(pathname: string): void {
  try {
    if (!here() || pathname === lastPage || pathname.startsWith('/g/')) return;
    lastPage = pathname;
    typed.clear();
    const page = PAGES[pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname] ?? 'other';
    track('page_view', { page });
    // A name remembered from last time counts as typed: the field is already filled in.
    if (page === 'host' && getSavedName()) once('host_name_typed');
  } catch {
    // ignore
  }
}

const gameState = new Map<string, string>();

/**
 * What a game page shows, counted once per change: the invite (a visitor), the lobby, the live game, the results.
 * `view` = the view just received; null = "we can't find that game"; undefined = no answer (ignored).
 */
export function trackGameView(code: string, view: { status: string; you: { role: string } } | null | undefined): void {
  try {
    if (view === undefined || !here()) return;
    const role = view?.you.role ?? '';
    const state = view === null ? 'not_found'
      : role === 'visitor' ? (view.status === 'done' ? 'game_finished' : 'game_invite')
      : view.status === 'lobby' ? 'game_lobby' : view.status === 'live' ? 'game_live' : 'game_results';
    if (gameState.get(code) === state) return;
    gameState.set(code, state);
    lastPage = '';
    track('page_view', { page: state, role: role || undefined, code });
    if (state === 'not_found') track('game_not_found', { code });
    if (state === 'game_results') track('results_seen', { role, code });
    if (state === 'game_invite' && getSavedName()) track('join_name_typed', { code });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- toasts: the class of message, never its text

const TOASTS: [RegExp, string][] = [
  [/^Type your name/i, 'need_name'], [/Pick at least one/i, 'need_prize'], [/Type the game code/i, 'need_code'], [/no one has joined/i, 'no_players'],
  [/^Not yet/i, 'not_yet'], [/already won/i, 'taken'], [/hasn.t been called/i, 'not_called'], [/isn.t on your ticket/i, 'not_on_ticket'],
  [/check your internet|reach the/i, 'network'], [/Too many/i, 'rate_limited'], [/went wrong|is busy|refresh the page/i, 'server'], [/can.t find game/i, 'not_found'],
  [/has finished/i, 'finished'], [/is full/i, 'full'], [/Only the host/i, 'host_only'], [/^Copy: /i, 'copy_failed'], [/Couldn.t save/i, 'notify_failed'],
  [/copied|You.re in|on the list/i, 'info'],
];

/** Called by toast(): records which kind of message was shown. */
export function trackToast(message: string): void {
  try {
    const cls = TOASTS.find(([re]) => re.test(message))?.[1] ?? 'other';
    if (cls !== 'info') track('toast', { cls });
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------- once per session: where from, on what

const typed = new Set<string>();
function once(name: string, props?: Props): void {
  if (typed.has(name)) return;
  typed.add(name);
  track(name, props);
}

function startSession(): void {
  if (sget(SID_KEY)) return;
  sset(SID_KEY, randomId());
  const q = new URLSearchParams(window.location.search);
  const slug = (k: string): string | undefined => q.get(k)?.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[^a-z0-9]+/, '').slice(0, 60) || undefined;
  let ref: string | undefined;
  try {
    const host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
    if (host && host !== window.location.hostname) ref = host.slice(0, 80);
  } catch {
    // no usable referrer
  }
  sset(SRC_KEY, slug('utm_source') ?? ref ?? 'direct');
  const nav = navigator as Navigator & { connection?: { effectiveType?: string; type?: string }; standalone?: boolean };
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    // unknown
  }
  const path = window.location.pathname;
  track('session_start', {
    ref, utm_source: slug('utm_source'), utm_medium: slug('utm_medium'), utm_campaign: slug('utm_campaign'),
    landing: codeOf(path) ? '/g/[code]' : path.slice(0, 80),
    sw: window.screen?.width, sh: window.screen?.height, vw: window.innerWidth, vh: window.innerHeight,
    dpr: Math.round((window.devicePixelRatio || 1) * 100), tz,
    touch: (navigator.maxTouchPoints ?? 0) > 0,
    pwa: nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
    conn: nav.connection?.effectiveType ?? nav.connection?.type,
  });
  // The first batch goes out quickly, so the device and its source are known before a game is created or joined.
  if (timer) clearTimeout(timer);
  timer = setTimeout(flush, 800);
}

let visibleSince = 0;
function hidden(): void {
  if (!visibleSince) return;
  const ms = Number(sget(MS_KEY) ?? 0) + (Date.now() - visibleSince);
  visibleSince = 0;
  sset(MS_KEY, String(ms));
  track('session_end', { ms: Math.min(Math.round(ms), 86_400_000) });
  flush(true);
}

/** Clicks, typing and form submits that can be recognised without touching the screens themselves. */
function listen(): void {
  const path = (): string => window.location.pathname;
  document.addEventListener('click', (ev) => {
    try {
      const el = (ev.target as Element | null)?.closest?.('a,button');
      if (!el) return;
      const href = el instanceof HTMLAnchorElement ? new URL(el.href, window.location.href).pathname : '';
      if (path() === '/' && href === '/host') track('cta_host');
      else if (path() === '/' && href === '/join') track('cta_join');
      else if (path().startsWith('/g/') && href === '/host') track('host_own_tap');
      else if (el.closest('[aria-label="Ready-made sets"]')) track('host_preset', { preset: (el.textContent ?? '').trim().slice(0, 24) });
    } catch {
      // ignore
    }
  }, { capture: true, passive: true });
  document.addEventListener('input', (ev) => {
    try {
      const el = ev.target as HTMLInputElement | null;
      if (!el || !el.value) return;
      if (el.name === 'hostName') once('host_name_typed');
      else if (el.name === 'price') once('host_price_set');
      else if ((el.getAttribute('aria-label') ?? '').startsWith('Prize amount')) once('host_amount_typed');
      else if (el.name === 'name' && path().startsWith('/g/')) once('join_name_typed');
    } catch {
      // ignore
    }
  }, { capture: true, passive: true });
  document.addEventListener('submit', (ev) => {
    try {
      if (path() !== '/') return;
      const form = ev.target as HTMLFormElement | null;
      if (form?.querySelector('input[type="tel"]')) track('cta_notify');
      else if (form?.querySelector('input')) track('cta_code');
    } catch {
      // ignore
    }
  }, { capture: true });
}

/** Called once by <TrackPageViews /> in the root layout. */
export function startTracking(): void {
  try {
    if (started || !here()) return;
    started = true;
    startSession();
    visibleSince = document.visibilityState === 'hidden' ? 0 : Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') hidden();
      else visibleSince ||= Date.now();
    });
    window.addEventListener('pagehide', hidden);
    window.addEventListener('offline', () => track('offline'));
    window.addEventListener('online', () => track('online'));
    listen();
  } catch {
    // ignore
  }
}
