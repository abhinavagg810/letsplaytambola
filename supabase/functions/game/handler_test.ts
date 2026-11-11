// Exercises the real request handler in index.ts with the database mocked at the HTTP layer:
// supabase-js talks to an in-memory fake of GoTrue + PostgREST (auth/v1/user, profiles, games, tickets,
// game_contacts, rpc/commit_game with the same optimistic-concurrency rule as the SQL function).
//   npm run test:functions     (= npm run sync:core && deno test --allow-env --allow-net supabase/functions/game/)
// Not deployed: `supabase functions deploy` only bundles what index.ts imports.

type Json = Record<string, unknown>;
interface GameRow { code: string; doc: Json; version: number; host_id: string }
interface TicketRow { code: string; user_id: string; ticket: unknown; dabs: number[]; rev: number }

const users: Record<string, { id: string; name: string; username: string | null; color: string }> = {
  'tok-host': { id: '00000000-0000-4000-8000-000000000001', name: 'Priya Shah', username: 'priya', color: '#FA4A98' },
  'tok-asha': { id: '00000000-0000-4000-8000-000000000002', name: 'Asha', username: 'asha', color: '#40D9C1' },
};
const games = new Map<string, GameRow>();
const tickets: TicketRow[] = [];
const contacts = new Map<string, unknown[]>();
/** Set to N to make the next N commits lose the race (SQLSTATE 40001). */
let failCommits = 0;
let commits = 0;

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const pgError = (code: string, message: string) => reply({ code, message, details: null, hint: null }, code === '23505' ? 409 : 400);
const eq = (url: URL, col: string) => url.searchParams.get(col)?.replace(/^eq\./, '');
/** PostgREST: `.maybeSingle()` asks either for an object or for a list — honour both. */
const rows = (req: Request, list: unknown[]) =>
  (req.headers.get('Accept') ?? '').includes('vnd.pgrst.object')
    ? (list.length === 1 ? reply(list[0]) : pgError('PGRST116', `${list.length} rows`))
    : reply(list);

