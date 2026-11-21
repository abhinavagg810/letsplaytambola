const { OUT } = require('./lib.cjs');
// Independent recomputation of the admin's figures from the raw seeded rows, compared with (a) the rendered pages
// (dump.json) and (b) the CSV exports. None of the application's aggregate code is used here.
const { build, EXPECT } = require('./seed-data.cjs');
const { mk, parseCsv, Results, assert, eq, RESULTS } = require('./lib.cjs');
const PORT = process.env.PORT || 8600;
const BASE = `http://localhost:${PORT}`;
const meta = require(`${OUT}/seed-meta-${PORT}.json`);
const dump = require(OUT + '/dump.json');
const R = new Results(RESULTS);
const { data } = build(meta.now);
const games = [...data.games.values()];
const ins = data.insights;
const IST = 5.5 * 3600e3, DAY = 864e5, D0 = meta.D0;
const RANGE = { today: [D0, D0 + DAY], yesterday: [D0 - DAY, D0], '7d': [D0 - 6 * DAY, D0 + DAY], 'range=30d': [D0 - 29 * DAY, D0 + DAY], 'range=90d': [D0 - 89 * DAY, D0 + DAY] };
RANGE['range=today'] = RANGE.today; RANGE['range=yesterday'] = RANGE.yesterday;
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const num = (n) => Math.round(n).toLocaleString('en-IN');
const dur = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
const pct = (a, b, d = 0) => (b > 0 ? ((a / b) * 100).toFixed(d) + '%' : '—');
const dayName = (ms) => { const d = new Date(ms + IST); return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

function gameNumbers(from, to) {
  const rows = games.filter((g) => g.createdAt >= from && g.createdAt < to);
  let started = 0, finished = 0, players = 0, prize = 0, ticket = 0, priced = 0, durSum = 0, durN = 0;
  const devs = new Set();
  for (const g of rows) {
    const rounds = [...(g.doc.history || []).map((r) => ({ ...r, started: true, finished: true })), { startedAt: g.doc.startedAt, finishedAt: g.doc.finishedAt, players: g.doc.players.length, prizes: g.doc.prizes, started: g.doc.status !== 'lobby', finished: g.doc.status === 'done' }];
    if (rounds.some((r) => r.started)) started++;
    if (rounds.some((r) => r.finished)) finished++;
    players += g.doc.players.length;
    if (g.doc.price > 0) priced++;
    devs.add(g.hostTokenHash.slice(0, 8));
    for (const p of g.players) devs.add(p.tokenHash.slice(0, 8));
    for (const r of rounds) {
      if (r.started) { prize += r.prizes.reduce((a, p) => a + p.amount, 0); ticket += g.doc.price * r.players; }
      if (r.finished) { durSum += r.finishedAt - r.startedAt; durN++; }
    }
  }
  return { rows, created: rows.length, started, finished, players, devs: devs.size, prize, ticket, priced, avgDur: durN ? durSum / durN : null, durN };
}
function trafficNumbers(from, to) {
  const evs = ins.events.filter((e) => e.at >= from && e.at < to);
  const actors = new Set(evs.map((e) => e.device || 's:' + e.session));
  const sessions = new Set(evs.map((e) => e.session));
  const devs = new Set(evs.filter((e) => e.device).map((e) => e.device));
  const first = new Map(ins.devices.map((d) => [d.tokenHash, d.firstSeen]));
  const timed = new Map();
  for (const e of evs) if (e.name === 'session_end') timed.set(e.session, Math.max(timed.get(e.session) || 0, e.props.ms));
  return { evs, visitors: actors.size, sessions: sessions.size, pageViews: evs.filter((e) => e.name === 'page_view').length,
    newDevices: ins.devices.filter((d) => d.firstSeen >= from && d.firstSeen < to).length, returning: [...devs].filter((d) => first.get(d) < from).length,
    avgMs: timed.size ? [...timed.values()].reduce((a, b) => a + b, 0) / timed.size : null, timed: timed.size };
}

(async () => {
  const api = mk(BASE);
  await api.login();

  // ---- DATA-01: hand-computed numbers (written before looking) vs the Overview
  await R.run('DATA-01', 'Overview game KPIs for 7 days match the hand-computed expectations', async () => {
    const k = dump['/|7d'].kpis, e = EXPECT['7d'];
    eq([k['Games created'].value, k['Games started'].value, k['Games finished'].value, k['Completion rate'].value, k['Players'].value, k['Devices that played'].value, k['Avg players per game'].value, k['Avg game length'].value, k['Prize money'].value, k['Ticket money'].value, k['Notify-me sign-ups'].value],
      [e.created, e.started, e.finished, e.completion, e.players, e.devicesPlayed, e.avgPlayers, e.avgLength, inr(e.prizeMoney), inr(e.ticketMoney), e.notify].map(String), '7d KPIs');
    assert(k['Avg game length'].foot.includes('3 finished rounds') && k['Ticket money'].foot.includes('3 priced games'), 'foot notes');
  });
  await R.run('DATA-02', 'Overview for Today and Yesterday match the hand-computed expectations (IST day boundaries: 23:59 / 00:00 / 05:29)', async () => {
    for (const r of ['today', 'yesterday']) {
      const k = dump[`/|range=${r}`].kpis, e = EXPECT[r];
      eq([k['Games created'].value, k['Games started'].value, k['Games finished'].value, k['Players'].value, k['Notify-me sign-ups'].value], [e.created, e.started, e.finished, e.players, e.notify].map(String), r);
    }
  });
  // ---- DATA-03: every range, overview recomputed independently
  for (const [rk, [from, to]] of Object.entries(RANGE)) {
    if (rk === 'today' || rk === 'yesterday') continue;
    const tag = rk.replace('range=', '');
    await R.run(`DATA-03-${tag}`, `Overview (${tag}): every game and visitor tile equals an independent recomputation from the raw rows`, async () => {
      const k = dump[`/|${rk}`].kpis, g = gameNumbers(from, to), t = trafficNumbers(from, to);
      const notify = [...data.phones.values()].filter((x) => x >= from && x < to).length;
      eq({ c: k['Games created'].value, s: k['Games started'].value, f: k['Games finished'].value, cr: k['Completion rate'].value, p: k['Players'].value, d: k['Devices that played'].value, len: k['Avg game length'].value, pm: k['Prize money'].value, tm: k['Ticket money'].value, n: k['Notify-me sign-ups'].value,
        v: k['Visitors'].value, se: k['Sessions'].value, nd: k['New devices'].value, rd: k['Returning devices'].value, pv: k['Page views'].value, at: k['Avg time on site'].value },
      { c: num(g.created), s: num(g.started), f: num(g.finished), cr: pct(g.finished, g.started), p: num(g.players), d: num(g.devs), len: g.avgDur === null ? '—' : dur(g.avgDur), pm: inr(g.prize), tm: inr(g.ticket), n: num(notify),
        v: num(t.visitors), se: num(t.sessions), nd: num(t.newDevices), rd: num(t.returning), pv: num(t.pageViews), at: t.avgMs === null ? '—' : dur(t.avgMs) }, tag);
      // chart tables: games per day
      const perDay = dump[`/|${rk}`].panels['Games per day'].table.rows;
      const days = Math.round((to - from) / DAY);
      eq(perDay.length, days, 'days in the table');
      for (let i = 0; i < days; i++) {
        const a = from + i * DAY, dg = gameNumbers(a, a + DAY);
        eq(perDay[i], [dayName(a), num(dg.created), num(dg.started), num(dg.finished)], 'games per day row ' + i);
      }
      const vis = dump[`/|${rk}`].panels['Visitors per day'].table.rows;
      for (let i = 0; i < days; i++) { const a = from + i * DAY, dt = trafficNumbers(a, a + DAY); eq(vis[i], [dayName(a), num(dt.visitors), num(dt.sessions)], 'visitors per day row ' + i); }
      return `${g.created} games, ${t.evs.length} events`;
    });
  }
  // ---- DATA-04: compare-to-previous
  await R.run('DATA-04', 'Compare to previous period: deltas equal (cur-prev)/prev; from zero shows "new"; no NaN/Infinity anywhere', async () => {
    for (const key of ['/|cmp=1', '/|range=today&cmp=1', '/|range=yesterday&cmp=1']) {
      const txt = JSON.stringify(dump[key].kpis);
      assert(!/NaN|Infinity|undefined/.test(txt), key + ' has NaN/Infinity');
    }
    const k = dump['/|cmp=1'].kpis;
    eq([k['Games created'].delta, k['Players'].delta, k['Prize money'].delta, k['Completion rate'].delta, k['Avg players per game'].delta], ['▲up 600%', '▲up 550%', 'new', '▼down 50%', '▼down 7.1%'], '7d deltas');
    const t = dump['/|range=today&cmp=1'].kpis;
    eq(t['Games finished'].delta, '▼down 100%', 'today finished vs yesterday');
    const y = dump['/|range=yesterday&cmp=1'].kpis;
    eq(y['Games finished'].delta, 'new', 'yesterday finished vs the day before (0)');
  });
  // ---- DATA-05: geography vs hand numbers
  await R.run('DATA-05', 'Geography (7d): countries and Indian states — visitors, games hosted, devices; unknown place; URL-decoded "São Paulo"', async () => {
    const tabs = dump['/geography|7d'].tables;
    const country = Object.fromEntries(tabs[0].rows.map((r) => [r[0], r]));
    eq(country['India'].slice(1), ['4', '50.0%', '11', '5', '10', '3'], 'India (players counted by join time: includes one join at 00:01 into a game created 23:59:59 the day before)');
    eq(country['Unknown'].slice(1), ['1', '12.5%', '2', '0', '1', '1'], 'Unknown');
    eq(country['United Kingdom'].slice(4), ['1', '0', '1'], 'UK');
    const city = tabs[2].rows.map((r) => r[0]);
    assert(city.some((c) => c.startsWith('São Paulo')), 'São Paulo row');
    const e = EXPECT.geo7d.country;
    for (const [code, name] of [['BR', /^(BR|Brazil)$/], ['US', /United States/], ['GB', /United Kingdom/]]) {
      const row = tabs[0].rows.find((r) => name.test(r[0])); assert(row, 'row for ' + code);
      eq([row[4], row[6]], [String(e[code].games), String(e[code].devices)], code + ' games/devices');
    }
  });
  // ---- DATA-06..: breakdowns recomputed for every range
  const sessBy = (evs, keyOf) => { const m = new Map(); for (const e of evs.filter((x) => x.name === 'session_start')) { const k = keyOf(e); if (!m.has(k)) m.set(k, { s: new Set(), a: new Set() }); m.get(k).s.add(e.session); m.get(k).a.add(e.device || 's:' + e.session); } return m; };
  for (const [rk, [from, to]] of Object.entries(RANGE)) {
    if (rk === 'today' || rk === 'yesterday') continue;
    const tag = rk.replace('range=', '');
    const t = trafficNumbers(from, to);
    await R.run(`DATA-06-${tag}`, `Technology (${tag}): device type / OS / browser / in-app tables equal the recomputation`, async () => {
      const p = dump[`/technology|${rk}`].panels;
      const check = (title, keyOf, label) => {
        const m = sessBy(t.evs, keyOf);
        const got = Object.fromEntries(p[title].table.rows.map((r) => [r[0], [r[1], r[3]]]));
        const want = Object.fromEntries([...m].map(([k, v]) => [label(k), [num(v.s.size), num(v.a.size)]]));
        eq(got, want, title);
      };
      const cap = (s) => ({ phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop' }[s] || s);
      check('Device type', (e) => e.deviceType, cap);
      check('Operating system', (e) => e.os, (k) => k);
      check('Browser', (e) => e.browser, (k) => k);
      check('In-app browsers', (e) => e.inApp || '', (k) => k || 'A normal browser');
    });
    await R.run(`DATA-07-${tag}`, `Acquisition (${tag}): sources table and WhatsApp share equal the recomputation`, async () => {
      const o = dump[`/acquisition|${rk}`];
      const m = sessBy(t.evs, (e) => e.source);
      const got = Object.fromEntries(o.panels['Sources'].table.rows.map((r) => [r[0], [r[1], r[2]]]));
      const names = { direct: 'Direct / typed in', whatsapp: 'WhatsApp', google: 'Google', facebook: 'Facebook', instagram: 'Instagram' };
      const want = Object.fromEntries([...m].map(([k, v]) => [names[k] || k, [num(v.s.size), num(v.a.size)]]));
      eq(got, want, 'sources');
      const total = [...m.values()].reduce((a, v) => a + v.s.size, 0), wa = m.get('whatsapp')?.s.size || 0;
      eq([o.kpis['Sessions'].value, o.kpis['From WhatsApp'].value], [num(total), pct(wa, total)], 'kpis');
    });
    await R.run(`DATA-08-${tag}`, `Funnels (${tag}): hosting and joining steps (closed-funnel "kept" and "did at all") equal the recomputation`, async () => {
      const stepOf = (e) => (e.name === 'page_view' ? 'page_view:' + e.props.page : e.name === 'results_seen' ? 'results_seen:' + e.props.role : e.name);
      const did = new Map();
      for (const e of t.evs) { const a = e.device || 's:' + e.session; if (!did.has(a)) did.set(a, new Set()); did.get(a).add(stepOf(e)); }
      const calc = (steps) => steps.map((s, i) => [[...did.values()].filter((x) => steps.slice(0, i + 1).every((y) => x.has(y))).length, [...did.values()].filter((x) => x.has(s)).length]);
      const H = ['page_view:home', 'page_view:host', 'host_name_typed', 'host_create_tap', 'host_created', 'game_start', 'results_seen:host'];
      const J = ['page_view:game_invite', 'join_name_typed', 'join_ok', 'results_seen:player'];
      const p = dump[`/funnels|${rk}`].panels;
      eq(p['Hosting a game'].table.rows.map((r) => [r[1], r[5]]), calc(H).map((x) => x.map(num)), 'host funnel');
      eq(p['Joining a game'].table.rows.map((r) => [r[1], r[5]]), calc(J).map((x) => x.map(num)), 'join funnel');
      const kept = p['Hosting a game'].table.rows.map((r) => Number(r[1].replace(/,/g, '')));
      assert(kept.every((v, i) => i === 0 || v <= kept[i - 1]), 'funnel must never rise');
    });
    await R.run(`DATA-09-${tag}`, `Engagement (${tag}): players-per-game histogram, medians and replay rate equal the recomputation`, async () => {
      const g = gameNumbers(from, to);
      const p = dump[`/engagement|${rk}`];
      const counts = g.rows.map((x) => x.doc.players.length);
      const bucket = (v) => (v <= 5 ? String(v) : v <= 10 ? '6–10' : v <= 20 ? '11–20' : '21+');
      const want = {}; for (const l of ['0', '1', '2', '3', '4', '5', '6–10', '11–20', '21+']) want[l] = 0;
      for (const v of counts) want[bucket(v)]++;
      eq(Object.fromEntries(p.panels['Players per game'].table.rows.map((r) => [r[0], Number(r[1].replace(/,/g, ''))])), want, 'players histogram');
      const s = [...counts].sort((a, b) => a - b);
      const q = (f) => { const pos = (s.length - 1) * f, lo = Math.floor(pos), hi = Math.ceil(pos); return s[lo] + (s[hi] - s[lo]) * (pos - lo); };
      const med = q(0.5);
      eq(p.kpis['Players per game'].value, med.toLocaleString('en-IN', { maximumFractionDigits: 1 }), 'median players');
      const fin = g.rows.filter((x) => x.doc.status === 'done' || (x.doc.history || []).length), replay = fin.filter((x) => x.doc.round > 1);
      assert(p.kpis['Replay rate'].foot.startsWith(`${num(replay.length)} of ${num(fin.length)} `), 'replay foot: ' + p.kpis['Replay rate'].foot);
    });
    await R.run(`DATA-10-${tag}`, `Plays (${tag}): page total = CSV rows = raw count; every status / quick filter total matches; CSV totals match the overview`, async () => {
      const g = gameNumbers(from, to);
      const page = dump[`/games|${rk}`];
      const m = /of ([\d,]+) plays/.exec(page.pager) || (g.created <= 25 ? [0, String(g.created)] : null);
      eq(m && m[1].replace(/,/g, ''), String(g.created), 'pager total');
      const days = (ms) => new Date(ms + IST).toISOString().slice(0, 10);
      const qs = `from=${days(from)}&to=${days(to - 1)}`;
      const csv = parseCsv((await api.get(`/api/admin/games.csv?${qs}`)).text);
      eq(csv.length - 1, g.created, 'csv rows');
      const col = (name) => csv[0].indexOf(name);
      eq(csv.slice(1).reduce((a, r) => a + Number(r[col('Players')]), 0), g.players, 'csv players sum = overview players');
      eq(new Set(csv.slice(1).map((r) => r[col('Code')])).size, g.created, 'unique codes');
      const now = Date.now();
      const st = (x) => (x.doc.status === 'done' ? 'done' : now - x.updatedAt > DAY ? 'expired' : x.doc.status);
      for (const s of ['lobby', 'live', 'done', 'expired']) {
        const j = (await api.get(`/api/admin/games?${qs}&status=${s}`)).json();
        eq(j.total, g.rows.filter((x) => st(x) === s).length, 'status ' + s);
        const c2 = parseCsv((await api.get(`/api/admin/games.csv?${qs}&status=${s}`)).text);
        eq(c2.length - 1, j.total, 'csv status ' + s);
      }
      eq((await api.get(`/api/admin/games?${qs}&quick=priced`)).json().total, g.priced, 'priced');
      eq((await api.get(`/api/admin/games?${qs}&quick=abandoned`)).json().total, g.rows.filter((x) => x.doc.status === 'lobby' && now - x.updatedAt > 3600e3).length, 'abandoned');
    });
  }
  await R.run('DATA-11', 'Plays status and quick-filter totals for 7 days match the hand-computed expectations', async () => {
    const e = EXPECT['7d'];
    for (const [s, n] of Object.entries(e.status)) eq((await api.get(`/api/admin/games?status=${s}&from=${new Date(D0 - 6 * DAY + IST).toISOString().slice(0, 10)}`)).json().total, n, s);
  });
  // ---- retention
  await R.run('DATA-12', 'Retention: day-1 / day-7 / day-30 return rates, hosts and returning hosts equal the recomputation', async () => {
    const k = dump['/retention|7d'].kpis;
    const dayIdx = (ms) => Math.floor((ms + IST) / DAY), today = dayIdx(meta.now);
    const active = new Map();
    for (const e of ins.events) if (e.device) { if (!active.has(e.device)) active.set(e.device, new Set()); active.get(e.device).add(dayIdx(e.at)); }
    const rate = (n) => { let el = 0, re = 0; for (const d of ins.devices) { const f = dayIdx(d.firstSeen); if (f > today - n) continue; el++; if ([...(active.get(d.tokenHash) || [])].some((x) => x >= f + n)) re++; } return [el, re]; };
    for (const [n, label, word] of [[1, 'Came back after day 1', '1+ day ago'], [7, 'Came back after day 7', '7+ days ago'], [30, 'Came back after day 30', '30+ days ago']]) {
      const [el, re] = rate(n);
      eq(k[label].value, pct(re, el), label);
      assert(k[label].foot.startsWith(`${num(re)} of ${num(el)} devices`), label + ' foot: ' + k[label].foot);
    }
    const hd = new Map();
    for (const p of ins.participations) if (p.role === 'host') { if (!hd.has(p.tokenHash)) hd.set(p.tokenHash, new Set()); hd.get(p.tokenHash).add(dayIdx(p.at)); }
    eq(k['Hosts'].value, num(hd.size), 'hosts');
    const ret = [...hd.values()].filter((s) => s.size >= 2).length;
    eq(k['Returning hosts'].value, pct(ret, hd.size), 'returning hosts');
    const coh = dump['/retention|7d'].tables[0].rows;
    eq(coh[coh.length - 1].slice(1, 3), ['5', '100%'], 'this week cohort (hand: B, D, E, F, G)');
    eq(coh[coh.length - 2].slice(1, 4), ['2', '100%', '100%'], 'last week cohort (hand: A, C — both active again this week)');
  });
  // ---- players / devices
  await R.run('DATA-13', 'Players: page total = CSV rows = raw device rows; "only devices that played"; lifetime counters; a device with two names; a host who never played', async () => {
    const csv = parseCsv((await api.get('/api/admin/players.csv')).text);
    eq(csv.length - 1, ins.devices.length, 'csv rows');
    const m = /of ([\d,]+) /.exec(dump['/players|7d'].pager); eq(m && m[1], String(ins.devices.length), 'pager');
    const played = parseCsv((await api.get('/api/admin/players.csv?played=1')).text);
    eq(played.length - 1, ins.devices.filter((d) => d.gamesHosted + d.gamesJoined > 0).length, 'played');
    const by = Object.fromEntries(csv.slice(1).map((r) => [r[0], r]));
    const h = csv[0];
    const g = by['0000abcd'];
    eq([g[h.indexOf('Games hosted')], g[h.indexOf('Games joined')], g[h.indexOf('Last name used')]], ['1', '0', 'George'], 'host who never played');
    const b = by['bbbb0002'];
    eq([b[h.indexOf('Games hosted')], b[h.indexOf('Games joined')], b[h.indexOf('Prizes won')], b[h.indexOf('Recorded amount won (INR)')]], ['1', '3', '2', '160'], 'Meera counters');
    for (const d of ins.devices) { const row = by[d.tokenHash.slice(0, 8)]; assert(row, 'row for ' + d.tokenHash.slice(0, 8)); if (d.tokenHash.startsWith('12345678')) continue; eq([row[h.indexOf('Sessions')], row[h.indexOf('Games hosted')], row[h.indexOf('Games joined')]], [String(d.sessions), String(d.gamesHosted), String(d.gamesJoined)], 'counters ' + row[0]); }
  });
  // ---- events
  for (const [rk, [from, to]] of Object.entries(RANGE)) {
    if (rk === 'today' || rk === 'yesterday') continue;
    const tag = rk.replace('range=', '');
    await R.run(`DATA-14-${tag}`, `Events (${tag}): page total = CSV rows = raw count (CSV capped at 5,000); filters by name / device / game`, async () => {
      const n = ins.events.filter((e) => e.at >= from && e.at < to).length;
      const m = /of ([\d,]+) events/.exec(dump[`/events|${rk}`].pager);
      eq(m && m[1].replace(/,/g, ''), String(n), 'pager');
      const rq = rk === '7d' ? 'range=7d' : rk;
      const csv = parseCsv((await api.get(`/api/admin/events.csv?${rq}`)).text);
      eq(csv.length - 1, Math.min(5000, n), 'csv rows');
      for (const [f, pred] of [['name=join_ok', (e) => e.name === 'join_ok'], ['device=bbbb0002', (e) => e.device && e.device.startsWith('bbbb0002')], ['code=DWAAA', (e) => e.code === 'DWAAA']]) {
        const c = parseCsv((await api.get(`/api/admin/events.csv?${rq}&${f}`)).text);
        eq(c.length - 1, Math.min(5000, ins.events.filter((e) => e.at >= from && e.at < to && pred(e)).length), f);
      }
    });
  }
  await R.run('DATA-15', 'Notify me: page rows = CSV rows = raw count, newest first', async () => {
    const csv = parseCsv((await api.get('/api/admin/notify.csv')).text);
    eq(csv.length - 1, data.phones.size, 'csv rows');
    eq(csv[1][0], '9810000001', 'newest first');
    assert(dump['/notify|7d'].text.includes(String(data.phones.size)), 'page shows the total');
  });
  const fails = R.list.filter((r) => r.status === 'fail' && r.id.startsWith('DATA'));
  console.log('\nDATA failures:', fails.length);
})();
