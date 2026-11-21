const { OUT } = require('./lib.cjs');
const { mk, parseCsv, Results, assert, eq, RESULTS } = require('./lib.cjs');
const { build } = require('./seed-data.cjs');
const R = new Results(RESULTS);
const S = 'http://localhost:8604';
const meta = require(OUT + '/seed-meta-8604.json');
const { data } = build(meta.now);
const ins = data.insights;
(async () => {
  const a = mk(S); await a.login('admin@example.com', 'test-password-123', { 'x-forwarded-for': '203.0.113.210' });
  const counts = async () => { const t = (await a.get('/admin/privacy')).text.replace(/<[^>]+>/g, ' '); return t; };
  const devIds = async () => parseCsv((await a.get('/api/admin/players.csv')).text).slice(1).map((r) => r[0]);
  await R.run('ERASE-01', 'Erase cannot be triggered cross-site or without a session: foreign Origin 403, form post 415, no cookie 401 — and the device is still there afterwards', async () => {
    eq((await a.post('/api/admin/erase', { device: 'bbbb0002' }, { headers: { origin: 'https://evil.example' } })).status, 403, 'foreign origin');
    eq((await fetch(S + '/api/admin/erase', { method: 'POST', headers: { cookie: a.cookie, origin: S, 'content-type': 'application/x-www-form-urlencoded' }, body: 'device=bbbb0002' })).status, 415, 'form');
    eq((await a.post('/api/admin/erase', { device: 'bbbb0002' }, { noCookie: true })).status, 401, 'no cookie');
    eq((await fetch(S + '/api/admin/erase?device=bbbb0002', { headers: { cookie: a.cookie } })).status, 405, 'GET');
    assert((await devIds()).includes('bbbb0002'), 'device still there');
  });
  await R.run('ERASE-02', 'Bad ids are refused with 400 and nothing changes: empty, 7 and 9 characters, non-hex, a full hash, SQL / wildcard text, a number, an array', async () => {
    const before = (await devIds()).length;
    for (const d of ['', 'bbbb000', 'bbbb00021', 'zzzzzzzz', 'b'.repeat(64), "' or 1=1", '%%%%%%%%', '________', 12345678, ['bbbb0002'], null, { $ne: '' }]) {
      const r = await a.post('/api/admin/erase', { device: d });
      eq(r.status, 400, 'id ' + JSON.stringify(d));
    }
    eq((await a.post('/api/admin/erase', '{"device":')).status, 400, 'bad JSON');
    eq((await devIds()).length, before, 'devices unchanged');
  });
  const auditBefore = (await a.get('/admin/privacy')).text.split('erase_device').length;
  await R.run('ERASE-03', 'Erasing a device that does not exist answers found:false with zero counts and removes nothing', async () => {
    const before = (await devIds()).length;
    const r = (await a.post('/api/admin/erase', { device: 'deadbeef' })).json();
    eq(r.result, { found: false, devices: 0, ips: 0, events: 0, participations: 0, games: 0, activeGames: 0 }, 'result');
    eq((await devIds()).length, before, 'devices unchanged');
  });
  await R.run('ERASE-04', 'Erase "bbbb0002" (Meera: 4 games, 2 names): the answer\'s counts equal the raw rows; device row, IPs, events and per-game place/device are gone; names become "Erased player" everywhere incl. earlier rounds; expired games lose the device link, the still-open game keeps the seat', async () => {
    const hash = ins.devices.find((d) => d.tokenHash.startsWith('bbbb0002')).tokenHash;
    const want = { found: true, devices: 1, ips: ins.ips.filter((i) => i.tokenHash === hash).length, events: ins.events.filter((e) => e.device === hash).length, participations: ins.participations.filter((p) => p.tokenHash === hash).length, games: 4, activeGames: 1 };
    assert(want.events >= 20 && want.participations === 4, 'dataset');
    const before = (await a.get('/admin/players/bbbb0002')).text;
    assert(before.includes('Meera K') && before.includes('2405:201:4001:a0::7'), 'control: the device page showed two names and the IP before');
    const r = (await a.post('/api/admin/erase', { device: 'BBBB0002 ' })).json();
    eq(r.result, want, 'result');
    assert(!(await devIds()).includes('bbbb0002'), 'device row');
    eq(parseCsv((await a.get('/api/admin/events.csv?range=90d&device=bbbb0002')).text).length - 1, 0, 'events');
    for (const code of ['DWAAA', 'MXRND', 'EXPRD', 'UTCMD']) {
      const t = (await a.get('/api/admin/games/' + code)).text, j = JSON.parse(t);
      assert(!t.includes('Meera') && !t.includes('2405:201'), code + ' still has the name or the IP');
      assert(t.includes('Erased player'), code + ' has no "Erased player"');
      assert(!j.insights.participations.some((p) => p.device === 'bbbb0002'), code + ' participation');
      const linked = j.game.hostDevice === 'bbbb0002' || Object.values(j.game.devices).includes('bbbb0002');
      eq(linked, code === 'DWAAA', code + ' device link (kept only for the game that has not expired)');
      const page = (await a.get('/admin/games/' + code)).text;
      assert(!page.includes('Meera') && !page.includes('2405:201'), code + ' page');
    }
    const hist = (await a.get('/api/admin/games/MXRND')).json().game.doc.history[0].prizes[0];
    eq(hist.winnerName, 'Erased player', 'earlier round winner name');
    for (const u of ['/admin/players', '/admin/games?range=7d', '/admin/events?range=7d', '/api/admin/games.csv?from=2026-01-01', '/api/admin/players.csv', '/api/admin/events.csv?range=90d']) { const t = (await a.get(u)).text; assert(!t.includes('Meera') && !t.includes('2405:201'), u + ' still shows Meera / her IP'); }
    const gone = await a.get('/admin/players/bbbb0002');
    assert(/No device|not found|can.t find|no longer|Nothing/i.test(gone.text.replace(/<[^>]+>/g, ' ')), 'the device page says it is gone');
    const ov = (await a.get('/admin?range=yesterday')).text.replace(/<[^>]+>/g, ' ');
    return JSON.stringify(r.result);
  });
  await R.run('ERASE-05', 'Idempotent: erasing the same id again removes nothing more (only the seat in the still-open game is reported), and other people\'s data is untouched', async () => {
    const r = (await a.post('/api/admin/erase', { device: 'bbbb0002' })).json();
    eq(r.result, { found: true, devices: 0, ips: 0, events: 0, participations: 0, games: 1, activeGames: 1 }, 'second erase');
    const ids = await devIds();
    for (const id of ['aaaa0001', 'cccc0003', 'dddd0004', 'ffff0006']) assert(ids.includes(id), id + ' was removed too');
    const d = (await a.get('/api/admin/games/DWAAA')).text;
    assert(d.includes('Priya') && d.includes('Ravi') && d.includes('49.36.10.11'), 'others in the same game');
  });
  await R.run('ERASE-06', 'Two devices whose 8-character ids collide ("12345678"): erase removes BOTH (documented limitation of the short id)', async () => {
    const r = (await a.post('/api/admin/erase', { device: '12345678' })).json();
    eq([r.result.devices, r.result.ips, r.result.games], [2, 2, 1], 'both went');
  });
  await R.run('ERASE-07', 'Audit: every erase (also "not found" ones) leaves one line with the id and counts — and no name, IP or place', async () => {
    const html = (await a.get('/admin/privacy')).text;
    const t = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    for (const id of ['bbbb0002', 'deadbeef', '12345678']) assert(t.includes(id), 'audit has no ' + id);
    assert(!/Meera|2405:201|Delhi/.test(t), 'audit shows personal data');
    const n = (t.match(/Erased a device|erase_device|Erase a device/gi) || []).length;
    assert(n >= 4, 'audit lines: ' + n);
  });
})();