function commitGame(a: { p_code: string; p_version: number | null; p_doc: Json | null; p_tickets: { uid: string; ticket: unknown; dabs: number[]; rev: number | null }[]; p_contacts: unknown[] | null }) {
  commits++;
  if (failCommits > 0) { failCommits--; return pgError('40001', 'version conflict'); }
  const g = games.get(a.p_code);
  if (a.p_version === null) {
    if (g) return pgError('23505', 'duplicate key');
    games.set(a.p_code, { code: a.p_code, doc: { ...a.p_doc!, contacts: [] }, version: 1, host_id: String(a.p_doc!.hostUid) });
  } else {
    if (!g || g.version !== a.p_version) return pgError('40001', 'version conflict');
    if (a.p_doc) { g.doc = { ...a.p_doc, contacts: [] }; g.version++; }
  }
  for (const t of a.p_tickets ?? []) {
    const cur = tickets.find((r) => r.code === a.p_code && r.user_id === t.uid);
    if (typeof t.rev === 'number') {
      if (!cur || cur.rev !== t.rev) return pgError('40001', 'ticket conflict');
      Object.assign(cur, { ticket: t.ticket, dabs: t.dabs, rev: cur.rev + 1 });
    } else if (cur) return pgError('23505', 'duplicate ticket');
    else tickets.push({ code: a.p_code, user_id: t.uid, ticket: t.ticket, dabs: t.dabs, rev: 1 });
  }
  if (a.p_contacts) contacts.set(a.p_code, a.p_contacts);
  return new Response(null, { status: 204 });
}

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: Request | URL | string, init?: RequestInit) => {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (url.hostname !== 'fake.supabase.test') return realFetch(input, init);
  const p = url.pathname;
  if (p === '/auth/v1/user') {
    const u = users[(req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')];
    return u ? reply({ id: u.id, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' })
      : reply({ code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }, 401);
  }
  if (p === '/rest/v1/profiles') return rows(req, Object.values(users).filter((u) => u.id === eq(url, 'id')));
  if (p === '/rest/v1/games') return rows(req, [...games.values()].filter((g) => g.code === eq(url, 'code')));
  if (p === '/rest/v1/tickets') {
    const uid = eq(url, 'user_id');
    return rows(req, tickets.filter((t) => t.code === eq(url, 'code') && (!uid || t.user_id === uid)));
  }
  if (p === '/rest/v1/game_contacts') {
    const c = contacts.get(eq(url, 'code') ?? '');
    return rows(req, c ? [{ contacts: c }] : []);
  }
  if (p === '/rest/v1/rpc/commit_game') return commitGame(await req.json());
  return reply({ message: `unmocked ${req.method} ${p}` }, 500);
};

// Capture the handler instead of opening a port, then load the function.
Deno.env.set('SUPABASE_URL', 'https://fake.supabase.test');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
let handler!: (req: Request) => Response | Promise<Response>;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (h: typeof handler) => { handler = h; return {}; };
await import('./index.ts');

async function call(token: string | null, body: unknown, method = 'POST') {
  const res = await handler(new Request('https://fake.supabase.test/functions/v1/game', {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, cors: res.headers.get('Access-Control-Allow-Origin'), body: method === 'OPTIONS' ? null : await res.json() };
}
function expect(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }
const input = {
  name: 'Diwali Night', maxSeats: 10, price: 50, hostPlays: true,
  prizes: [{ id: 'full', label: 'Full House', rule: 'full', amt: 300 }], invited: [], contacts: [],
};
let code = '';

Deno.test('CORS preflight and method guard', async () => {
  const pre = await call(null, null, 'OPTIONS');
  expect(pre.status === 200 && pre.cors === '*', 'OPTIONS should answer with CORS headers');
  expect((await call('tok-host', null, 'GET')).status === 405, 'GET is not allowed');
});

Deno.test('rejects callers without a valid session', async () => {
  for (const t of [null, 'nope']) {
    const r = await call(t, { op: 'create', input });
    expect(r.status === 401 && r.body.ok === false, `token ${t} must get 401`);
  }
  expect(games.size === 0, 'nothing may be written');
});

Deno.test('bad request body', async () => {
  const r = await call('tok-host', { op: 'explode' });
  expect(r.status === 400 && r.body.ok === false, 'unknown op is a 400');
});

Deno.test('create: host gets a 5-character code and a private ticket', async () => {
  const r = await call('tok-host', { op: 'create', input });
  expect(r.status === 200 && r.body.ok === true, `create failed: ${JSON.stringify(r.body)}`);
  code = r.body.code;
  expect(/^[A-Z0-9]{5}$/.test(code), `bad code ${code}`);
  const g = games.get(code)!;
  expect(g.host_id === users['tok-host'].id && g.doc.status === 'lobby', 'game row written for the host');
  expect(!('tickets' in g.doc) && !JSON.stringify(g.doc).includes('"dabs"'), 'public doc must not contain tickets');
  expect(tickets.filter((t) => t.code === code).length === 1, 'host ticket stored separately');
});

Deno.test('act: unknown game', async () => {
  const r = await call('tok-asha', { op: 'act', code: 'ZZZZZ', action: { type: 'join' } });
  expect(r.body.ok === false && r.body.error === 'Game not found', 'should say Game not found');
});

Deno.test('act: join deals a ticket; lower-case code is accepted', async () => {
  const r = await call('tok-asha', { op: 'act', code: ` ${code.toLowerCase()} `, action: { type: 'join' } });
  expect(r.body.ok === true, `join failed: ${JSON.stringify(r.body)}`);
  const g = games.get(code)!;
  expect((g.doc.players as { uid: string }[]).some((p) => p.uid === users['tok-asha'].id), 'Asha is in the public player list');
  expect(tickets.some((t) => t.code === code && t.user_id === users['tok-asha'].id), 'Asha has her own ticket row');
  expect(g.version === 2, 'version bumped once');
});

Deno.test('act: only the host can start and draw', async () => {
  const no = await call('tok-asha', { op: 'act', code, action: { type: 'start' } });
  expect(no.body.ok === false && typeof no.body.error === 'string', 'a player cannot start the game');
  expect(games.get(code)!.doc.status === 'lobby', 'still in the lobby');
  expect((await call('tok-host', { op: 'act', code, action: { type: 'start' } })).body.ok === true, 'host starts');
  expect((await call('tok-asha', { op: 'act', code, action: { type: 'draw' } })).body.ok === false, 'a player cannot draw');
  expect((await call('tok-host', { op: 'act', code, action: { type: 'draw' } })).body.ok === true, 'host draws');
  expect((games.get(code)!.doc.called as number[]).length === 1, 'one number called');
});

Deno.test('act: a lost race (40001) is retried and succeeds', async () => {
  const before = (games.get(code)!.doc.called as number[]).length;
  failCommits = 2; commits = 0;
  const r = await call('tok-host', { op: 'act', code, action: { type: 'draw' } });
  expect(r.body.ok === true, 'draw should succeed on the third try');
  expect(commits === 3, `expected 3 commit attempts, saw ${commits}`);
  expect((games.get(code)!.doc.called as number[]).length === before + 1, 'exactly one more number called');
});

Deno.test('act: gives up politely after 5 lost races', async () => {
  failCommits = 5; commits = 0;
  const r = await call('tok-host', { op: 'act', code, action: { type: 'draw' } });
  expect(r.body.ok === false && /busy/i.test(r.body.error), 'should report the game is busy');
  expect(commits === 5, `expected 5 attempts, saw ${commits}`);
  failCommits = 0;
});

Deno.test('act: a false claim is refused and writes no prize', async () => {
  const r = await call('tok-asha', { op: 'act', code, action: { type: 'claim', prizeId: 'full' } });
  expect(r.body.ok === false || !(games.get(code)!.doc.claims as Json).full, 'bogus Full House must not be awarded');
  expect(!(games.get(code)!.doc.claims as Json).full, 'no claim recorded');
});
