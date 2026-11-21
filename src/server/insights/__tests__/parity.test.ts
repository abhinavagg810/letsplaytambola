// Proves that the SQL aggregates (supabase/migrations/0003_insights.sql) and the TypeScript ones (../aggregate.ts, used by the
// memory store) give the same answers. How: this file builds one seeded dataset, asks the memory store every question the
// admin asks, and writes the dataset + the expected answers as SQL to supabase/tests/insights_parity.sql, which
// `npm run test:sql` runs against a real PostgreSQL. The test fails when that file is out of date:
//   UPDATE_PARITY=1 npx vitest run src/server/insights/__tests__/parity.test.ts     ← regenerate, then `npm run test:sql`
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../store/memory';
import { DAY_MS } from '../../admin/time';
import { EVENTS } from '../events';
import { newInsightsData } from '../aggregate';
import type { BreakdownDim, InsightsData, ParticipationDim, StoredDevice, StoredEvent } from '../types';
import type { PropValue } from '../events';

const FILE = fileURLToPath(new URL('../../../../supabase/tests/insights_parity.sql', import.meta.url));
export const NOW = Date.UTC(2026, 10, 20, 9, 30, 0);

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PLACES: [string | null, string | null, string | null][] = [
  ['IN', 'MH', 'Mumbai'], ['IN', 'MH', 'Pune'], ['IN', 'MH', 'Navi Mumbai'], ['IN', 'DL', 'Delhi'], ['IN', 'RJ', 'Jaipur'], ['IN', 'KA', 'Bengaluru'],
  ['US', 'CA', 'San Jose'], ['AE', 'DU', 'Dubai'], ['GB', 'ENG', 'London'], [null, null, null], ['IN', null, null], ['BR', 'SP', 'São Paulo'], ['US', 'MO', "O'Fallon"],
];
const AGENTS: [string, string, string, string | null][] = [
  ['phone', 'Android', 'Chrome', null], ['phone', 'iOS', 'Safari', null], ['phone', 'Android', 'WebView', 'WhatsApp'], ['phone', 'iOS', 'WebView', 'Instagram'],
  ['desktop', 'Windows', 'Chrome', null], ['desktop', 'macOS', 'Safari', null], ['tablet', 'iPadOS', 'Safari', null], ['phone', 'Android', 'Samsung Internet', null],
];
const SOURCES = ['direct', 'whatsapp', 'google', 'instagram', 'diwali-campaign', 'facebook'];
const PAGE_LIST = ['home', 'host', 'host_prizes', 'join', 'game_invite', 'game_lobby', 'game_live', 'game_results', 'privacy'];
const CODES = ['K7RQ2', 'AAAA2', 'BBBB3', 'CCCC4', 'DDDD5', 'EEEE6', 'FFFF7', 'GGGG8', 'HHHH9', 'JJJJ2', 'KKKK3', 'MMMM4'];

