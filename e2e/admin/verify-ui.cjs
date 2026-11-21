const { OUT } = require('./lib.cjs');
const fs = require('fs');
const { chromium, adminContext, visit, scrape } = require('./pw.cjs');
const { mk, parseCsv, Results, assert, eq, RESULTS } = require('./lib.cjs');
const { build } = require('./seed-data.cjs');
const R = new Results(RESULTS);
const S = 'http://localhost:8600', F = 'http://localhost:8605';
const meta = require(OUT + '/seed-meta-8600.json');
const { data } = build(meta.now);
const games = [...data.games.values()];
const IST = 5.5 * 3600e3, DAY = 864e5;
const day = (off) => new Date(meta.D0 + off * DAY + IST).toISOString().slice(0, 10);
(async () => {
  const api = mk(S); await api.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.220' });
  const browser = await chromium.launch();
  const ctx = await adminContext(browser, S);

  await R.run('RANGE-01', 'Custom ranges: one day; inverted from/to is swapped; a future range is pulled back to today; more than 90 days is capped at the oldest kept day; rubbish falls back to 7 days', async () => {
    const created = async (q) => { const v = await visit(ctx, `${S}/admin?${q}`); const r = { c: v.kpis['Games created'].value, t: v.text }; await v.page.close(); return r; };
    const n = (a, b) => String(games.filter((g) => g.createdAt >= meta.D0 + a * DAY && g.createdAt < meta.D0 + (b + 1) * DAY).length);
    eq((await created(`range=custom&from=${day(-3)}&to=${day(-3)}`)).c, n(-3, -3), 'one day');
    eq((await created(`range=custom&from=${day(-1)}&to=${day(-6)}`)).c, n(-6, -1), 'inverted');
    eq((await created(`range=custom&from=${day(5)}&to=${day(9)}`)).c, n(0, 0), 'future → today');
    eq((await created(`range=custom&from=2020-01-01&to=${day(0)}`)).c, Number(n(-89, 0)).toLocaleString('en-IN'), 'capped at 90 days');
    eq((await created('range=custom&from=2026-02-31&to=banana')).c, n(-6, 0), 'not real dates → 7 days');
    eq((await created('range=<script>&cmp=<x>')).c, n(-6, 0), 'rubbish range');
    eq((await created(`range=custom&from=${day(-2)}`)).c, n(-2, -2), 'only "from"');
  });
  await R.run('RANGE-02', 'The date range and compare switch follow the operator through every sidebar link, survive Back / Forward, and a deep link opens the same view', async () => {
    const page = await ctx.newPage();
    await page.goto(`${S}/admin?range=30d&cmp=1`, { waitUntil: 'networkidle' });
    const links = await page.$$eval('nav a[href^="/admin"]', (as) => as.map((a) => a.getAttribute('href')));
    assert(links.length >= 12, 'sidebar links: ' + links.length);
    for (const h of links) assert(/range=30d/.test(h) && /cmp=1/.test(h), 'link loses the range: ' + h);
    await page.click('nav a[href^="/admin/games"]'); await page.waitForURL(/\/admin\/games\?/); await page.getByRole('heading', { name: 'Plays', level: 1 }).waitFor(); await page.waitForLoadState('networkidle');
    assert(/Last 30 days/i.test(await page.innerText('main')), 'plays shows 30 days');
    await page.click('#plays-table a[href*="/admin/games/"]'); await page.waitForURL(/\/admin\/games\/[A-Z0-9]{5}/); await page.waitForLoadState('networkidle');
    await page.goBack(); await page.waitForURL(/\/admin\/games\?/); await page.waitForTimeout(400);
    assert(/range=30d/.test(page.url()), 'back keeps the range: ' + page.url());
    await page.goBack(); await page.waitForURL(/\/admin\?range/); await page.waitForTimeout(400);
    assert(/\/admin\?range=30d&cmp=1/.test(page.url()), 'back to the overview: ' + page.url());
    await page.goForward(); await page.waitForURL(/\/admin\/games\?/); assert(/\/admin\/games\?/.test(page.url()), 'forward');
    await page.close();
  });
  await R.run('PLAYS-01', 'Plays search: code, part of a name, any letter case, Unicode, emoji, quotes, %, _, <script>, SQL text — each returns exactly the rows a plain substring match gives, and the page never errors', async () => {
    for (const q of ['dwaaa', 'DIWALI', 'night', '🎉', 'दिवाली', '"Fun"', "Year's", 'Sunday, with', '%', '_', '<script>', "' OR 1=1 --", 'राजेश', 'Ünï', '=HYPER', '@every', '   ', 'WWWWWWWWWWWWWWWWWWWWWWWW', 'zzzznomatch']) {
      const want = q.trim() ? games.filter((g) => [g.doc.code, g.doc.name, g.doc.hostName].some((s) => s.toLowerCase().includes(q.trim().toLowerCase()))).length : games.length;
      const r = await api.get(`/api/admin/games?from=${day(-89)}&q=${encodeURIComponent(q)}`);
      eq([r.status, r.json().total], [200, want], 'search ' + q);
      const p = await api.get(`/admin/games?range=90d&q=${encodeURIComponent(q)}`);
      eq(p.status, 200, 'page ' + q);
    }
  });
  await R.run('PLAYS-02', 'Plays sort (created / players / activity × both directions) is truly ordered over ALL pages; pages do not overlap or skip; page past the end, page 0, -1 and "abc" behave', async () => {
    for (const sort of ['created', 'players', 'activity']) for (const dir of ['asc', 'desc']) {
      const csv = parseCsv((await api.get(`/api/admin/games.csv?from=${day(-89)}&sort=${sort}&dir=${dir}`)).text);
      eq(csv.length - 1, games.length, 'rows');
      const all = [];
      for (let p = 1; p <= 14; p++) all.push(...(await api.get(`/api/admin/games?from=${day(-89)}&sort=${sort}&dir=${dir}&page=${p}`)).json().games);
      eq(all.length, games.length, 'paged rows'); eq(new Set(all.map((g) => g.code)).size, games.length, 'no row twice');
      eq(all.map((g) => g.code), csv.slice(1).map((r) => r[1]), 'page order = CSV order');
      const key = (g) => (sort === 'players' ? g.players : sort === 'activity' ? g.updatedAt : g.createdAt);
      for (let i = 1; i < all.length; i++) assert(dir === 'asc' ? key(all[i - 1]) <= key(all[i]) : key(all[i - 1]) >= key(all[i]), `${sort} ${dir} out of order at ${i}`);
    }
    eq((await api.get(`/api/admin/games?from=${day(-89)}&page=14`)).json().games.length, games.length - 13 * 25, 'last page');
    eq((await api.get(`/api/admin/games?from=${day(-89)}&page=15`)).json().games.length, 0, 'past the end');
    for (const p of ['0', '-1', 'abc', '1e9', '99999999999999999999']) eq((await api.get(`/api/admin/games?from=${day(-89)}&page=${p}`)).status, 200, 'page=' + p);
    const v = await visit(ctx, `${S}/admin/games?range=90d&page=999`);
    assert(v.status === 200 && /No plays|No games|of 328/.test(v.text), 'page 999 renders'); await v.page.close();
  });
  await R.run('PLAYS-03', 'Plays column picker hides / shows columns and remembers the choice after a reload; quick filters and the status filter give the right totals on the page', async () => {
    const page = await ctx.newPage();
    await page.goto(`${S}/admin/games?range=90d`, { waitUntil: 'networkidle' });
    const vis = () => page.$$eval('#plays-table thead th', (ths) => ths.filter((t) => getComputedStyle(t).display !== 'none').map((t) => t.textContent.trim().replace(/[▲▼↕]/g, '')));
    const before = await vis();
    await page.locator('summary', { hasText: 'Columns' }).click();
    await page.getByLabel('Host location').uncheck(); await page.getByLabel('Numbers called').check();
    const after = await vis();
    assert(!after.includes('Host location') && after.includes('Called') && before.includes('Host location') && !before.includes('Called'), JSON.stringify([before, after]));
    await page.reload({ waitUntil: 'networkidle' });
    eq(await vis(), after, 'remembered after reload');
    await page.goto(`${S}/admin/games?range=90d&quick=priced`, { waitUntil: 'networkidle' });
    const priced = games.filter((g) => g.doc.price > 0).length;
    assert((await page.innerText('main')).includes(`${priced} plays`), 'priced total on the page');
    await page.close();
  });
  await R.run('DETAIL-01', 'Play detail for a lobby, a live, a finished, an expired and a two-round game shows the right status, facts, people (with IP / place / device) and earlier rounds; unknown and malformed codes give a clear "not found"', async () => {
    const want = { ABBYA: ['Lobby', 'George (no ticket)'], NWNWQ: ['Live', 'Ravi'], DWAAA: ['Finished', 'Priya'], EXPRD: ['Expired', 'Sunita'], MXRND: ['Finished', 'Priya'] };
    for (const [code, [status, host]] of Object.entries(want)) {
      const v = await visit(ctx, `${S}/admin/games/${code}`);
      eq(v.status, 200, code); assert(v.errors.length === 0, code + ' ' + v.errors.join('|'));
      eq([v.facts['Status'], v.facts['Host']], [status, host], code + ' facts');
      await v.page.close();
    }
    const m = await visit(ctx, `${S}/admin/games/MXRND`);
    assert(m.text.includes('Earlier rounds') && m.text.includes('Full House: Priya (₹500)') && m.text.includes('₹1,200'), 'earlier round + recorded money'); await m.page.close();
    const d = await visit(ctx, `${S}/admin/games/DWAAA`);
    for (const s of ['49.36.10.11', '2405:201:4001:a0::7', 'São Paulo', 'Samsung Internet', 'WhatsApp']) assert(d.text.includes(s), 'people table lacks ' + s);
    assert(d.text.includes('30m 00s'), 'game length'); await d.page.close();
    for (const bad of ['ZZZZZ', 'abc', 'DWAAA1', '%3Cscript%3E', '..%2F..%2Fetc']) { const r = await api.get('/admin/games/' + bad); assert(r.status === 404 || /can.t find|No such|not found|No game/i.test(r.text), bad + ' → ' + r.status); assert(r.status !== 500, bad); }
    eq((await api.get('/api/admin/games/dwaaa')).json().game.code, 'DWAAA', 'case-insensitive API');
    eq((await api.get('/api/admin/games/ZZZZZ')).status, 404, 'unknown code API');
  });
  await R.run('DETAIL-02', 'Player detail: a device with two names lists both; a host who never played shows hosted 1 / joined 0; every IP seen is listed; unknown, short and malformed ids give a clear "not found"', async () => {
    const b = await visit(ctx, `${S}/admin/players/bbbb0002`);
    assert(b.text.includes('Meera K') && /Names used/.test(b.text) && b.text.includes('2405:201:4001:a0::7'), 'two names + IP'); await b.page.close();
    const a = await visit(ctx, `${S}/admin/players/aaaa0001`);
    assert(a.text.includes('49.36.10.11') && a.text.includes('49.36.10.99'), 'both IPs'); await a.page.close();
    const g = await visit(ctx, `${S}/admin/players/0000abcd`);
    assert(/George/.test(g.text) && /London/.test(g.text), 'host-only device'); await g.page.close();
    for (const bad of ['deadbeef', 'abc', 'AAAA0001', 'aaaa00011', '%27%20or%201=1']) { const r = await api.get('/admin/players/' + bad); assert(r.status !== 500, bad + ' 500'); if (bad !== 'AAAA0001') assert(/can.t find|No such|not found|No device|Nothing/i.test(r.text.replace(/<[^>]+>/g, ' ')), bad + ' message'); }
  });
  await R.run('EVENTS-01', 'Events explorer: 50 per page, pages do not overlap, last page is partial, filters combine, invalid filters are ignored (not an error)', async () => {
    const total = data.insights.events.filter((e) => e.at >= meta.D0 - 6 * DAY).length;
    const p1 = await visit(ctx, `${S}/admin/events?range=7d`), p3 = await visit(ctx, `${S}/admin/events?range=7d&page=3`);
    eq([p1.tables[0].rows.length, p3.tables[0].rows.length], [50, total - 100], 'rows per page'); await p1.page.close(); await p3.page.close();
    const f = await visit(ctx, `${S}/admin/events?range=7d&name=claim_valid&code=MXRND`);
    eq(f.tables[0].rows.length, 4, 'name + game'); await f.page.close();
    for (const q of ['name=nope', 'device=xyz', 'code=<b>', 'session=%00', 'page=-4']) eq((await api.get('/admin/events?' + q)).status, 200, q);
  });
  await R.run('UX-01', 'When an aggregate query throws, every admin page still answers with a helpful message inside the admin frame (not a blank or crash page), and the API answers a JSON 500', async () => {
    const fctx = await adminContext(browser, F);
    const bad = [];
    for (const p of ['', '/acquisition', '/funnels', '/geography', '/technology', '/engagement', '/retention', '/games', '/games/DWAAA', '/players', '/players/aaaa0001', '/events', '/notify', '/privacy']) {
      const v = await visit(fctx, F + '/admin' + p);
      const ok = /couldn.t be loaded|Something went wrong while reading/i.test(v.text) || (v.kpis && Object.keys(v.kpis).length > 0) || v.tables.length > 0;
      const frame = await v.page.locator('nav a[href^="/admin"]').count();
      if (!ok || !frame || /Application error|Internal Server Error/i.test(v.text) || v.text.length < 40) bad.push(`${p || '/'} status ${v.status} frame ${frame} text "${v.text.slice(0, 120)}"`);
      await v.page.close();
    }
    await fctx.close();
    const fa = mk(F); await fa.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.221' });
    const r = await fa.get('/api/admin/events.csv');
    eq([r.status, r.json() && r.json().ok], [500, false], 'API');
    assert(!/QA injected|at Object|\.js:\d+/.test(r.text), 'stack trace in the API answer');
    assert(bad.length === 0, bad.join(' ;; '));
  });
  await R.run('UX-02', 'Keyboard only: Tab reaches the sidebar, range buttons, Refresh, Sign out and the page\'s controls in a sensible order; every focused control shows a visible focus ring; chart Table switch works with Enter', async () => {
    const page = await ctx.newPage();
    await page.goto(`${S}/admin`, { waitUntil: 'networkidle' });
    const seen = []; let noRing = 0;
    for (let i = 0; i < 45; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const s = getComputedStyle(e); return { t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30), ring: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 || s.boxShadow !== 'none' }; });
      if (f) { seen.push(f.t); if (!f.ring) noRing++; }
    }
    for (const want of ['Overview', 'Plays', 'Today', '90 days', 'Refresh', 'Sign out']) assert(seen.some((s) => s.includes(want)), 'Tab never reached ' + want + ': ' + seen.join(','));
    eq(noRing, 0, 'focused controls without a visible ring');
    const table = page.getByRole('button', { name: 'Table' }).first(); await table.focus(); await page.keyboard.press('Enter');
    eq(await table.getAttribute('aria-pressed'), 'true', 'Table switch by keyboard');
    assert(await page.locator('section:has(h2:text("Visitors per day")) table').first().isVisible(), 'table visible');
    await page.close();
  });
  await R.run('UX-03', 'Charts are accessible: each chart has a text alternative or table twin with the same numbers, the Chart/Table switch exposes aria-pressed, tables have column headers; one <h1> per page; the page has a <main> and labelled navigation', async () => {
    for (const p of ['', '/acquisition', '/funnels', '/geography', '/technology', '/engagement', '/retention', '/games', '/players', '/events', '/notify', '/privacy']) {
      const page = await ctx.newPage(); await page.goto(`${S}/admin${p}`, { waitUntil: 'networkidle' });
      const a = await page.evaluate(() => ({ h1: document.querySelectorAll('h1').length, main: document.querySelectorAll('main').length, navs: [...document.querySelectorAll('nav')].filter((n) => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length,
        svgBad: [...document.querySelectorAll('main svg')].filter((s) => s.getAttribute('aria-hidden') !== 'true' && !s.getAttribute('aria-label') && !s.querySelector('title') && s.getAttribute('role') !== 'img' && !s.closest('[aria-hidden="true"]') && !s.closest('button,a')).length,
        thBad: [...document.querySelectorAll('main table')].filter((t) => !t.querySelector('th')).length, unlabeled: [...document.querySelectorAll('main input:not([type=hidden]), main select')].filter((e) => !e.labels?.length && !e.getAttribute('aria-label')).length,
        btnBad: [...document.querySelectorAll('button, a')].filter((e) => !(e.textContent || '').trim() && !e.getAttribute('aria-label') && !e.getAttribute('title')).length, lang: document.documentElement.lang }));
      eq(a, { h1: 1, main: 1, navs: 0, svgBad: 0, thBad: 0, unlabeled: 0, btnBad: 0, lang: a.lang }, p || '/'); assert(a.lang, 'html lang');
      await page.close();
    }
  });
  await R.run('UX-04', 'Print: the page renders to PDF without the sidebar / top bar / buttons, and every chart\'s numbers are printed as a table', async () => {
    const page = await ctx.newPage(); await page.goto(`${S}/admin?range=30d`, { waitUntil: 'networkidle' });
    await page.emulateMedia({ media: 'print' });
    const s = await page.evaluate(() => ({ nav: [...document.querySelectorAll('nav, [data-noprint]')].filter((e) => e.getClientRects().length && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden').length, tables: [...document.querySelectorAll('section[aria-labelledby] table')].filter((t) => t.getClientRects().length).length, bg: getComputedStyle(document.body).backgroundColor }));
    eq(s.nav, 0, 'navigation / tools visible in print'); assert(s.tables >= 5, 'printed tables: ' + s.tables);
    await page.screenshot({ path: OUT + '/print-overview.png', fullPage: false });
    await page.pdf({ path: OUT + '/print-overview.pdf', format: 'A4' });
    assert(fs.statSync(OUT + '/print-overview.pdf').size > 20000, 'pdf size');
    await page.close();
    return JSON.stringify(s);
  });
  await R.run('UX-05', 'Admin pages send no analytics: visiting all of them makes no request to /api/t, and they load nothing from another site', async () => {
    const page = await ctx.newPage(); const reqs = []; page.on('request', (r) => reqs.push(r.url()));
    for (const p of ['', '/games', '/games/DWAAA', '/players', '/players/aaaa0001', '/events', '/privacy', '/login']) { await page.goto(`${S}/admin${p}`, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); }
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); }); await page.waitForTimeout(500);
    assert(!reqs.some((u) => u.includes('/api/t')), 'a request to /api/t was made');
    const foreign = reqs.filter((u) => !u.startsWith(S) && !u.startsWith('data:') && !u.startsWith('blob:'));
    eq(foreign, [], 'requests to other sites');
    const before = (await api.get('/api/admin/events.csv?range=today')).text.length; void before;
    await page.close();
  });
  await R.run('UX-06', 'Signed-in visit to /admin/login lands on /admin; sign-out button returns to the sign-in page and Back does not show admin data again', async () => {
    const c2 = await adminContext(browser, S); const page = await c2.newPage();
    await page.goto(`${S}/admin/login`, { waitUntil: 'networkidle' }); await page.waitForURL(/\/admin$/);
    await page.goto(`${S}/admin/players`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Sign out' }).click(); await page.waitForURL(/\/admin\/login/);
    await page.goBack(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
    assert(/\/admin\/login/.test(page.url()) || !(await page.innerText('body')).includes('aaaa0001'), 'Back shows admin data after sign-out: ' + page.url());
    await c2.close();
  });
  // ---- performance
  await R.run('PERF-01', `Server time of every admin page with ${games.length} games / ${data.insights.events.length} events (memory mode): none over 1.5 s`, async () => {
    const out = {};
    for (const p of ['', '?range=90d&cmp=1', '/acquisition?range=90d', '/funnels?range=90d', '/geography?range=90d', '/technology?range=90d', '/engagement?range=90d', '/retention', '/games?range=90d', '/games/DWAAA', '/players', '/players/aaaa0001', '/events?range=90d', '/notify', '/privacy']) {
      await api.post('/api/admin/refresh', {});
      const cold = (await api.get('/admin' + p)).ms; const t = []; for (let i = 0; i < 3; i++) t.push((await api.get('/admin' + p)).ms);
      out[p || '/'] = [Math.round(cold), Math.round(Math.min(...t))];
    }
    for (const u of ['/api/admin/games.csv?from=2026-01-01', '/api/admin/players.csv', '/api/admin/events.csv?range=90d']) out[u] = [Math.round((await api.get(u)).ms)];
    fs.writeFileSync(OUT + '/perf.json', JSON.stringify(out, null, 1));
    const slow = Object.entries(out).filter(([, v]) => v[0] > 1500);
    assert(slow.length === 0, 'slow: ' + JSON.stringify(slow));
    return JSON.stringify(out);
  });
  await browser.close();
})();
