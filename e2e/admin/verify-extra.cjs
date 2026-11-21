const { OUT } = require('./lib.cjs');
const crypto = require('crypto'), fs = require('fs'), http = require('http'), { spawn, execSync } = require('child_process');
const { chromium, adminContext, visit } = require('./pw.cjs');
const { mk, parseCsv, Results, assert, eq, RESULTS } = require('./lib.cjs');
const R = new Results(RESULTS);
const B = 'http://localhost:8603';
const APPDIR = process.env.APPDIR || require('path').resolve(__dirname, '../..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
(async () => {
  const api = mk(B); await api.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.230' });
  const browser = await chromium.launch();

  await R.run('CAP-14', 'The raw device token sent in the beacon body ("tk") is hashed at once: it is never echoed, never in any admin page / export / JSON, and never in the server log — only the 8-character id derived from its hash appears', async () => {
    const token = crypto.randomUUID(), id = crypto.createHash('sha256').update(token).digest('hex').slice(0, 8);
    const r = await fetch(B + '/api/t', { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA, 'x-forwarded-for': '198.51.77.1' }, body: JSON.stringify({ sid: 'tk-test-000001', tk: token, e: [{ n: 'session_start', d: { sw: 390 } }, { n: 'page_view', d: { page: 'home' } }] }) });
    eq([r.status, await r.text(), JSON.stringify([...r.headers]).includes(token)], [204, '', false], 'answer');
    await fetch(B + '/api/t', { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA }, body: `{"sid":"tk-test-000002","tk":"${token}","e":[` }); // malformed: must not be logged with the token
    await sleep(400);
    let seenId = 0;
    for (const u of ['/admin/players?q=' + id, '/admin/players/' + id, '/admin/events?range=today&device=' + id, '/api/admin/players.csv', '/api/admin/events.csv?range=today', '/admin/privacy']) {
      const t = (await api.get(u)).text;
      assert(!t.includes(token) && !t.toLowerCase().includes(token.replace(/-/g, '')), u + ' contains the raw token');
      if (t.includes(id)) seenId++;
    }
    assert(seenId >= 4, 'control: the short id is shown (' + seenId + ')');
    const log = fs.readFileSync(OUT + '/server-8603.log', 'utf8');
    assert(!log.includes(token), 'the server log contains the raw token');
  });

  await R.run('SEC-06', 'Names typed on the player side — <img src=x onerror=…>, "=…", "+…", "-…", "@…" — created through the real public API: inert on the plays list, play detail, players list, player detail and events pages, and defused in the plays and players exports', async () => {
    const names = ['<img src=x onerror=a()>', '=SUM(1+1)*cmd', '+919800000000', '-1+2', '@import'];
    const host = crypto.randomUUID();
    const H = (tok, i) => ({ 'content-type': 'application/json', 'x-device-token': tok, 'user-agent': UA, 'x-forwarded-for': '198.51.78.' + i });
    const g = await (await fetch(B + '/api/games', { method: 'POST', headers: H(host, 1), body: JSON.stringify({ hostName: '=HOST()', name: '<img src=x onerror=__xss=2>', prizes: ['full'] }) })).json();
    assert(g.ok, 'create ' + JSON.stringify(g));
    const ids = [];
    for (const [i, n] of names.entries()) { const tok = crypto.randomUUID(); ids.push(crypto.createHash('sha256').update(tok).digest('hex').slice(0, 8)); const j = await (await fetch(`${B}/api/games/${g.code}/act`, { method: 'POST', headers: H(tok, i + 2), body: JSON.stringify({ type: 'join', name: n }) })).json(); assert(j.ok, 'join as ' + n + ': ' + JSON.stringify(j).slice(0, 200)); }
    await sleep(500);
    const ctx = await adminContext(browser, B);
    let shown = 0;
    for (const u of ['/admin/games?range=today', '/admin/games/' + g.code, '/admin/players', '/admin/players/' + ids[0], '/admin/players/' + ids[1], '/admin/events?range=today&code=' + g.code, '/admin']) {
      const v = await visit(ctx, B + u);
      eq([v.status, v.xss, v.errors.length], [200, null, 0], u);
      eq(await v.page.locator('img[src="x"]').count(), 0, u + ' injected <img>');
      if (v.text.includes('<img src=x onerror=__xss=2>') || v.text.includes('<img src=x onerror=a()>')) shown++;
      await v.page.close();
    }
    assert(shown >= 3, 'the payload was shown as text on ' + shown + ' pages');
    await ctx.close();
    for (const u of ['/api/admin/games.csv', '/api/admin/players.csv']) {
      const rows = parseCsv((await api.get(u)).text);
      for (const row of rows) for (const c of row) assert(!/^[=+\-@\t\r]/.test(c), `${u}: cell ${c}`);
      const flat = rows.flat();
      if (u.includes('games')) assert(flat.includes("'=HOST()"), 'host name defused in plays export');
      else for (const n of names.slice(1)) assert(flat.includes("'" + n), 'player name defused in players export: ' + n);
    }
  });

  await R.run('CAP-15', 'A real browser visit: session_start + page views are batched (not one request per event); closing the tab sends session_end through sendBeacon; with /api/t blocked (ad blocker) hosting and joining a game still work with no page error', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, userAgent: UA });
    const page = await ctx.newPage();
    const posts = []; page.on('request', (r) => { if (r.url().endsWith('/api/t')) posts.push(JSON.parse(r.postData() || '{}')); });
    await page.goto(B + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(1300);
    await page.goto(B + '/host', { waitUntil: 'networkidle' });
    await page.goto(B + '/join', { waitUntil: 'networkidle' });
    await page.waitForTimeout(4800);
    const names = posts.flatMap((p) => p.e.map((e) => e.n));
    assert(names.filter((n) => n === 'session_start').length === 1, 'one session_start: ' + names);
    assert(names.filter((n) => n === 'page_view').length >= 2, 'page views: ' + names); // a batch sent by sendBeacon while a full page load unloads the page is not always visible to the test browser
    assert(posts.length <= names.length - 1, `batched: ${posts.length} requests for ${names.length} events`);
    eq(new Set(posts.map((p) => p.sid)).size, 1, 'one session id across pages');
    const n0 = posts.length;
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(600);
    const last = posts.slice(n0).flatMap((p) => p.e);
    assert(last.some((e) => e.n === 'session_end' && e.d.ms > 3000), 'session_end sent when the tab was hidden: ' + JSON.stringify(last));
    await ctx.close();
    // ad blocker
    const c2 = await browser.newContext({ viewport: { width: 390, height: 800 }, userAgent: UA });
    await c2.route('**/api/t', (r) => r.abort('blockedbyclient'));
    const p2 = await c2.newPage(); const errs = []; p2.on('pageerror', (e) => errs.push(e.message)); p2.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push(m.text()); });
    await p2.goto(B + '/host', { waitUntil: 'networkidle' });
    await p2.locator('input[name="hostName"]').fill('Blocked Host');
    await p2.getByRole('button', { name: /Create game/ }).click();
    await p2.waitForURL('**/g/*', { timeout: 15000 });
    const code = p2.url().split('/g/')[1].slice(0, 5);
    const c3 = await browser.newContext({ viewport: { width: 390, height: 800 }, userAgent: UA }); await c3.route('**/api/t', (r) => r.abort('blockedbyclient'));
    const p3 = await c3.newPage(); p3.on('pageerror', (e) => errs.push(e.message));
    await p3.goto(`${B}/g/${code}`, { waitUntil: 'networkidle' });
    await p3.locator('input[name="name"]').fill('Blocked Guest'); await p3.getByRole('button', { name: 'Join game' }).click();
    await p3.getByText('You’re in', { exact: false }).first().waitFor({ timeout: 15000 });
    await p2.waitForTimeout(5000);
    eq(errs, [], 'page errors with /api/t blocked');
    const adminGame = (await api.get('/api/admin/games/' + code)).json();
    eq([adminGame.facts.players, adminGame.insights.participations.length], [2, 2], 'the game and its server-side records are complete without any browser event');
    await c2.close(); await c3.close();
  });
  await browser.close();

  await R.run('MIG-08', 'Deployed before migration 0003 (a stand-in database that only has 0001 + 0002): creating a game and POST /api/t still work; every admin page answers 200 with the "Run migration 0003" notice and no crash; erase answers a clear 409; nothing is retried in a loop', async () => {
    const FAKE = 8611, PORT = 8610; const calls = {};
    const fake = http.createServer((q, s) => { let body = ''; q.on('data', (d) => (body += d)); q.on('end', () => {
      const fn = (q.url.match(/\/rpc\/([a-z_]+)/) || [])[1];
      const send = (code, v, h = {}) => { s.writeHead(code, { 'content-type': 'application/json', ...h }); s.end(JSON.stringify(v)); };
      if (fn) calls[fn] = (calls[fn] || 0) + 1;
      const KNOWN = { create_game: 1, commit_game: 1, purge_expired_games: 0, admin_get_game: null, admin_games_in_range: { total: 0, rows: [] }, admin_retention_days: 90 };
      if (fn === 'admin_list_games') return /p_priced|p_abandoned/.test(body) ? send(404, { code: 'PGRST202', message: 'Could not find the function public.admin_list_games' }) : send(200, { total: 0, rows: [] });
      if (fn && fn in KNOWN) return send(200, KNOWN[fn]);
      if (fn) return send(404, { code: 'PGRST202', message: `Could not find the function public.${fn} in the schema cache` });
      if (q.url.includes('/realtime/')) return send(202, {});
      if (/\/rest\/v1\/(devices|device_ips|events|participations|admin_audit)/.test(q.url)) return send(404, { code: 'PGRST205', message: 'Could not find the table' });
      return send(200, [], { 'content-range': '*/0' });
    }); }).listen(FAKE);
    try { execSync(`fuser -k ${PORT}/tcp`, { stdio: 'ignore' }); } catch {}
    const srv = spawn('npx', ['next', 'start', '-p', String(PORT)], { cwd: APPDIR, env: { ...process.env, NODE_ENV: 'production', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'test-password-123', SUPABASE_URL: `http://localhost:${FAKE}`, SUPABASE_SERVICE_ROLE_KEY: 'placeholder-service-key' }, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    let log = ''; srv.stdout.on('data', (d) => (log += d)); srv.stderr.on('data', (d) => (log += d));
    const D = `http://localhost:${PORT}`;
    try {
      for (let i = 0; i < 60; i++) { try { await fetch(D + '/robots.txt'); break; } catch { await sleep(500); } }
      const token = crypto.randomUUID();
      const created = await fetch(D + '/api/games', { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-token': token, 'user-agent': UA, 'x-forwarded-for': '49.36.1.1' }, body: JSON.stringify({ hostName: 'Asha', prizes: ['full'] }) });
      eq(created.status, 201, 'create a game: ' + (await created.text()).slice(0, 200));
      for (let i = 0; i < 4; i++) eq((await fetch(D + '/api/t', { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA }, body: JSON.stringify({ sid: 'degrade-000001', tk: token, e: [{ n: 'page_view', d: { page: 'home' } }] }) })).status, 204, '/api/t');
      await sleep(600);
      const writes = (calls.track_batch || 0) + (calls.record_participation || 0);
      for (let i = 0; i < 6; i++) await fetch(D + '/api/t', { method: 'POST', headers: { 'content-type': 'text/plain', 'user-agent': UA }, body: JSON.stringify({ sid: 'degrade-000001', tk: token, e: [{ n: 'page_view', d: { page: 'home' } }] }) });
      await sleep(400);
      const a = mk(D); eq((await a.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.240' })).status, 200, 'sign in');
      const bad = [];
      for (const p of ['', '/acquisition', '/funnels', '/geography', '/technology', '/engagement', '/retention', '/games', '/games?quick=priced', '/games?quick=abandoned', '/players', '/events', '/notify', '/privacy']) {
        const r = await a.get('/admin' + p); const t = r.text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
        if (r.status !== 200 || !/Run migration 0003/.test(t) || /This page couldn.t load|Application error/.test(t)) bad.push(`${p || '/'}: ${r.status} notice=${/Run migration 0003/.test(t)}`);
      }
      const er = await a.post('/api/admin/erase', { device: 'aaaa0001' });
      eq([er.status, /0003_insights/.test(er.json().error)], [409, true], 'erase');
      assert((calls.track_batch || 0) + (calls.record_participation || 0) === writes, 'once known missing, analytics writes are skipped: ' + JSON.stringify(calls));
      assert(bad.length === 0, bad.join(' ; '));
      return JSON.stringify(calls).slice(0, 300);
    } finally { try { process.kill(-srv.pid); } catch {} fake.close(); fs.writeFileSync(OUT + '/server-degrade.log', log); }
  });
})();