/** A deterministic dataset with awkward corners: visitors without a token, unknown places, quotes and accents, ties. */
export function seedData(): InsightsData {
  const rnd = mulberry32(20261120);
  const int = (n: number): number => Math.floor(rnd() * n);
  const pick = <T,>(list: readonly T[]): T => list[int(list.length)];
  const hex = (n: number): string => Array.from({ length: n }, () => '0123456789abcdef'[int(16)]).join('');
  const data = newInsightsData();
  const names = Object.keys(EVENTS).filter((n) => !['session_start', 'session_end', 'page_view', 'results_seen'].includes(n));

  for (let i = 0; i < 40; i++) {
    const tokenHash = hex(64);
    const [country, region, city] = PLACES[i % PLACES.length];
    const [deviceType, os, browser, inApp] = pick(AGENTS);
    const firstSeen = NOW - int(75 * DAY_MS) - 1000;
    const source = pick(SOURCES);
    const d: StoredDevice = {
      tokenHash, firstSeen, lastSeen: firstSeen, sessions: 0,
      ip: country ? `49.36.${int(255)}.${int(255)}` : null, country, region, city, lat: country ? 18 + int(1000) / 100 : null, lon: country ? 72 + int(1000) / 100 : null,
      timezone: country === 'IN' ? 'Asia/Kolkata' : null, postal: country === 'IN' ? String(400000 + int(999)) : null,
      deviceType, os, osVersion: String(10 + int(8)), browser, browserVersion: String(100 + int(30)), inApp, ua: `Mozilla/5.0 (test ${i})`, language: pick(['en-IN', 'hi-IN', 'en-US', null]),
      screenW: pick([360, 390, 412, 768, 1366, 1920]), screenH: 800, viewportW: 360, viewportH: 700, dpr: pick([100, 200, 300]), clientTz: 'Asia/Kolkata',
      touch: deviceType !== 'desktop', connection: pick(['4g', '3g', 'wifi', null]), standalone: int(10) === 0,
      firstReferrer: source === 'google' ? 'google.com' : null, firstUtmSource: source === 'diwali-campaign' ? 'diwali-campaign' : null, firstUtmMedium: null,
      firstUtmCampaign: null, firstLanding: pick(['/', '/g/[code]', '/host']), firstSource: source,
      gamesHosted: 0, gamesJoined: 0, prizesWon: int(3), amountWon: int(3) * 50, lastName: pick(['Priya', 'Meera', "D'Souza", 'Ravi', null]),
    };
    data.devices.push(d);
    if (d.ip) {
      data.ips.push({ tokenHash, ip: d.ip, country, region, city, firstSeen, lastSeen: firstSeen + 5000, hits: 1 + int(9) });
      if (int(3) === 0) data.ips.push({ tokenHash, ip: `2405:201:${hex(4)}::${hex(2)}`, country, region, city: 'Thane', firstSeen: firstSeen + 100, lastSeen: firstSeen + 9000, hits: 2 });
    }

    const sessions = 1 + int(5);
    for (let s = 0; s < sessions; s++) {
      const start = s === 0 ? firstSeen : Math.min(NOW - 60_000, firstSeen + int(Math.max(1, NOW - firstSeen)));
      const session = `s${i}-${s}-${hex(6)}`;
      const anonymous = int(12) === 0; // a visitor whose request carried no token
      const push = (offset: number, name: string, props: Record<string, PropValue>, code: string | null = null, path: string | null = '/'): void => {
        const e: StoredEvent = {
          id: data.nextEventId++, at: Math.min(NOW - 1, start + offset), device: anonymous ? null : tokenHash, session, name, code, path, props,
          country, region, city, deviceType, os, browser, inApp, source: s === 0 ? source : pick(SOURCES),
        };
        data.events.push(e);
        if (!anonymous) d.lastSeen = Math.max(d.lastSeen, e.at);
      };
      d.sessions += anonymous ? 0 : 1;
      push(0, 'session_start', { sw: d.screenW ?? 360, sh: 800, vw: 360, vh: 700, dpr: 200, touch: true, ...(d.connection ? { conn: d.connection } : {}), ...(source === 'google' ? { ref: 'google.com' } : {}), landing: d.firstLanding ?? '/' });
      const n = 2 + int(12);
      for (let k = 0; k < n; k++) {
        const kind = int(10);
        const code = int(3) === 0 ? pick(CODES) : null;
        if (kind < 4) push(1000 * (k + 1), 'page_view', { page: pick(PAGE_LIST), ...(int(2) ? { role: pick(['host', 'player', 'visitor']) } : {}) }, code, code ? '/g/[code]' : pick(['/', '/host', '/join']));
        else if (kind === 4) push(1000 * (k + 1), 'results_seen', { role: pick(['host', 'player']) }, pick(CODES), '/g/[code]');
        else if (kind === 5) push(1000 * (k + 1), 'claim_invalid', { prize: pick(['top', 'full', 'early5']), reason: 'not_yet' }, pick(CODES), '/g/[code]');
        else push(1000 * (k + 1), pick(names), {}, code, code ? '/g/[code]' : '/host');
      }
      if (int(3) > 0) push(1000 * (n + 2), 'session_end', { ms: 5000 + int(600_000) });
      if (int(4) === 0) push(1000 * (n + 3), 'session_end', { ms: 700_000 + int(100_000) });
    }
  }

  for (const code of CODES) {
    const pool = [...data.devices];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = int(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const members = pool.slice(0, 1 + int(6));
    members.forEach((d, idx) => {
      const role = idx === 0 ? 'host' : 'player';
      data.participations.push({
        code, tokenHash: d.tokenHash, role, pid: role === 'host' && int(3) === 0 ? null : `p${idx + 1}`, at: Math.min(NOW - 1, d.firstSeen + int(20 * DAY_MS)),
        ip: d.ip, country: d.country, region: d.region, city: d.city, deviceType: d.deviceType, os: d.os, osVersion: d.osVersion,
        browser: d.browser, browserVersion: d.browserVersion, inApp: d.inApp,
      });
      if (role === 'host') d.gamesHosted += 1;
      else d.gamesJoined += 1;
    });
  }
  return data;
}

// ---------------------------------------------------------------- SQL writer

const q = (v: unknown): string => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return `'${String(v).replace(/'/g, "''")}'`;
};
const ts = (ms: number | undefined): string => (ms === undefined ? 'null' : `ins_ts(${ms})`);
const arr = (v: readonly string[] | undefined): string => (v ? `array[${v.map(q).join(', ')}]::text[]` : 'null');
const json = (v: unknown): string => `$j$${JSON.stringify(v)}$j$::jsonb`;

