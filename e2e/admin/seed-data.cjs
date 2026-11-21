// QA dataset for the admin: a hand-designed CORE (last 8 India days, known expected numbers) plus a generated BULK
// (days -15 … -85) for load. Pure data builder: build(now) → { games: Map, phones: Map, insights }, the exact shape of
// the memory store's process-global data. Used two ways: preloaded into a real `next start` (seed-preload.cjs) and
// read by the verifier, which recomputes every figure with its own code.
const crypto = require('crypto');
const IST = 5.5 * 3600e3, DAY = 864e5, MIN = 60e3;

const hash = (prefix8) => prefix8 + crypto.createHash('sha256').update('qa:' + prefix8).digest('hex').slice(8);
const XSS_SCRIPT = '<script>window.__xss=1</script>';
const XSS_IMG = '"><img src=x onerror=window.__xss=1>';
const CSV_FORMULA = '=HYPERLINK("http://evil.example","x")';

function build(now) {
  const D0 = Math.floor((now + IST) / DAY) * DAY - IST; // 00:00 IST today
  const at = (day, h, m, s = 0) => D0 + day * DAY + h * 3600e3 + m * MIN + s * 1e3;

  const ANDROID = { deviceType: 'phone', os: 'Android', osVersion: '14', browser: 'Chrome', browserVersion: '126', inApp: null, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36' };
  const IOS_WA = { deviceType: 'phone', os: 'iOS', osVersion: '17', browser: 'WebView', browserVersion: '17', inApp: 'WhatsApp', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.12.78' };
  const SAMSUNG = { deviceType: 'phone', os: 'Android', osVersion: '14', browser: 'Samsung Internet', browserVersion: '25', inApp: null, ua: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36' };
  const WIN = { deviceType: 'desktop', os: 'Windows', osVersion: '10', browser: 'Chrome', browserVersion: '126', inApp: null, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' };
  const IPAD = { deviceType: 'tablet', os: 'iPadOS', osVersion: '17', browser: 'Safari', browserVersion: '17', inApp: null, ua: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' };
  const MAC = { deviceType: 'desktop', os: 'macOS', osVersion: '10', browser: 'Safari', browserVersion: '17', inApp: null, ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15' };
  const FF = { deviceType: 'desktop', os: 'Windows', osVersion: '10', browser: 'Firefox', browserVersion: '127', inApp: null, ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0' };
  const AND_WA = { deviceType: 'phone', os: 'Android', osVersion: '13', browser: 'WebView', browserVersion: '125', inApp: 'WhatsApp', ua: 'Mozilla/5.0 (Linux; Android 13; SM-A536E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0 Mobile Safari/537.36 WhatsApp/2.24.11.79' };

  const geo = (ip, country, region, city, lat = null, lon = null, timezone = null, postal = null) => ({ ip, country, region, city, lat, lon, timezone, postal });
  // ------------------------------------------------------------------ core people
  const P = {
    A: { key: 'A', hash: hash('aaaa0001'), name: 'Priya', ...geo('49.36.10.11', 'IN', 'MH', 'Mumbai', 19.076, 72.8777, 'Asia/Kolkata', '400001'), ...ANDROID, source: 'whatsapp', sw: 390, lang: 'en-IN', utm: ['whatsapp', 'social', 'diwali'], ref: null, landing: '/' },
    B: { key: 'B', hash: hash('bbbb0002'), name: 'Meera', ...geo('2405:201:4001:a0::7', 'IN', 'DL', 'Delhi', 28.6139, 77.209, 'Asia/Kolkata'), ...IOS_WA, source: 'whatsapp', sw: 390, lang: 'hi-IN', utm: [null, null, null], ref: null, landing: '/g/[code]' },
    C: { key: 'C', hash: hash('cccc0003'), name: 'Ravi', ...geo('106.210.5.6', 'IN', 'MH', 'Pune', 18.5204, 73.8567, 'Asia/Kolkata'), ...SAMSUNG, source: 'direct', sw: 360, lang: 'en-IN', utm: [null, null, null], ref: null, landing: '/g/[code]' },
    D: { key: 'D', hash: hash('dddd0004'), name: 'Sunita', ...geo('200.160.2.3', 'BR', 'SP', 'São Paulo', -23.55, -46.63, 'America/Sao_Paulo'), ...WIN, source: 'google', sw: 1920, lang: 'pt-BR', utm: [null, null, null], ref: 'google.com', landing: '/g/[code]' },
    E: { key: 'E', hash: hash('eeee0005'), name: 'Asha', ...geo(null, null, null, null), ...IPAD, source: 'direct', sw: 820, lang: 'en-GB', utm: [null, null, null], ref: null, landing: '/' },
    F: { key: 'F', hash: hash('ffff0006'), name: XSS_SCRIPT, ...geo('8.8.4.4', 'US', 'CA', XSS_IMG, 37.33, -121.88, 'America/Los_Angeles'), ...MAC, source: '=cmd|\'/C calc\'!A0', sw: 1440, lang: 'en-US', utm: ['<b>utm</b>', '@SUM(1+1)', '+cmd'], ref: 'javascript:alert(1)', landing: '/g/[code]' },
    G: { key: 'G', hash: hash('0000abcd'), name: 'George', ...geo('81.2.69.160', 'GB', 'ENG', 'London', 51.5074, -0.1278, 'Europe/London'), ...FF, source: 'google', sw: 1440, lang: 'en-GB', utm: [null, null, null], ref: 'google.co.uk', landing: '/' },
  };
  // two devices whose 8-character ids collide
  const H1 = { key: 'H1', hash: '12345678' + 'a'.repeat(56), name: 'Twin One', ...geo('10.0.0.1', 'IN', 'KA', 'Bengaluru'), ...ANDROID, source: 'direct', sw: 412, lang: 'en-IN', utm: [null, null, null], ref: null, landing: '/' };
  const H2 = { key: 'H2', hash: '12345678' + 'b'.repeat(56), name: 'Twin Two', ...geo('10.0.0.2', 'IN', 'TN', 'Chennai'), ...WIN, source: 'direct', sw: 1366, lang: 'en-IN', utm: [null, null, null], ref: null, landing: '/' };

  const games = new Map();
  const ins = { devices: [], ips: [], events: [], participations: [], audit: [], nextEventId: 1, nextAuditId: 1 };
  const devRow = new Map(); // hash -> StoredDevice

  const ensureDevice = (p, t) => {
    let d = devRow.get(p.hash);
    if (!d) {
      d = {
        tokenHash: p.hash, firstSeen: t, lastSeen: t, sessions: 0,
        ip: p.ip, country: p.country, region: p.region, city: p.city, lat: p.lat, lon: p.lon, timezone: p.timezone, postal: p.postal,
        deviceType: p.deviceType, os: p.os, osVersion: p.osVersion, browser: p.browser, browserVersion: p.browserVersion, inApp: p.inApp, ua: p.ua, language: p.lang,
        screenW: p.sw, screenH: p.sw > 1000 ? 1080 : 844, viewportW: p.sw, viewportH: 700, dpr: p.sw > 1000 ? 100 : 300, clientTz: p.timezone || 'Asia/Kolkata', touch: p.sw < 1000, connection: '4g', standalone: false,
        firstReferrer: p.ref, firstUtmSource: p.utm[0], firstUtmMedium: p.utm[1], firstUtmCampaign: p.utm[2], firstLanding: p.landing, firstSource: p.source,
        gamesHosted: 0, gamesJoined: 0, prizesWon: 0, amountWon: 0, lastName: null,
      };
      devRow.set(p.hash, d);
      ins.devices.push(d);
      if (p.ip) ins.ips.push({ tokenHash: p.hash, ip: p.ip, country: p.country, region: p.region, city: p.city, firstSeen: t, lastSeen: t, hits: 0 });
    }
    d.firstSeen = Math.min(d.firstSeen, t);
    d.lastSeen = Math.max(d.lastSeen, t);
    const ip = ins.ips.find((i) => i.tokenHash === p.hash && i.ip === p.ip);
    if (ip) { ip.firstSeen = Math.min(ip.firstSeen, t); ip.lastSeen = Math.max(ip.lastSeen, t); ip.hits += 1; }
    return d;
  };

  /** One usage event. `p` = a person, or a plain context object for a visitor without a device token. */
  const ev = (p, session, t, name, props = {}, code = null, path = null) => {
    if (p.hash) ensureDevice(p, t);
    if (p.hash && name === 'session_start') devRow.get(p.hash).sessions += 1;
    ins.events.push({
      id: ins.nextEventId++, at: t, device: p.hash || null, session, name, code, path, props,
      country: p.country, region: p.region, city: p.city, deviceType: p.deviceType, os: p.os, browser: p.browser, inApp: p.inApp, source: p.source,
    });
  };
  const part = (code, p, role, pid, t, name) => {
    const d = ensureDevice(p, t);
    ins.participations.push({ code, tokenHash: p.hash, role, pid, at: t, ip: p.ip, country: p.country, region: p.region, city: p.city, deviceType: p.deviceType, os: p.os, osVersion: p.osVersion, browser: p.browser, browserVersion: p.browserVersion, inApp: p.inApp });
    if (role === 'host') d.gamesHosted += 1; else d.gamesJoined += 1;
    d.lastName = name;
  };
  const TICKET = [[1, 0, 21, 0, 41, 0, 61, 0, 81], [0, 12, 0, 32, 0, 52, 0, 72, 0], [3, 0, 23, 0, 43, 0, 63, 0, 83]];
  const COLORS = ['marigold', 'pink', 'teal', 'grape', 'tomato', 'blue'];
  const prize = (rule, label, amount, winner = null, wonAt = null) => ({ id: rule, rule, label, amount, winnerPid: winner ? winner[0] : null, winnerName: winner ? winner[1] : null, wonAt });
  /**
   * g: { code, name, host: person, hostName?, hostPlays, price, status, created, updated, seats: [[person, name, joinedAt]],
   *      called, prizes, startedAt, finishedAt, round, history, fixed }
   */
  const game = (g) => {
    const players = [];
    const rows = [];
    let n = 0;
    const seat = (p, name, t) => {
      const pid = 'p' + (++n);
      players.push({ pid, name, color: COLORS[(n - 1) % 6], joinedAt: t });
      rows.push({ pid, ticket: JSON.parse(JSON.stringify(TICKET)), marks: [1, 21], tokenHash: p.hash, rev: 1 });
      return pid;
    };
    let hostPid = null;
    if (g.hostPlays) hostPid = seat(g.host, g.hostName || g.host.name, g.created);
    part(g.code, g.host, 'host', hostPid, g.created, g.hostName || g.host.name);
    for (const [p, name, t] of g.seats || []) part(g.code, p, 'player', seat(p, name, t), t, name);
    const events = [];
    let seq = 0;
    for (const pl of players) events.push({ seq: ++seq, at: pl.joinedAt, kind: 'join', pid: pl.pid, name: pl.name });
    if (g.startedAt) events.push({ seq: ++seq, at: g.startedAt, kind: 'start' });
    for (const pr of g.prizes) if (pr.winnerPid) events.push({ seq: ++seq, at: pr.wonAt, kind: 'win', pid: pr.winnerPid, name: pr.winnerName, prizeId: pr.id, label: pr.label });
    const doc = {
      code: g.code, name: g.name, hostName: g.hostName || g.host.name, hostPid, price: g.price || 0, status: g.status,
      called: Array.from({ length: g.called || 0 }, (_, i) => i + 1), auto: 0, round: g.round || 1, prizes: g.prizes, players, events, seq,
      createdAt: g.created, updatedAt: g.updated, version: 5, startedAt: g.startedAt ?? null, finishedAt: g.finishedAt ?? null,
      ...(g.history ? { history: g.history } : {}), ...(g.fixed ? { fixedAmounts: true } : {}),
    };
    games.set(g.code, { doc, version: 5, hostTokenHash: g.host.hash, players: rows, updatedAt: g.updated, createdAt: g.created });
  };

  // ------------------------------------------------------------------ core games (see EXPECT below)
  const { A, B, C, D, E, F, G } = P;
  // G1 Diwali Night — finished yesterday evening, priced, 4 players
  game({ code: 'DWAAA', name: 'Diwali Night', host: A, hostPlays: true, price: 50, status: 'done', created: at(-1, 21, 0), updated: at(-1, 21, 40),
    seats: [[B, 'Meera', at(-1, 21, 2)], [C, 'Ravi', at(-1, 21, 3)], [D, 'Sunita', at(-1, 21, 5)]], called: 45, startedAt: at(-1, 21, 10), finishedAt: at(-1, 21, 40),
    prizes: [prize('top', 'Top Line', 60, ['p2', 'Meera'], at(-1, 21, 20)), prize('full', 'Full House', 140, ['p3', 'Ravi'], at(-1, 21, 40))] });
  // G2 Multi Round — two finished rounds three days ago, typed prize amounts, an XSS player name
  game({ code: 'MXRND', name: 'Multi Round', host: A, hostPlays: true, price: 0, fixed: true, status: 'done', round: 2, created: at(-3, 10, 0), updated: at(-3, 10, 40),
    seats: [[B, 'Meera', at(-3, 10, 2)], [F, XSS_SCRIPT, at(-3, 10, 3)]], called: 30, startedAt: at(-3, 10, 30), finishedAt: at(-3, 10, 40),
    prizes: [prize('early5', 'Early Five', 100, ['p3', XSS_SCRIPT], at(-3, 10, 33)), prize('full', 'Full House', 500, ['p3', XSS_SCRIPT], at(-3, 10, 40))],
    history: [{ round: 1, startedAt: at(-3, 10, 5), finishedAt: at(-3, 10, 25), called: 60, players: 3,
      prizes: [prize('early5', 'Early Five', 100, ['p2', 'Meera'], at(-3, 10, 8)), prize('full', 'Full House', 500, ['p1', 'Priya'], at(-3, 10, 25))] }] });
  // G3 abandoned lobby today — host does not play, formula-looking game name
  game({ code: 'ABBYA', name: CSV_FORMULA, host: G, hostPlays: false, price: 20, status: 'lobby', created: at(0, 9, 0), updated: at(0, 9, 0), seats: [], prizes: [prize('full', 'Full House', 0)] });
  // G4 live right now
  game({ code: 'NWNWQ', name: 'Live Now', host: C, hostPlays: true, price: 0, status: 'live', created: now - 20 * MIN, updated: now,
    seats: [[E, 'Asha', now - 18 * MIN]], called: 12, startedAt: now - 15 * MIN, prizes: [prize('top', 'Top Line', 0), prize('full', 'Full House', 0)] });
  // G5 created 23:59 IST two days ago, started 00:01 yesterday, never finished → expired
  game({ code: 'EXPRD', name: 'Midnight Game', host: D, hostPlays: true, price: 10, status: 'live', created: at(-2, 23, 59), updated: at(-1, 0, 5),
    seats: [[B, 'Meera K', at(-1, 0, 0, 10)]], called: 20, startedAt: at(-1, 0, 1), prizes: [prize('full', 'Full House', 20)] });
  // G6 lobby created 05:29 IST yesterday (= 23:59 UTC the day before) → expired lobby
  game({ code: 'UTCMD', name: 'UTC Midnight', host: B, hostPlays: true, price: 0, status: 'lobby', created: at(-1, 5, 29), updated: at(-1, 5, 29), seats: [], prizes: [prize('full', 'Full House', 0)] });
  // G7 the last second of day -7: OUTSIDE "7 days"        G8 the first millisecond of day -6: INSIDE
  game({ code: 'ZZPRV', name: 'Just Outside', host: A, hostPlays: true, price: 0, status: 'done', created: at(-7, 23, 59, 59), updated: at(-6, 0, 10),
    seats: [[C, 'Ravi', at(-6, 0, 1)]], called: 50, startedAt: at(-6, 0, 2), finishedAt: at(-6, 0, 7), prizes: [prize('full', 'Full House', 0, ['p2', 'Ravi'], at(-6, 0, 7))] });
  game({ code: 'ZZFST', name: 'Just Inside', host: A, hostPlays: true, price: 0, status: 'lobby', created: at(-6, 0, 0), updated: at(-6, 0, 0), seats: [], prizes: [prize('full', 'Full House', 0)] });

  // lifetime counters the server would have kept
  devRow.get(A.hash).prizesWon = 1; devRow.get(A.hash).amountWon = 500;
  devRow.get(B.hash).prizesWon = 2; devRow.get(B.hash).amountWon = 160; devRow.get(B.hash).lastName = 'Meera';
  devRow.get(C.hash).prizesWon = 2; devRow.get(C.hash).amountWon = 140;
  devRow.get(F.hash).prizesWon = 2; devRow.get(F.hash).amountWon = 600;
  devRow.get(A.hash).lastName = 'Priya';
  // Priya was also seen from a second address
  ins.ips.push({ tokenHash: A.hash, ip: '49.36.10.99', country: 'IN', region: 'MH', city: 'Mumbai', firstSeen: at(-7, 23, 50), lastSeen: at(-7, 23, 55), hits: 3 });

  // ------------------------------------------------------------------ core usage events
  const seq = (p, session, t0, list) => list.forEach(([name, props, code, path, dt], i) => ev(p, session, t0 + (dt ?? i * 20e3), name, props || {}, code || null, path || null));
  const ss = (p) => ({ sw: p.sw, landing: p.landing, ...(p.utm[0] && /^[a-z0-9]/.test(p.utm[0]) ? { utm_source: p.utm[0], utm_medium: p.utm[1], utm_campaign: p.utm[2] } : {}), ...(p.ref && /^[a-z0-9.]+$/.test(p.ref) ? { ref: p.ref } : {}), conn: '4g', touch: p.sw < 1000 });
  const pv = (page, code) => ['page_view', { page }, code, code ? '/g/[code]' : page === 'home' ? '/' : '/' + page.replace('_', '/')];

  // day -7 (outside 7 days): A hosts ZZPRV
  seq(A, 'sA0-00000001', at(-7, 23, 50), [['session_start', ss(A)], pv('home'), ['cta_host'], pv('host'), ['host_create_tap'], ['host_created', {}, 'ZZPRV']]);
  // day -6 00:00:00.000 exactly (inside)
  seq(A, 'sA3-00000001', at(-6, 0, 0), [['session_start', ss(A), null, null, 0], ['host_create_tap', {}, null, null, 0], ['host_created', {}, 'ZZFST', null, 0]]);
  seq(C, 'sC0-00000001', at(-6, 0, 1), [['session_start', ss(C)], pv('game_invite', 'ZZPRV'), ['join_tap', {}, 'ZZPRV'], ['join_ok', {}, 'ZZPRV']]);
  // day -3: MXRND
  seq(A, 'sA2-00000001', at(-3, 9, 55), [['session_start', ss(A)], pv('home'), ['cta_host'], pv('host'), ['host_name_typed'], ['host_amount_typed'], ['host_create_tap'], ['host_created', {}, 'MXRND'],
    ['game_start', {}, 'MXRND'], ['first_call', {}, 'MXRND'], ['claim_open', {}, 'MXRND'], ['claim_valid', { prize: 'full', called: 60 }, 'MXRND'], ['new_round', {}, 'MXRND'], ['game_start', {}, 'MXRND'], ['first_call', {}, 'MXRND'], ['session_end', { ms: 2700000 }]]);
  seq(B, 'sB2-00000001', at(-3, 10, 2), [['session_start', ss(B)], pv('game_invite', 'MXRND'), ['join_name_typed', {}, 'MXRND'], ['join_tap', {}, 'MXRND'], ['join_ok', {}, 'MXRND'], ['claim_open', {}, 'MXRND'], ['claim_valid', { prize: 'early5', called: 12 }, 'MXRND']]);
  seq(F, 'sF1-00000001', at(-3, 10, 3), [['session_start', ss(F)], pv('game_invite', 'MXRND'), ['join_tap', {}, 'MXRND'], ['join_ok', {}, 'MXRND'], ['claim_open', {}, 'MXRND'], ['claim_valid', { prize: 'early5', called: 9 }, 'MXRND'], ['claim_open', {}, 'MXRND'], ['claim_valid', { prize: 'full', called: 30 }, 'MXRND']]);
  // day -2 23:59 → day -1 00:01: EXPRD (sessions that cross India midnight)
  ev(D, 'sD2-00000001', at(-2, 23, 59, 0), 'session_start', ss(D));
  ev(D, 'sD2-00000001', at(-2, 23, 59, 5), 'host_create_tap');
  ev(D, 'sD2-00000001', at(-2, 23, 59, 10), 'host_created', {}, 'EXPRD');
  ev(D, 'sD2-00000001', at(-1, 0, 1, 0), 'game_start', {}, 'EXPRD');
  ev(D, 'sD2-00000001', at(-1, 0, 1, 30), 'first_call', {}, 'EXPRD');
  ev(B, 'sB4-00000001', at(-2, 23, 59, 50), 'session_start', ss(B));
  ev(B, 'sB4-00000001', at(-1, 0, 0, 5), 'join_tap', {}, 'EXPRD');
  ev(B, 'sB4-00000001', at(-1, 0, 0, 10), 'join_ok', {}, 'EXPRD');
  // day -1 05:29 IST (23:59 UTC) and 05:31 IST (00:01 UTC): UTCMD
  ev(B, 'sB3-00000001', at(-1, 5, 29, 0), 'session_start', ss(B));
  ev(B, 'sB3-00000001', at(-1, 5, 29, 10), 'host_create_tap');
  ev(B, 'sB3-00000001', at(-1, 5, 29, 20), 'host_created', {}, 'UTCMD');
  ev(B, 'sB3-00000001', at(-1, 5, 31, 0), 'page_view', { page: 'game_lobby', role: 'host' }, 'UTCMD', '/g/[code]');
  // day -1 evening: DWAAA
  seq(A, 'sA1-00000001', at(-1, 20, 50), [['session_start', ss(A)], pv('home'), ['cta_host'], pv('host'), ['host_name_typed'], pv('host_prizes'), ['host_preset', { preset: 'Classic' }], ['host_price_set'], ['host_create_tap'], ['host_created', {}, 'DWAAA'],
    pv('game_lobby', 'DWAAA'), ['share_whatsapp', {}, 'DWAAA'], ['share_copy', {}, 'DWAAA'], ['game_start', {}, 'DWAAA'], ['first_call', {}, 'DWAAA'], ['auto_on', {}, 'DWAAA'], pv('game_live', 'DWAAA'), pv('game_results', 'DWAAA'), ['results_seen', { role: 'host' }, 'DWAAA'], ['session_end', { ms: 3300000 }]]);
  seq(B, 'sB1-00000001', at(-1, 21, 1), [['session_start', ss(B)], pv('game_invite', 'DWAAA'), ['join_name_typed', {}, 'DWAAA'], ['join_tap', {}, 'DWAAA'], ['join_ok', {}, 'DWAAA'], pv('game_lobby', 'DWAAA'), pv('game_live', 'DWAAA'),
    ['claim_open', {}, 'DWAAA'], ['claim_invalid', { prize: 'top', reason: 'not_yet' }, 'DWAAA'], ['claim_open', {}, 'DWAAA'], ['claim_valid', { prize: 'top', called: 20 }, 'DWAAA'], pv('game_results', 'DWAAA'), ['results_seen', { role: 'player' }, 'DWAAA'], ['session_end', { ms: 2400000 }]]);
  seq(C, 'sC1-00000001', at(-1, 21, 2), [['session_start', ss(C)], pv('game_invite', 'DWAAA'), ['join_name_typed', {}, 'DWAAA'], ['join_tap', {}, 'DWAAA'], ['join_ok', {}, 'DWAAA'], pv('game_live', 'DWAAA'), ['claim_open', {}, 'DWAAA'], ['claim_valid', { prize: 'full', called: 45 }, 'DWAAA'], ['results_seen', { role: 'player' }, 'DWAAA']]);
  seq(D, 'sD1-00000001', at(-1, 21, 4), [['session_start', ss(D)], pv('game_invite', 'DWAAA'), ['join_name_typed', {}, 'DWAAA'], ['join_tap', {}, 'DWAAA'], ['join_failed', { reason: 'network' }, 'DWAAA'], ['join_tap', {}, 'DWAAA'], ['join_ok', {}, 'DWAAA'], ['mute_on', {}, 'DWAAA'], ['toast', { cls: 'network' }], ['session_end', { ms: 600000 }]]);
  // a visitor with no device token whose session crosses India midnight (yesterday 23:59:30 → today 00:00:30)
  const V = { country: 'IN', region: 'RJ', city: 'Jaipur', ...AND_WA, source: 'whatsapp' };
  ev(V, 'sV1-visitor01', at(-1, 23, 59, 30), 'session_start', { sw: 412, landing: '/g/[code]' });
  ev(V, 'sV1-visitor01', at(-1, 23, 59, 40), 'page_view', { page: 'home' }, null, '/');
  ev(V, 'sV1-visitor01', at(0, 0, 0, 30), 'page_view', { page: 'game_invite', role: 'visitor' }, 'DWAAA', '/g/[code]');
  // today
  seq(E, 'sE1-00000001', at(0, 8, 0), [['session_start', ss(E)], pv('home'), ['cta_join'], pv('join'), ['cta_code'], pv('not_found'), ['game_not_found'], ['session_end', { ms: 120000 }]]);
  seq(G, 'sG1-00000001', at(0, 8, 55), [['session_start', ss(G)], pv('home'), ['cta_host'], pv('host'), ['host_name_typed'], ['host_create_tap'], ['host_create_failed', { reason: 'invalid' }], ['host_create_tap'], ['host_created', {}, 'ABBYA'], pv('game_lobby', 'ABBYA'), ['toast', { cls: 'need_prize' }]]);
  seq(C, 'sC2-00000001', now - 21 * MIN, [['session_start', ss(C)], pv('host'), ['host_create_tap'], ['host_created', {}, 'NWNWQ'], ['game_start', {}, 'NWNWQ', null, 6 * MIN], ['first_call', {}, 'NWNWQ', null, 6.5 * MIN], pv('game_live', 'NWNWQ').concat([20 * MIN])]);
  seq(E, 'sE2-00000001', now - 18.5 * MIN, [['session_start', ss(E)], pv('game_invite', 'NWNWQ'), ['join_tap', {}, 'NWNWQ'], ['join_ok', {}, 'NWNWQ'], pv('game_live', 'NWNWQ').concat([17.5 * MIN])]);

  // ------------------------------------------------------------------ "Notify me" numbers
  const phones = new Map([['9810000001', at(0, 10, 0)], ['9810000002', at(-1, 12, 0)], ['9810000003', at(-5, 12, 0)], ['9810000004', at(-7, 12, 0)]]);

  const coreEvents = ins.events.length;

  // ------------------------------------------------------------------ bulk (days -15 … -85), deterministic
  let s = 20261121;
  const rnd = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pickOf = (a) => a[Math.floor(rnd() * a.length)];
  const PLACES = [geo('1.1.1.', 'IN', 'MH', 'Mumbai'), geo('1.1.2.', 'IN', 'MH', 'Pune'), geo('1.1.3.', 'IN', 'DL', 'Delhi'), geo('1.1.4.', 'IN', 'KA', 'Bengaluru'), geo('1.1.5.', 'IN', 'GJ', 'Ahmedabad'), geo('1.1.6.', 'IN', 'RJ', 'Jaipur'),
    geo('1.1.7.', 'IN', 'TN', 'Chennai'), geo('1.1.8.', 'AE', 'DU', 'Dubai'), geo('1.1.9.', 'US', 'CA', 'San Jose'), geo('1.2.1.', 'GB', 'ENG', 'London'), geo(null, null, null, null), geo('1.2.2.', 'IN', 'WB', 'Kolkata')];
  const UAS = [ANDROID, ANDROID, ANDROID, IOS_WA, SAMSUNG, WIN, IPAD, MAC, FF, AND_WA];
  const SOURCES = ['direct', 'direct', 'whatsapp', 'whatsapp', 'google', 'facebook', 'instagram', 'my-campaign'];
  const NAMES = ['Anita', 'Rahul', 'Zoya', 'Imran', 'Kavita', 'José', '李雷', 'राजेश कुमार', 'Mary-Ann O\'Brien', 'Dev "DJ" Shah', 'A, B & C', '😀 Emoji Fan', 'WWWWWWWWWWWWWWWWWWWWWWWW', '+91 Caller', '-Minus', '@handle', '=1+1'];
  const GNAMES = ['Tambola Night', 'Family Housie', 'Kitty Party 🎉', 'दिवाली तंबोला', 'Office "Fun" Friday', 'Sunday, with love', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', 'New Year\'s Eve', '@everyone play', '+bonus round', 'Ünïcödé Gämé'];
  const RULES = [['early5', 'Early Five'], ['top', 'Top Line'], ['middle', 'Middle Line'], ['bottom', 'Bottom Line'], ['corners', 'Four Corners'], ['full', 'Full House']];
  const bulk = [];
  for (let i = 0; i < 60; i++) {
    const pl = PLACES[i % PLACES.length];
    bulk.push({ key: 'K' + i, hash: crypto.createHash('sha256').update('bulk' + i).digest('hex'), name: NAMES[i % NAMES.length], ...pl, ip: pl.ip ? pl.ip + (i + 10) : null, ...UAS[i % UAS.length], source: SOURCES[i % SOURCES.length], sw: [360, 390, 412, 768, 1366, 1920][i % 6], lang: 'en-IN', utm: [null, null, null], ref: null, landing: '/' });
  }
  bulk.push(H1, H2);
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const codeOf = (i) => { let c = 'Q', n = i; for (let k = 0; k < 4; k++) { c += ALPHA[n % 31]; n = Math.floor(n / 31); } return c; };
  for (let i = 0; i < 320; i++) {
    const day = -15 - Math.floor(rnd() * 71);
    const created = at(day, Math.floor(rnd() * 24), Math.floor(rnd() * 60));
    const host = i === 0 ? H1 : bulk[Math.floor(rnd() * 60)];
    const nSeats = i === 0 ? 1 : Math.floor(rnd() * rnd() * 14);
    const others = [];
    const seen = new Set([host.hash]);
    for (let k = 0; k < nSeats; k++) { const p = i === 0 ? H2 : bulk[Math.floor(rnd() * 60)]; if (!seen.has(p.hash)) { seen.add(p.hash); others.push(p); } }
    const r = rnd();
    const status = r < 0.6 && others.length > 0 ? 'done' : r < 0.75 && others.length > 0 ? 'live' : 'lobby';
    const price = rnd() < 0.4 ? pickOf([10, 20, 50, 100]) : 0;
    const hostPlays = rnd() < 0.8;
    const nPlayers = others.length + (hostPlays ? 1 : 0);
    const rules = RULES.filter(() => rnd() < 0.5); if (!rules.length || !rules.some((x) => x[0] === 'full')) rules.push(RULES[5]);
    const startedAt = status === 'lobby' ? null : created + (2 + Math.floor(rnd() * 10)) * MIN;
    const lenMin = 3 + Math.floor(rnd() * 70);
    const finishedAt = status === 'done' ? startedAt + lenMin * MIN : null;
    const pot = price * nPlayers;
    const seats = others.map((p, k) => [p, p.name, created + (k + 1) * 30e3]);
    const pids = Array.from({ length: nPlayers }, (_, k) => 'p' + (k + 1));
    const prizes = rules.map(([rule, label], k) => {
      const amount = pot ? Math.floor(pot / rules.length) + (k === rules.length - 1 ? pot % rules.length : 0) : 0;
      if (status === 'done' && nPlayers > 0) { const w = Math.floor(rnd() * nPlayers); return prize(rule, label, amount, [pids[w], 'Winner ' + w], finishedAt - (rules.length - k) * 1000); }
      return prize(rule, label, status === 'lobby' ? 0 : amount);
    });
    const rounds = status === 'done' && rnd() < 0.2 ? 2 : 1;
    const history = rounds === 2 ? [{ round: 1, startedAt: startedAt - 40 * MIN, finishedAt: startedAt - 10 * MIN, called: 40 + Math.floor(rnd() * 50), players: nPlayers, prizes: prizes.map((p) => ({ ...p })) }] : undefined;
    const code = codeOf(i);
    game({ code, name: GNAMES[i % GNAMES.length], host, hostPlays, price, status, round: rounds, created, updated: finishedAt ?? startedAt ?? created,
      seats, called: status === 'done' ? 30 + Math.floor(rnd() * 60) : status === 'live' ? Math.floor(rnd() * 40) : 0, startedAt, finishedAt, prizes, history });
    const hs = 'bh' + String(i).padStart(8, '0');
    seq(host, hs, created - 2 * MIN, [['session_start', ss(host)], pv('home'), ['cta_host'], pv('host'), ['host_create_tap'], ['host_created', {}, code], pv('game_lobby', code), ...(rnd() < 0.5 ? [['share_whatsapp', {}, code]] : []), ...(startedAt ? [['game_start', {}, code, null, startedAt - created + 2 * MIN]] : []), ...(rnd() < 0.5 ? [['session_end', { ms: Math.floor(rnd() * 3600e3) }, null, null, 80 * MIN]] : [])]);
    others.forEach((p, k) => seq(p, 'bj' + String(i).padStart(5, '0') + 'x' + String(k).padStart(3, '0'), created + (k + 1) * 30e3 - 15e3, [['session_start', ss(p), null, null, 0], pv('game_invite', code).concat([5e3]), ['join_tap', {}, code, null, 10e3], ['join_ok', {}, code, null, 15e3]]));
  }
  for (let i = 0; i < 40; i++) phones.set(String(9700000000 + i), at(-15 - i, 12, 0));

  return { data: { games, phones, insights: ins }, meta: { now, D0, coreEvents, people: Object.fromEntries(Object.entries(P).map(([k, p]) => [k, p.hash.slice(0, 8)])) } };
}

// Hand-computed BEFORE looking at the admin (see the dataset design in docs/qa/TEST_PLAN_ADMIN.md, "Seeded dataset").
const EXPECT = {
  '7d': { created: 7, started: 4, finished: 2, completion: '50%', players: 13, devicesPlayed: 7, avgPlayers: '1.9', avgLength: '20m 00s', finishedRounds: 3, prizeMoney: 1420, ticketMoney: 220, pricedGames: 3, notify: 3,
    status: { lobby: 1, live: 1, done: 2, expired: 3 }, priced: 3, abandoned: 3 },
  yesterday: { created: 2, started: 1, finished: 1, players: 5, notify: 1 },
  today: { created: 2, started: 1, finished: 0, players: 2, notify: 1 },
  prev7d: { created: 1, players: 2 },
  geo7d: { country: { IN: { games: 5, players: 9, devices: 3 }, BR: { games: 1, players: 2, devices: 1 }, '': { games: 0, players: 1, devices: 1 }, US: { games: 0, players: 1, devices: 1 }, GB: { games: 1, players: 0, devices: 1 } },
    region: { 'IN-MH': { games: 4, players: 5, devices: 2 }, 'IN-DL': { games: 1, players: 4, devices: 1 } } },
};

module.exports = { build, EXPECT, XSS_SCRIPT, XSS_IMG, CSV_FORMULA, hash };
