// Shared helpers for the end-to-end suite (plain Node + Playwright, no test framework).
// Playwright is NOT a dependency of this project: it is resolved from a global install (see README "End-to-end tests").
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Find Playwright: a local install, NODE_PATH, or the global npm folder. Throws a clear message when it is missing. */
export function loadPlaywright() {
  const roots = [process.cwd(), ...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean)];
  try {
    roots.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim());
  } catch {
    // no npm on the PATH: the other roots may still work
  }
  for (const root of roots) {
    try {
      return createRequire(path.join(root, 'noop.js'))('playwright');
    } catch {
      // try the next place
    }
  }
  throw new Error(
    'Playwright was not found. It is deliberately not in package.json.\n' +
      'Install it once on this computer:  npm install -g playwright && npx playwright install chromium\n' +
      '(or set NODE_PATH to a folder that contains it), then run npm run e2e again.',
  );
}

// ---------------------------------------------------------------- devices

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

/** Browser-context options for the kinds of device the audience uses. Each context is a separate "device" (own storage). */
export const DEVICES = {
  android: { viewport: { width: 360, height: 760 }, userAgent: ANDROID_UA, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-IN' },
  androidLarge: { viewport: { width: 412, height: 892 }, userAgent: ANDROID_UA, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-IN' },
  iphone: { viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-IN' },
  desktop: { viewport: { width: 1280, height: 800 }, locale: 'en-IN' },
};

/**
 * Runs in the page before any script: records what the voice caller is asked to say (headless browsers have no voices),
 * and lets a test read it back with `spoken(page)`.
 */
const SPEECH_SPY = `(() => {
  const said = [];
  window.__said = said;
  const synth = window.speechSynthesis;
  if (!synth) return;
  try {
    synth.speak = (u) => { said.push({ text: u.text, volume: u.volume, rate: u.rate, pitch: u.pitch, lang: u.lang }); };
    synth.cancel = () => { said.push({ cancel: true }); };
  } catch (e) { /* read-only in this browser */ }
})();`;

export async function spoken(page) {
  return page.evaluate(() => (window.__said || []).filter((u) => !u.cancel && u.volume !== 0).map((u) => u.text));
}

// ---------------------------------------------------------------- HTTP API (one device = one token)

export const newToken = () => randomUUID();

/**
 * Every simulated device gets its own network address (sent as X-Forwarded-For), as real phones have — otherwise the
 * whole suite would share one address and trip the per-address rate limits. Works against `next start` / `next dev`.
 * A host that overwrites this header (Vercel) sees one address: run the suite there with a smaller scope.
 */
export function addressFor(token) {
  let h = 2166136261;
  for (const ch of String(token || randomUUID())) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return `10.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${1 + (h & 0xff) % 254}`;
}

/** Call the JSON API as a device. Returns { status, headers, body }. Never throws on HTTP errors. */
export async function api(method, urlPath, token, body, extraHeaders = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      ...(token ? { 'x-device-token': token } : {}),
      'x-forwarded-for': addressFor(token),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON
  }
  return { status: res.status, headers: res.headers, body: json, text };
}
export const act = (code, token, action) => api('POST', `/api/games/${code}/act`, token, action);
export const view = (code, token) => api('GET', `/api/games/${code}`, token);

export async function createGame(token, input = {}) {
  const r = await api('POST', '/api/games', token, { hostName: 'Priya', prizes: ['early5', 'top', 'middle', 'bottom', 'corners', 'full'], ...input });
  if (r.status !== 201) throw new Error(`create failed: ${r.status} ${r.text}`);
  return r.body.code;
}

/** Draw until `want(called)` is true (or the round ends). Returns the numbers called so far. */
export async function drawUntil(code, hostToken, want) {
  for (;;) {
    const r = await act(code, hostToken, { type: 'draw' });
    if (r.status !== 200) throw new Error(`draw failed: ${r.status} ${r.text}`);
    const g = r.body.game;
    if (want(g.called) || g.status !== 'live') return g.called;
  }
}

// ---------------------------------------------------------------- an independent reading of the 26 rules
// Written from the one-line rules in docs/design_handoff/data/winning-patterns.json — NOT copied from src/core,
// so the tests compare the server with a second opinion.

const rowsOf = (ticket) => ticket.map((r) => r.filter((n) => n > 0));
/** The numbers a ticket must have dabbed for `rule`, or a count for the "any N numbers" rules. */
export function needFor(ticket, rule, called = []) {
  const rows = rowsOf(ticket);
  const all = rows.flat();
  const [top, mid, bot] = rows;
  const between = (lo, hi) => all.filter((n) => n >= lo && n <= hi);
  switch (rule) {
    case 'early5': return { count: 5 };
    case 'early7': return { count: 7 };
    case 'early9': return { count: 9 };
    case 'lucky3': return { count: 3, among: all.filter((n) => called.slice(0, 5).includes(n)) };
    case 'laddoo': return { nums: [mid[2]] };
    case 'temp': return { nums: [Math.min(...all), Math.max(...all)] };
    case 'top': return { nums: top };
    case 'middle': return { nums: mid };
    case 'bottom': return { nums: bot };
    case 'railway': return { nums: all.filter((n) => n <= 9 || n >= 80) };
    case 'bamboo': return { nums: between(40, 49) };
    case 'corners': return { nums: [top[0], top[4], bot[0], bot[4]] };
    case 'star': return { nums: [top[0], top[4], bot[0], bot[4], mid[2]] };
    case 'six': return { nums: [top[0], top[4], mid[0], mid[4], bot[0], bot[4]] };
    case 'kings': return { nums: [top[0], mid[0], bot[0]] };
    case 'queens': return { nums: [top[4], mid[4], bot[4]] };
    case 'pyramid': return { nums: [top[2], mid[1], mid[3], bot[1], bot[2], bot[3]] };
    case 'rpyramid': return { nums: [top[1], top[2], top[3], mid[1], mid[3], bot[2]] };
    case 'diamond': return { nums: [top[2], mid[0], mid[4], bot[2]] };
    case 'one24': return { nums: [top[0], mid[0], mid[1], bot[0], bot[1], bot[2], bot[3]] };
    case 'breakfast': return { nums: between(1, 29) };
    case 'lunch': return { nums: between(30, 59) };
    case 'dinner': return { nums: between(60, 90) };
    case 'day': return { nums: between(1, 45) };
    case 'night': return { nums: between(46, 90) };
    case 'full': return { nums: all };
    default: throw new Error(`unknown rule ${rule}`);
  }
}
/** Would `rule` be won with these dabs? (dabs must be called numbers on the ticket) */
export function wins(ticket, rule, dabs, called) {
  const ok = new Set(dabs.filter((n) => called.includes(n)));
  const need = needFor(ticket, rule, called);
  if (need.nums) return need.nums.length > 0 && need.nums.every((n) => ok.has(n));
  const pool = need.among ?? ticket.flat().filter(Boolean);
  return pool.filter((n) => ok.has(n)).length >= need.count;
}
export const ALL_RULES = ['early5', 'early7', 'early9', 'lucky3', 'laddoo', 'temp', 'top', 'middle', 'bottom', 'railway', 'bamboo', 'corners', 'star', 'six', 'kings', 'queens', 'pyramid', 'rpyramid', 'diamond', 'one24', 'breakfast', 'lunch', 'dinner', 'day', 'night', 'full'];

// ---------------------------------------------------------------- pages

/** A new "device": its own browser context (storage, token) and one page with the speech spy installed. */
export async function newDevice(browser, kind = 'android', extra = {}) {
  const context = await browser.newContext({ ...DEVICES[kind], extraHTTPHeaders: { 'x-forwarded-for': addressFor() }, ...extra });
  await context.addInitScript(SPEECH_SPY);
  const page = await context.newPage();
  page.consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') page.consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => page.consoleErrors.push(`pageerror: ${e.message}`));
  return page;
}
export const go = (page, urlPath) => page.goto(BASE + urlPath, { waitUntil: 'domcontentloaded' });
/** This device's secret token (made by the app on first use). */
export const tokenOf = (page) => page.evaluate(() => window.localStorage.getItem('lpt:token'));

/** Wait until the page has hydrated (React has attached its handlers), so a click is not lost. */
export async function hydrated(page) {
  await page.waitForFunction(() => {
    const el = document.querySelector('form, button, a');
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps') || k.startsWith('__reactFiber'));
  });
}

/** Host a game through the screens. Returns the game code. */
export async function hostThroughUi(page, { name = 'Priya', gameName, price, hostPlays = true } = {}) {
  await go(page, '/host');
  await hydrated(page);
  await page.locator('input[name="hostName"]').fill(name);
  if (gameName !== undefined) await page.locator('input[name="gameName"]').fill(gameName);
  if (price !== undefined) await page.locator('input[name="price"]').fill(String(price));
  if (!hostPlays) await page.getByRole('switch', { name: /Deal me a ticket/ }).click();
  await page.getByRole('button', { name: 'Create game & get link' }).click();
  await page.waitForURL(/\/g\/[A-Z0-9]{5}$/);
  await page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
  return page.url().split('/g/')[1];
}

/** Open the game link and join with a name. */
export async function joinThroughUi(page, code, name) {
  await go(page, `/g/${code}`);
  await page.getByLabel('What should we call you?').fill(name);
  await page.getByRole('button', { name: 'Join game' }).click();
  await page.getByText(/You’re in!|’s ticket/).first().waitFor();
}

// ---------------------------------------------------------------- assertions

export class Failure extends Error {}
export function check(cond, message) {
  if (!cond) throw new Failure(message);
}
export function equal(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Failure(`${what}: expected ${e}, got ${a}`);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Poll until `fn()` returns something truthy; fails with `what` after `timeout` ms. */
export async function until(fn, what, timeout = 8000, every = 100) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Failure(`timed out waiting for: ${what}`);
    await sleep(every);
  }
}

// ---------------------------------------------------------------- game shortcuts for UI cases

/** Make this page BE the device with `token` (set before the app first reads it). */
export async function useToken(page, token) {
  await page.addInitScript((tok) => {
    try {
      if (!window.localStorage.getItem('lpt:token')) window.localStorage.setItem('lpt:token', tok);
    } catch {
      // storage blocked in this case
    }
  }, token);
  await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': addressFor(token) });
}

/**
 * A game set up through the API with real pages attached: `t` is the runner's case object.
 * people: [{ name, kind }] — the first is the host. Returns { code, host: {page, token}, players: [{page, token, name}] }.
 */
export async function table(t, { input = {}, players = ['Meera'], kinds = [], start = false, hostKind = 'android', prepare = null } = {}) {
  let hostToken;
  let code;
  let seats;
  for (let attempt = 1; ; attempt++) {
    hostToken = newToken();
    code = await createGame(hostToken, input);
    seats = [];
    for (const name of players) {
      const token = newToken();
      const r = await act(code, token, { type: 'join', name });
      if (r.status !== 200) throw new Error(`join failed: ${r.text}`);
      seats.push({ token, name: r.body.game.you.name });
    }
    if (start) await act(code, hostToken, { type: 'start' });
    // `prepare` plays the game forward through the API (e.g. until someone's top line is out). The numbers are random,
    // so now and then the round ends first: it returns false and a fresh game is dealt.
    if (!prepare || (await prepare({ code, hostToken, seats })) !== false) break;
    if (attempt >= 6) throw new Error('could not prepare a game in 6 attempts');
  }
  const hostPage = await t.device(hostKind);
  await useToken(hostPage, hostToken);
  await go(hostPage, `/g/${code}`);
  for (let i = 0; i < seats.length; i++) {
    const page = await t.device(kinds[i] ?? (i % 2 ? 'android' : 'iphone'));
    await useToken(page, seats[i].token);
    await go(page, `/g/${code}`);
    seats[i].page = page;
  }
  return { code, host: { page: hostPage, token: hostToken }, players: seats };
}

/**
 * For `table({ prepare })`: call numbers until everything `rule` needs on seat `seatIndex`'s ticket is out.
 * False when the round ended before that (the pattern needed the 90th number), so the table is dealt again.
 */
export const callUntilComplete = (seatIndex, rule) => async ({ code, hostToken, seats }) => {
  const ticket = (await view(code, seats[seatIndex].token)).body.game.you.ticket;
  const need = needFor(ticket, rule).nums;
  await drawUntil(code, hostToken, (c) => need.every((n) => c.includes(n)));
  return (await view(code, hostToken)).body.game.status === 'live';
};

/** The numbers on a ticket (3 × 9 grid with 0 for blanks). */
export const ticketNumbers = (ticket) => ticket.flat().filter(Boolean);
/** The ticket cell button for number n on a live game page. */
export const cell = (page, n) => page.getByRole('button', { name: new RegExp(`^${n}(, dabbed)?$`) });
/** Text of the toast currently on screen ('' when none). */
export const toastNow = (page) => page.evaluate(() => {
  const regions = [...document.querySelectorAll('[role="status"][aria-live="polite"][aria-atomic="true"]')];
  return regions.map((r) => r.textContent).join('').trim();
});
export const expectToast = (page, text, timeout = 5000) => until(async () => (await toastNow(page)).includes(text), `toast "${text}" (now: "${''}")`, timeout, 50);
