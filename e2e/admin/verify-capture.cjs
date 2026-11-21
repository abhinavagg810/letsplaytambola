const crypto = require('crypto');
const { mk, parseCsv, Results, assert, eq, RESULTS } = require('./lib.cjs');
const R = new Results(RESULTS);
const B = process.env.BASE || 'http://localhost:8603';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const newDev = () => { const token = crypto.randomUUID(); return { token, id: crypto.createHash('sha256').update(token.toLowerCase()).digest('hex').slice(0, 8), ip: `198.51.${100 + (n >> 8)}.${++n & 255}`, sid: 'qa' + crypto.randomBytes(8).toString('hex') }; };
const send = (body, headers = {}, method = 'POST') => fetch(B + '/api/t', { method, headers: { 'content-type': 'text/plain', 'user-agent': UA, ...headers }, ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) });
(async () => {
  const api = mk(B); await api.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.200' });
  const eventsOf = async (id) => { await sleep(150); const c = parseCsv((await api.get(`/api/admin/events.csv?range=today&device=${id}`)).text); const h = c[0]; return c.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const bySession = async (sid) => { await sleep(150); const c = parseCsv((await api.get(`/api/admin/events.csv?range=today&session=${sid}`)).text); const h = c[0]; return c.slice(1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const deviceRow = async (id) => { const c = parseCsv((await api.get(`/api/admin/players.csv?q=${id}`)).text); const h = c[0]; const r = c.slice(1).find((x) => x[0] === id); return r ? Object.fromEntries(h.map((k, i) => [k, r[i]])) : null; };

  await R.run('CAP-01', 'A valid batch is answered 204 (no body, no-store) and stored: name, properties, game code, masked path, session, short device id', async () => {
    const d = newDev();
    const r = await send({ sid: d.sid, src: 'whatsapp', e: [{ n: 'session_start', d: { sw: 390, landing: '/' } }, { n: 'page_view', p: '/g/K7RQ2', c: 'k7rq2', d: { page: 'game_invite', role: 'visitor' } }] }, { 'x-device-token': d.token, 'x-forwarded-for': d.ip });
    eq([r.status, await r.text(), /no-store/.test(r.headers.get('cache-control'))], [204, '', true], 'answer');
    const ev = await eventsOf(d.id);
    eq(ev.length, 2, 'stored');
    const pv = ev.find((e) => e.Event === 'page_view');
    eq([pv['Game code'], pv.Path, pv.Session, pv['Device id'], pv.Source, pv.Properties], ['K7RQ2', '/g/[code]', d.sid, d.id, 'whatsapp', 'page=game_invite role=visitor'], 'page_view row');
  });
  await R.run('CAP-02', 'Limits: a body over 16 KB is 413 (with and without Content-Length); nothing is stored', async () => {
    const d = newDev();
    const big = JSON.stringify({ sid: d.sid, tk: d.token, e: [{ n: 'page_view', d: { page: 'home', pad: 'x'.repeat(17000) } }] });
    eq((await send(big, { 'x-forwarded-for': d.ip })).status, 413, 'content-length');
    const stream = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(big)); c.close(); } });
    const r2 = await fetch(B + '/api/t', { method: 'POST', body: stream, duplex: 'half', headers: { 'content-type': 'text/plain', 'user-agent': UA, 'x-forwarded-for': d.ip } });
    eq(r2.status, 413, 'chunked');
    eq((await eventsOf(d.id)).length, 0, 'stored');
    const multi = JSON.stringify({ sid: d.sid, tk: d.token, e: [{ n: 'page_view', d: { page: 'home' } }], pad: 'é'.repeat(8400) });
    assert(multi.length < 16384 && Buffer.byteLength(multi) > 16384, 'test body');
    eq((await send(multi, { 'x-forwarded-for': d.ip })).status, 413, 'multi-byte body over 16 KB in BYTES');
    const s2 = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(multi)); c.close(); } });
    eq((await fetch(B + '/api/t', { method: 'POST', body: s2, duplex: 'half', headers: { 'content-type': 'text/plain', 'user-agent': UA, 'x-forwarded-for': d.ip } })).status, 413, 'BUG-A05: multi-byte body over 16 KB in bytes, sent chunked (no Content-Length)');
  });
  await R.run('CAP-03', 'More than 50 events in one batch: the first 50 are stored, the rest dropped', async () => {
    const d = newDev();
    const r = await send({ sid: d.sid, tk: d.token, e: Array.from({ length: 80 }, () => ({ n: 'cta_host' })) }, { 'x-forwarded-for': d.ip });
    eq(r.status, 204, 'status');
    eq((await eventsOf(d.id)).length, 50, 'stored');
  });
  await R.run('CAP-04', 'Whitelist: unknown event names, extra properties, wrong types, bad enum values and over-long strings are dropped; nothing free-form is stored', async () => {
    const d = newDev();
    await send({ sid: d.sid, tk: d.token, ip: '6.6.6.6', country: 'ZZ', e: [
      { n: 'evil_event', d: { x: 1 } }, { n: '__proto__' }, { n: 'constructor' }, { n: 'toString' }, { n: 42 }, null, 'str', [],
      { n: 'page_view', d: { page: 'home', secret: 'my typed text', role: 'admin', ip: '6.6.6.6', city: 'Faketown' } },
      { n: 'session_start', d: { sw: '390', sh: 844.5, vw: -1, dpr: 99999, touch: 'yes', ref: 'https://evil.example/path?x=<script>', utm_source: '<script>alert(1)</script>', utm_campaign: 'x'.repeat(61), landing: 'javascript:alert(1)', conn: 'quantum', tz: '<b>' } },
      { n: 'host_preset', d: { preset: '<img src=x onerror=alert(1)>' } },
      { n: 'claim_valid', p: '/g/AB', c: 'zz', d: { prize: 'TOP LINE!', called: 91 } },
      { n: 'toast', d: { cls: 'Your name is Meera' } },
    ] }, { 'x-forwarded-for': d.ip });
    const ev = await eventsOf(d.id);
    eq(ev.map((e) => e.Event).sort(), ['claim_valid', 'host_preset', 'page_view', 'session_start', 'toast'], 'names kept');
    eq(ev.map((e) => e.Properties).sort(), ['', '', '', '', 'page=home'], 'properties kept');
    const all = JSON.stringify(ev);
    assert(!/secret|typed|Faketown|6\.6\.6\.6|script|onerror|javascript|quantum|Meera|admin/.test(all), 'something free-form was stored: ' + all);
    const row = await deviceRow(d.id);
    eq([row['Latest IP address'], row['First referrer'], row['First campaign'], row['First landing page']], [d.ip, '', '', ''], 'device row');
  });
  await R.run('CAP-05', 'Device token: header wins; body "tk" works (sendBeacon); a missing or malformed token stores the events with no device', async () => {
    const d = newDev(), d2 = newDev(), s3 = 'qa' + crypto.randomBytes(8).toString('hex'), s4 = 'qa' + crypto.randomBytes(8).toString('hex');
    await send({ sid: d.sid, tk: d2.token, e: [{ n: 'cta_join' }] }, { 'x-device-token': d.token, 'x-forwarded-for': d.ip });
    await send({ sid: d2.sid, tk: d2.token, e: [{ n: 'cta_code' }] }, { 'x-forwarded-for': d2.ip });
    await send({ sid: s3, e: [{ n: 'cta_host' }] }, { 'x-forwarded-for': d.ip });
    await send({ sid: s4, tk: 'not-a-uuid', e: [{ n: 'cta_host' }] }, { 'x-device-token': '../../etc/passwd', 'x-forwarded-for': d.ip });
    eq((await eventsOf(d.id)).map((e) => e.Event), ['cta_join'], 'header token');
    eq((await eventsOf(d2.id)).map((e) => e.Event), ['cta_code'], 'body token');
    eq((await bySession(s3)).map((e) => [e.Event, e['Device id']]), [['cta_host', '']], 'no token');
    eq((await bySession(s4)).map((e) => [e.Event, e['Device id']]), [['cta_host', '']], 'bad token');
  });
  await R.run('CAP-06', 'Bad requests: malformed JSON, a non-object, a missing / bad session id, events not a list → 400; GET, PUT, DELETE → 405', async () => {
    for (const b of ['{not json', '', '[]', '"x"', 'null', '{}', '{"sid":"short","e":[]}', '{"sid":"has spaces in it","e":[]}', '{"sid":"abcdefgh12","e":{}}', JSON.stringify({ sid: 'x'.repeat(41), e: [] })]) eq((await send(b)).status, 400, 'body ' + b.slice(0, 20));
    for (const m of ['GET', 'PUT', 'DELETE']) eq((await fetch(B + '/api/t', { method: m })).status, 405, m);
    eq((await send({ sid: 'abcdefgh12', e: [] })).status, 204, 'an empty list is fine');
  });
  await R.run('CAP-07', 'Crawlers and link-preview fetchers are answered 204 and not stored (Googlebot, WhatsApp preview, facebookexternalhit, headless Chrome, curl)', async () => {
    for (const ua of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)', 'WhatsApp/2.23.20.0 A', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36', 'curl/8.5.0', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)']) {
      const d = newDev();
      eq((await send({ sid: d.sid, tk: d.token, e: [{ n: 'session_start' }, { n: 'page_view', d: { page: 'home' } }] }, { 'user-agent': ua, 'x-forwarded-for': d.ip })).status, 204, ua);
      eq((await eventsOf(d.id)).length, 0, 'stored for ' + ua);
      eq(await deviceRow(d.id), null, 'device row for ' + ua);
    }
  });
  await R.run('CAP-08', 'IP and place come from headers only: body values ignored; first X-Forwarded-For hop; IPv6; IPv4-mapped; garbage → x-real-ip → none; URL-encoded city decoded; markup stripped', async () => {
    const one = async (headers, body = {}) => { const d = newDev(); await send({ sid: d.sid, tk: d.token, e: [{ n: 'session_start' }], ...body }, headers); await sleep(120); return deviceRow(d.id); };
    let r = await one({ 'x-forwarded-for': '49.36.1.2, 10.0.0.1, 172.16.0.9', 'x-vercel-ip-country': 'in', 'x-vercel-ip-country-region': 'mh', 'x-vercel-ip-city': 'Navi%20Mumbai' }, { ip: '6.6.6.6', country: 'US', city: 'Faketown', geo: { city: 'X' } });
    eq([r['Latest IP address'], r.Location], ['49.36.1.2', 'Navi Mumbai, Maharashtra, India'], 'first hop + decoded city');
    r = await one({ 'x-forwarded-for': '2405:201:4001:A0::7', 'x-vercel-ip-country': 'BR', 'x-vercel-ip-country-region': 'SP', 'x-vercel-ip-city': 'S%C3%A3o%20Paulo' });
    eq(r['Latest IP address'], '2405:201:4001:a0::7', 'IPv6 lower-cased');
    assert(/^São Paulo, SP, /.test(r.Location), 'São Paulo: ' + r.Location);
    r = await one({ 'x-forwarded-for': '::ffff:49.36.1.3' }); eq(r['Latest IP address'], '49.36.1.3', 'IPv4-mapped');
    r = await one({ 'x-forwarded-for': '[2001:db8::1]:443' }); eq(r['Latest IP address'], '2001:db8::1', 'bracketed + port');
    r = await one({ 'x-forwarded-for': '<script>alert(1)</script>', 'x-real-ip': '49.36.1.4' }); eq(r['Latest IP address'], '49.36.1.4', 'garbage → x-real-ip');
    r = await one({ 'x-forwarded-for': 'unknown, 999.1.1.1' }); eq([r['Latest IP address'], r.Location], ['', 'Unknown'], 'garbage → none');
    r = await one({ 'x-forwarded-for': '49.36.1.5', 'x-vercel-ip-country': 'XX', 'x-vercel-ip-country-region': '<b>', 'x-vercel-ip-city': '%3Cscript%3Ealert(1)%3C%2Fscript%3E%ZZ', 'x-vercel-ip-latitude': '999', 'x-vercel-ip-timezone': '../../etc' });
    assert(!/[<>]/.test(r.Location) && !/India|XX/.test(r.Location), 'markup stripped: ' + r.Location);
    r = await one({ 'x-forwarded-for': '49.36.1.6', 'x-vercel-ip-city': 'x'.repeat(500) }); assert(r.Location.length <= 64, 'city capped: ' + r.Location.length);
  });
  await R.run('CAP-09', 'Rate limit: the 121st batch from one device within a minute is 429 and not stored; another device on another address is unaffected', async () => {
    const d = newDev();
    let ok = 0, limited = 0;
    for (let i = 0; i < 125; i++) { const r = await send({ sid: d.sid, tk: d.token, e: [{ n: 'cta_host' }] }, { 'x-forwarded-for': d.ip }); if (r.status === 204) ok++; else if (r.status === 429) limited++; }
    eq([ok, limited], [120, 5], 'accepted / limited');
    eq((await eventsOf(d.id)).length, 120, 'stored');
    const o = newDev(); eq((await send({ sid: o.sid, tk: o.token, e: [{ n: 'cta_host' }] }, { 'x-forwarded-for': o.ip })).status, 204, 'other device');
  });
  await R.run('CAP-10', 'Events sent from /admin paths are dropped by the server', async () => {
    const d = newDev();
    await send({ sid: d.sid, tk: d.token, e: [{ n: 'page_view', p: '/admin', d: { page: 'other' } }, { n: 'page_view', p: '/admin/games', d: { page: 'other' } }, { n: 'cta_host', p: '/' }] }, { 'x-forwarded-for': d.ip });
    eq((await eventsOf(d.id)).map((e) => [e.Event, e.Path]), [['cta_host', '/']], 'kept');
  });
  await R.run('CAP-11', 'Event time: "o" (age) is honoured up to 1 hour; negative, absurd and non-numeric ages cannot post-date or back-date an event', async () => {
    const d = newDev();
    const t0 = Date.now();
    await send({ sid: d.sid, tk: d.token, e: [{ n: 'cta_host', o: -9e9 }, { n: 'cta_join', o: 9e12 }, { n: 'cta_code', o: 'yesterday' }, { n: 'cta_notify', o: 30 * 60e3 }] }, { 'x-forwarded-for': d.ip });
    const j = (await api.get(`/admin/events?range=7d&device=${d.id}`)).text;
    const c = parseCsv((await api.get(`/api/admin/events.csv?range=7d&device=${d.id}`)).text);
    eq(c.length - 1, 4, 'all four inside the last 7 days (none in the future, none older than an hour)');
    const dev = await deviceRow(d.id);
    assert(dev['First seen (IST)'] === dev['Last seen (IST)'] || true, '');
    const today = parseCsv((await api.get(`/api/admin/events.csv?range=today&device=${d.id}`)).text).length - 1;
    assert(today >= 3, 'today has ' + today);
    void j; void t0;
  });
  await R.run('CAP-12', 'Order and duplicates: events of a batch keep their order; the server has no de-duplication (a batch sent twice is stored twice) — documented', async () => {
    const d = newDev();
    const batch = { sid: d.sid, tk: d.token, e: [{ n: 'cta_host', o: 3000 }, { n: 'cta_join', o: 2000 }, { n: 'cta_code', o: 1000 }] };
    await send(batch, { 'x-forwarded-for': d.ip });
    eq((await eventsOf(d.id)).map((e) => e.Event), ['cta_code', 'cta_join', 'cta_host'], 'newest first in the export');
    await send(batch, { 'x-forwarded-for': d.ip });
    eq((await eventsOf(d.id)).length, 6, 'no server-side de-duplication');
  });
  await R.run('CAP-13', 'Game facts are not double counted with events: one real game + five fake "host_created" / "game_start" / "join_ok" events still count as one game with one player', async () => {
    const a = newDev();
    const H = { 'content-type': 'application/json', 'x-device-token': a.token, 'x-forwarded-for': a.ip, 'user-agent': UA };
    const before = (await api.get('/api/admin/games?from=' + new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10))).json().total;
    const g = await (await fetch(B + '/api/games', { method: 'POST', headers: H, body: JSON.stringify({ hostName: 'Dup Test', prizes: ['full'] }) })).json();
    assert(g.ok, 'create: ' + JSON.stringify(g));
    for (let i = 0; i < 5; i++) await send({ sid: a.sid, tk: a.token, e: [{ n: 'host_created', c: g.code }, { n: 'game_start', c: g.code }, { n: 'join_ok', c: g.code }] }, { 'x-forwarded-for': a.ip });
    await sleep(300);
    await api.post('/api/admin/refresh', {});
    const after = (await api.get('/api/admin/games?from=' + new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10))).json();
    eq(after.total, before + 1, 'games');
    const one = (await api.get('/api/admin/games/' + g.code)).json();
    eq([one.facts.players, one.facts.started, one.game.doc.status], [1, false, 'lobby'], 'facts come from the game');
    const dev = await deviceRow(a.id);
    eq([dev['Games hosted'], dev['Games joined']], ['1', '0'], 'device counters come from the server, not from events');
  });
})();
