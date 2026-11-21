const { OUT } = require('./lib.cjs');
const crypto = require('crypto'), fs = require('fs');
const { mk, parseCsv, Results, assert, eq, RESULTS } = require('./lib.cjs');
const { build, XSS_SCRIPT, CSV_FORMULA } = require('./seed-data.cjs');
const { chromium, adminContext, visit } = require('./pw.cjs');
const R = new Results(RESULTS);
const B = 'http://localhost:8603', S = 'http://localhost:8604';
const meta = require(OUT + '/seed-meta-8604.json');
const { data } = build(meta.now);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (Linux; Android 14; QA-LEAK-UA-MARKER) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const person = (i) => { const token = crypto.randomUUID(); const hash = crypto.createHash('sha256').update(token.toLowerCase()).digest('hex'); return { token, hash, ip: `77.88.${i}.99`, city: `Leakville${i}`, h: { 'content-type': 'application/json', 'x-device-token': token, 'user-agent': UA, 'x-forwarded-for': `77.88.${i}.99`, 'x-vercel-ip-country': 'IN', 'x-vercel-ip-country-region': 'MH', 'x-vercel-ip-city': `Leakville${i}`, 'x-vercel-ip-latitude': '19.07', 'x-vercel-ip-longitude': '72.87', 'x-vercel-ip-timezone': 'Asia/Kolkata', 'x-vercel-ip-postal-code': '400001' } }; };
(async () => {
  const admin = mk(B); await admin.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.201' });
  const sadmin = mk(S); await sadmin.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.202' });

  await R.run('SEC-01', 'Public responses (create, view as host / player / visitor, every action, notify) carry no IP, place, user-agent, token or token hash, and no other player\'s ticket or dabs', async () => {
    const host = person(1), p1 = person(2), p2 = person(3), visitor = person(4);
    const bodies = [];
    const call = async (who, method, path, body) => { const r = await fetch(B + path, { method, headers: who.h, ...(body ? { body: JSON.stringify(body) } : {}) }); const t = await r.text(); bodies.push({ who, path, body, t, headers: JSON.stringify([...r.headers]) }); return JSON.parse(t); };
    const g = await call(host, 'POST', '/api/games', { hostName: 'Host', name: 'Leak test', price: 10, prizes: ['early5', 'full'] });
    const code = g.code;
    await call(p1, 'POST', `/api/games/${code}/act`, { type: 'join', name: 'One' });
    await call(p2, 'POST', `/api/games/${code}/act`, { type: 'join', name: 'Two' });
    await call(host, 'POST', `/api/games/${code}/act`, { type: 'start' });
    for (let i = 0; i < 6; i++) await call(host, 'POST', `/api/games/${code}/act`, { type: 'draw', after: i });
    const vh = await call(host, 'GET', `/api/games/${code}`), v1 = await call(p1, 'GET', `/api/games/${code}`), v2 = await call(p2, 'GET', `/api/games/${code}`), vv = await call(visitor, 'GET', `/api/games/${code}`);
    await call(p1, 'POST', `/api/games/${code}/act`, { type: 'mark', n: v1.game.called[0] });
    await call(p1, 'POST', `/api/games/${code}/act`, { type: 'claim', prizeId: 'early5' });
    await call(visitor, 'POST', '/api/notify', { phone: '9812345678' });
    await call(visitor, 'POST', `/api/games/${code}/act`, { type: 'mark', n: 5 });
    eq([vh.game.you.role, v1.game.you.role, vv.game.you.role], ['host', 'player', 'visitor'], 'roles');
    assert(v1.game.you.ticket.flat().filter(Boolean).length === 15, 'own ticket present');
    const everyone = [host, p1, p2, visitor];
    for (const b of bodies) {
      const text = b.t + b.headers;
      for (const p of everyone) {
        assert(!text.includes(p.ip), `${b.path}: IP of someone`);
        assert(!text.includes(p.city), `${b.path}: city`);
        assert(!text.includes(p.token), `${b.path}: token`);
        assert(!text.includes(p.hash) && !text.includes(p.hash.slice(0, 16)), `${b.path}: token hash`);
      }
      assert(!/QA-LEAK-UA-MARKER|Leakville|400001|Asia\/Kolkata|19\.07|tokenHash|hostTokenHash|"ip"|"city"|"country"|"region"|"ua"|"history"/.test(text), `${b.path}: an admin-only field`);
      const j = JSON.parse(b.t);
      const keys = []; (function walk(o, path) { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { keys.push(path + '.' + k); walk(v, path + '.' + k); } })(j, '');
      const tk = keys.filter((k) => /\.(ticket|marks)$/.test(k.replace(/\.\d+$/, '')) || /ticket|marks/i.test(k.split('.').pop()));
      for (const k of tk) assert(/^\.game\.you\.(ticket|marks)/.test(k), `${b.path}: ${k}`);
    }
    // another player's ticket numbers are not hidden anywhere in my view under another name
    const t2 = JSON.stringify(v2.game.you.ticket);
    assert(!JSON.stringify(v1).includes(t2) && !JSON.stringify(vh).includes(t2.slice(1, -1)) && !JSON.stringify(vv).includes('ticket'), 'ticket of player 2 visible to others');
    // …while the admin DOES have the IP and place for this game (so the check above had something to find)
    await sleep(400);
    const adminView = (await admin.get('/api/admin/games/' + code)).text;
    assert(adminView.includes(host.ip) && adminView.includes('Leakville2'), 'control: admin sees ip + city');
    assert(!/"ticket"|"marks"|tokenHash/.test(adminView) && !adminView.includes(p1.hash) && !adminView.includes(t2), 'admin JSON has a ticket / marks / hash');
    return `${bodies.length} responses checked`;
  });

  const browser = await chromium.launch();
  const ctx = await adminContext(browser, S);
  const urls = ['/admin', '/admin/acquisition', '/admin/funnels', '/admin/geography', '/admin/technology', '/admin/engagement', '/admin/retention', '/admin/games?range=90d', '/admin/games?range=90d&q=%3Cscript%3E', '/admin/games/MXRND', '/admin/games/ABBYA', '/admin/games/DWAAA', '/admin/games/NWNWQ', '/admin/games/EXPRD',
    '/admin/players', '/admin/players?q=ffff', '/admin/players/ffff0006', '/admin/players/bbbb0002', '/admin/players/0000abcd', '/admin/events?range=7d', '/admin/events?range=7d&device=ffff0006', '/admin/notify', '/admin/privacy', '/admin/acquisition?range=90d', '/admin/geography?range=90d', '/admin/games?range=90d&page=5'];
  const htmls = {};
  await R.run('SEC-03', `Stored XSS: <script>, "><img onerror>, javascript: and formula strings in player / game names, city, source, UTM and referrer render inert on ${urls.length} admin pages (no script ran, no dialog, no console error, no raw markup in the HTML)`, async () => {
    let seen = 0;
    for (const u of urls) {
      const v = await visit(ctx, S + u);
      eq(v.status, 200, u);
      assert(v.xss === null, `${u}: injected script RAN`);
      assert(v.errors.length === 0, `${u}: ${v.errors.join(' | ')}`);
      const raw = (await sadmin.get(u)).text; htmls[u] = raw;
      assert(!raw.includes('<script>window.__xss') && !raw.includes('<img src=x onerror'), `${u}: raw markup in HTML`);
      assert(!/href="javascript:/i.test(raw), `${u}: javascript: href`);
      const injected = await v.page.evaluate(() => document.querySelectorAll('img[src="x"], script:not([src]):not([id])').length && [...document.querySelectorAll('img[src="x"]')].length);
      eq(injected || 0, 0, `${u}: injected element`);
      if (v.text.includes('<script>window.__xss=1</script>') || v.text.includes('onerror=window.__xss=1')) seen++;
      await v.page.close();
    }
    assert(seen >= 5, 'the payloads were shown (as text) on only ' + seen + ' pages — the test would not have caught anything');
    return `payload shown as plain text on ${seen} pages`;
  });
  await R.run('SEC-02', 'Admin pages, JSON and CSV exports never contain a ticket, dabs, a device token or a full token hash (only the 8-character id)', async () => {
    const texts = { ...htmls };
    for (const u of ['/api/admin/games?from=2026-01-01', '/api/admin/games/DWAAA', '/api/admin/games/NWNWQ', '/api/admin/games/MXRND', '/api/admin/games.csv', '/api/admin/players.csv', '/api/admin/events.csv?range=90d', '/api/admin/notify.csv']) texts[u] = (await sadmin.get(u)).text;
    const hashes = [...new Set([...[...data.games.values()].flatMap((g) => [g.hostTokenHash, ...g.players.map((p) => p.tokenHash)]), ...data.insights.devices.map((d) => d.tokenHash)])];
    let shortSeen = 0;
    for (const [u, t] of Object.entries(texts)) {
      assert(!/"ticket"|"marks"|\\"ticket\\"|\\"marks\\"|tokenHash/.test(t), `${u}: ticket / marks / tokenHash key`);
      assert(!t.includes('[[1,0,21,0,41,0,61,0,81]'), `${u}: a ticket grid`);
      for (const h of hashes) assert(!t.includes(h.slice(0, 14)), `${u}: more than 8 characters of a token hash (${h.slice(0, 8)})`);
      if (t.includes('aaaa0001')) shortSeen++;
      const long = t.match(/\b[0-9a-f]{64}\b/g);
      assert(!long, `${u}: a 64-hex string ${long && long[0]}`);
    }
    assert(shortSeen >= 5, 'control: short ids are shown');
    const live = (await sadmin.get('/api/admin/games/NWNWQ')).json();
    eq(Object.keys(live.game).sort(), ['code', 'createdAt', 'devices', 'doc', 'erased', 'hostDevice', 'updatedAt'], 'admin game row keys');
    return `${Object.keys(texts).length} responses, ${hashes.length} hashes`;
  });
  await R.run('SEC-04', 'CSV exports: every row has the header\'s column count; no cell starts with = + - @ tab or CR (formula injection) in the plays, players, events and notify exports; values with commas, quotes, emoji and Unicode survive a round trip', async () => {
    let risky = 0;
    for (const u of ['/api/admin/games.csv?from=2026-01-01', '/api/admin/players.csv', '/api/admin/events.csv?range=90d', '/api/admin/notify.csv', '/api/admin/events.csv?range=90d&device=ffff0006']) {
      const r = await sadmin.get(u);
      assert(/text\/csv/.test(r.headers.get('content-type')) && /attachment; filename="letsplaytambola-[a-z]+-\d{4}-\d\d-\d\d\.csv"/.test(r.headers.get('content-disposition')), u + ' headers');
      const rows = parseCsv(r.text);
      assert(rows.length > 1, u + ' is empty');
      for (const row of rows) { eq(row.length, rows[0].length, u + ' column count'); for (const c of row) { assert(!/^[=+\-@\t\r]/.test(c), `${u}: cell ${JSON.stringify(c.slice(0, 40))}`); if (/^'[=+\-@]/.test(c)) risky++; } }
    }
    assert(risky >= 6, 'control: only ' + risky + ' defused cells — the dataset should have more');
    const g = parseCsv((await sadmin.get('/api/admin/games.csv?from=2026-01-01')).text);
    const names = new Set(g.map((r) => r[2]));
    for (const n of ["'" + CSV_FORMULA, 'Office "Fun" Friday', 'Sunday, with love', 'Kitty Party 🎉', 'दिवाली तंबोला', "'@everyone play", "'+bonus round"]) assert(names.has(n), 'missing game name ' + n);
    const p = parseCsv((await sadmin.get('/api/admin/players.csv')).text);
    const f = p.find((r) => r[0] === 'ffff0006');
    assert(f.includes(XSS_SCRIPT) && f.includes("'=cmd|'/C calc'!A0"), 'XSS device row: ' + JSON.stringify(f));
    return `${risky} risky cells defused`;
  });
  await R.run('SEC-05', 'Chart "CSV" buttons (made in the browser) are defused the same way', async () => {
    const page = await ctx.newPage();
    await page.goto(S + '/admin/acquisition', { waitUntil: 'networkidle' });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download sources as CSV' }).click()]);
    const text = fs.readFileSync(await dl.path(), 'utf8');
    const rows = parseCsv(text);
    for (const row of rows) for (const c of row) assert(!/^[=+\-@\t\r]/.test(c), 'cell ' + c);
    assert(rows.some((r) => r[0].startsWith("'=cmd")), 'the formula source is in the file, defused');
    eq(dl.suggestedFilename(), 'sources.csv', 'file name');
    await page.close();
  });
  await browser.close();
})();