function seedSql(data: InsightsData): string[] {
  const out: string[] = [];
  for (const code of CODES) out.push(`insert into games (code, doc, status, host_token_hash) values (${q(code)}, '{}', 'lobby', repeat('0', 64));`);
  for (const d of data.devices) {
    out.push(`insert into devices values (${[
      q(d.tokenHash), ts(d.firstSeen), ts(d.lastSeen), d.sessions, q(d.ip), q(d.country), q(d.region), q(d.city), q(d.lat), q(d.lon), q(d.timezone), q(d.postal),
      q(d.deviceType), q(d.os), q(d.osVersion), q(d.browser), q(d.browserVersion), q(d.inApp), q(d.ua), q(d.language),
      q(d.screenW), q(d.screenH), q(d.viewportW), q(d.viewportH), q(d.dpr), q(d.clientTz), q(d.touch), q(d.connection), q(d.standalone),
      q(d.firstReferrer), q(d.firstUtmSource), q(d.firstUtmMedium), q(d.firstUtmCampaign), q(d.firstLanding), q(d.firstSource),
      d.gamesHosted, d.gamesJoined, d.prizesWon, d.amountWon, q(d.lastName),
    ].join(', ')});`);
  }
  for (const i of data.ips) out.push(`insert into device_ips values (${[q(i.tokenHash), q(i.ip), q(i.country), q(i.region), q(i.city), ts(i.firstSeen), ts(i.lastSeen), i.hits].join(', ')});`);
  for (const p of data.participations) {
    out.push(`insert into participations values (${[q(p.code), q(p.tokenHash), q(p.role), q(p.pid), ts(p.at), q(p.ip), q(p.country), q(p.region), q(p.city), q(p.deviceType), q(p.os), q(p.osVersion), q(p.browser), q(p.browserVersion), q(p.inApp)].join(', ')});`);
  }
  for (const e of data.events) {
    out.push(`insert into events overriding system value values (${[e.id, ts(e.at), q(e.device), q(e.session), q(e.name), q(e.code), q(e.path), json(e.props), q(e.country), q(e.region), q(e.city), q(e.deviceType), q(e.os), q(e.browser), q(e.inApp), q(e.source)].join(', ')});`);
  }
  return out;
}

async function build(): Promise<string> {
  const data = seedData();
  const store = new MemoryStore({ games: new Map(), phones: new Map(), insights: data }, () => NOW);
  const lines: string[] = [
    '-- GENERATED by src/server/insights/__tests__/parity.test.ts — do not edit by hand.',
    '-- Regenerate: UPDATE_PARITY=1 npx vitest run src/server/insights/__tests__/parity.test.ts',
    '-- Seeds one dataset and checks that every admin_* aggregate returns exactly what the TypeScript helpers return for it.',
    '\\pset tuples_only on', '\\pset format unaligned',
    ...seedSql(data),
    'set role service_role;',
  ];
  const check = (label: string, sql: string, expected: unknown): void => {
    lines.push(`select t.same(${sql}, ${json(expected)}, ${q(label)});`);
  };

  const ranges: [string, number, number][] = [
    ['90d', NOW - 90 * DAY_MS, NOW + DAY_MS], ['7d', NOW - 7 * DAY_MS, NOW], ['mid', NOW - 40 * DAY_MS, NOW - 10 * DAY_MS], ['empty', NOW + DAY_MS, NOW + 2 * DAY_MS],
  ];
  const dims: BreakdownDim[] = ['all', 'name', 'step', 'day', 'hourdow', 'country', 'region', 'city', 'device_type', 'os', 'browser', 'in_app', 'source', 'path', 'code', 'screen', 'prop:page', 'prop:conn', 'prop:touch', 'prop:ms', 'prop:nothing', 'prop:prize+reason', 'prop:page+role'];
  for (const [name, from, to] of ranges) {
    for (const dim of dims) {
      check(`breakdown ${dim} ${name}`, `admin_event_breakdown(${ts(from)}, ${ts(to)}, ${q(dim)})`, await store.eventBreakdown({ from, to, dim }));
    }
    check(`traffic totals ${name}`, `admin_traffic_totals(${ts(from)}, ${ts(to)})`, await store.trafficTotals(from, to));
    for (const dim of ['country', 'region', 'city', 'device_type', 'os', 'browser'] as ParticipationDim[]) {
      check(`participations by ${dim} ${name}`, `admin_participation_breakdown(${ts(from)}, ${ts(to)}, ${q(dim)})`, await store.participationBreakdown(from, to, dim));
    }
  }
  const [, from, to] = ranges[0];
  const filters: { names?: string[]; deviceType?: string; source?: string; code?: string; limit?: number }[] = [
    { names: ['session_start'] }, { names: ['page_view', 'results_seen'], deviceType: 'phone' }, { source: 'whatsapp' }, { code: 'K7RQ2' },
    { deviceType: 'desktop', source: 'direct' }, { names: ['nothing'] }, { limit: 3 }, { limit: 0 }, { limit: 99999 },
  ];
  for (const f of filters) {
    for (const dim of ['source', 'step', 'prop:landing', 'screen'] as BreakdownDim[]) {
      check(`breakdown ${dim} ${JSON.stringify(f)}`,
        `admin_event_breakdown(${ts(from)}, ${ts(to)}, ${q(dim)}, ${arr(f.names)}, ${q(f.deviceType)}, ${q(f.source)}, ${q(f.code)}, ${f.limit ?? 'null'})`,
        await store.eventBreakdown({ from, to, dim, ...f }));
    }
  }
  const funnels: string[][] = [
    ['page_view:home', 'page_view:host', 'host_name_typed', 'host_create_tap', 'host_created', 'game_start', 'results_seen:host'],
    ['page_view:game_invite', 'join_name_typed', 'join_ok', 'results_seen:player'],
    ['session_start'], [], ['nothing', 'session_start'],
  ];
  for (const steps of funnels) {
    for (const f of [{}, { deviceType: 'phone' }, { source: 'whatsapp' }, { deviceType: 'desktop', source: 'google' }, { code: 'AAAA2' }] as { deviceType?: string; source?: string; code?: string }[]) {
      check(`funnel ${steps.length} steps ${JSON.stringify(f)}`,
        `admin_funnel(${ts(from)}, ${ts(to)}, ${arr(steps)}, ${q(f.deviceType)}, ${q(f.source)}, ${q(f.code)})`,
        await store.funnel({ from, to, steps, ...f }));
    }
  }
  for (const at of [NOW, NOW - 20 * DAY_MS, NOW + 3 * DAY_MS]) check(`retention at ${at}`, `admin_retention(${ts(at)})`, await store.retention(at));

  const someDevice = data.devices[3].tokenHash.slice(0, 8);
  const eventQueries = [
    { limit: 10, offset: 0 }, { limit: 7, offset: 20 }, { name: 'page_view', limit: 5, offset: 0 }, { device: someDevice, limit: 50, offset: 0 },
    { code: 'K7RQ2', limit: 200, offset: 0 }, { from: NOW - 5 * DAY_MS, to: NOW - DAY_MS, limit: 3, offset: 1 }, { session: data.events[10].session, limit: 50, offset: 0 },
    { name: 'nothing', limit: 5, offset: 0 }, { limit: 9999, offset: 0 },
  ];
  for (const e of eventQueries as { from?: number; to?: number; name?: string; device?: string; code?: string; session?: string; limit: number; offset: number }[]) {
    check(`events ${JSON.stringify(e)}`,
      `admin_list_events(${ts(e.from)}, ${ts(e.to)}, ${q(e.name)}, ${q(e.device)}, ${q(e.code)}, ${q(e.session)}, ${e.limit}, ${e.offset})`,
      await store.listEvents(e));
  }
  const deviceQueries = [
    { limit: 5, offset: 0 }, { sort: 'firstSeen', dir: 'asc', limit: 5, offset: 2 }, { sort: 'sessions', limit: 100, offset: 0 }, { sort: 'hosted', limit: 6, offset: 0 },
    { sort: 'joined', dir: 'asc', limit: 6, offset: 0 }, { sort: 'won', limit: 4, offset: 0 }, { sort: 'amount', limit: 4, offset: 0 }, { played: true, limit: 100, offset: 0 },
    { search: 'mumbai', limit: 100, offset: 0 }, { search: "d'so", limit: 100, offset: 0 }, { search: '49.36', limit: 3, offset: 0 }, { search: someDevice.slice(0, 5), limit: 10, offset: 0 }, { search: '  ', limit: 2, offset: 0 },
  ];
  for (const d of deviceQueries as { search?: string; played?: boolean; sort?: 'firstSeen'; dir?: 'asc'; limit: number; offset: number }[]) {
    check(`devices ${JSON.stringify(d)}`,
      `admin_list_devices(${q(d.search)}, ${q(d.played ?? false)}, ${q(d.sort ?? 'lastSeen')}, ${q(d.dir !== 'asc')}, ${d.limit}, ${d.offset})`,
      await store.listDevices(d));
  }
  for (const id of [someDevice, data.devices[0].tokenHash.slice(0, 8), 'zzzzzzzz']) check(`device ${id}`, `admin_get_device(${q(id)})`, await store.getDevice(id));
  for (const code of ['K7RQ2', 'AAAA2', 'ZZZZZ']) check(`game insights ${code}`, `admin_game_insights(${q(code)})`, await store.gameInsights(code));
  check('game hosts', `admin_game_hosts(${arr(['K7RQ2', 'BBBB3', 'ZZZZZ'])})`, await store.gameHosts(['K7RQ2', 'BBBB3', 'ZZZZZ']));
  check('game hosts of nothing', `admin_game_hosts(${arr([])})`, await store.gameHosts([]));
  lines.push('reset role;', `select 'parity: ${lines.filter((l) => l.startsWith('select t.same')).length} aggregates match';`);
  return lines.join('\n') + '\n';
}

describe('SQL ↔ TypeScript parity file', () => {
  it('supabase/tests/insights_parity.sql is up to date with the TypeScript aggregates', async () => {
    const sql = await build();
    if (process.env.UPDATE_PARITY === '1' || !existsSync(FILE)) writeFileSync(FILE, sql);
    expect(readFileSync(FILE, 'utf8') === sql, 'out of date — run: UPDATE_PARITY=1 npx vitest run src/server/insights/__tests__/parity.test.ts && npm run test:sql').toBe(true);
  });

  it('the seed has the awkward corners it is meant to have', () => {
    const d = seedData();
    expect(d.events.length).toBeGreaterThan(300);
    expect(d.events.some((e) => e.device === null)).toBe(true);
    expect(d.devices.some((x) => x.country === null)).toBe(true);
    expect(d.devices.some((x) => x.city === "O'Fallon" || x.lastName === "D'Souza")).toBe(true);
    expect(d.participations.some((p) => p.pid === null)).toBe(true);
  });
});
