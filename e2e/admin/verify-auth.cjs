const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { mk, Results, assert, eq, RESULTS, PASSWORD } = require('./lib.cjs');
const R = new Results(RESULTS);
const APP = path.resolve(__dirname, '../../src/app');
const B = 'http://localhost:8603', OFF = 'http://localhost:8601', OTHER = 'http://localhost:8602';
let ipN = 1; const ip = () => ({ 'x-forwarded-for': `203.0.113.${ipN++}` });
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const apiRoutes = walk(APP + '/api/admin').filter((f) => f.endsWith('route.ts')).map((f) => ({ path: '/api/admin/' + path.relative(APP + '/api/admin', path.dirname(f)).replace('[code]', 'DWAAA'), methods: [...fs.readFileSync(f, 'utf8').matchAll(/export async function (GET|POST|PUT|DELETE|PATCH)/g)].map((m) => m[1]) }));
const pages = walk(APP + '/admin').filter((f) => f.endsWith('page.tsx')).map((f) => '/admin/' + path.relative(APP + '/admin', path.dirname(f)).replace(/\(panel\)\/?/, '').replace('[code]', 'DWAAA').replace('[device]', 'aaaa0001')).map((p) => p.replace(/\/$/, '') || '/admin');
const forge = (exp, password = PASSWORD, secret = 'letsplaytambola-admin-session-v1') => {
  const key = crypto.createHash('sha256').update(`${password}:${secret}`, 'utf8').digest();
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', key).update(payload).digest('base64url')}`;
};
(async () => {
  const api = mk(B);
  await R.run('AUTH-01', 'Wrong password / wrong email / both: 401 with the same generic message, no cookie', async () => {
    const out = [];
    for (const [e, p] of [['admin@example.com', 'nope'], ['x@example.com', PASSWORD], ['x@example.com', 'nope'], ['', ''], [null, null], [{ $ne: 1 }, ['a']]]) {
      const r = await mk(B).login(e, p, ip());
      out.push([r.status, r.body && r.body.error, !!r.setCookie]);
    }
    for (const o of out) eq(o, [401, 'Email or password is not right', false], 'answer');
  });
  await R.run('AUTH-02', 'Email is case-insensitive and trimmed; the password is exact (no trim, case-sensitive)', async () => {
    eq((await mk(B).login('  ADMIN@Example.COM ', PASSWORD, ip())).status, 200, 'upper-case + spaces');
    eq((await mk(B).login('admin@example.com', PASSWORD + ' ', ip())).status, 401, 'password + space');
    eq((await mk(B).login('admin@example.com', PASSWORD.toUpperCase(), ip())).status, 401, 'password upper-case');
  });
  await R.run('AUTH-03', 'Very long inputs and SQL / HTML injection strings are refused cleanly (401, JSON, nothing reflected)', async () => {
    for (const s of ["' OR '1'='1", "admin@example.com'--", '<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', 'a'.repeat(1500), 'a'.repeat(100000), '\u0000', '😀'.repeat(300)]) {
      const r = await mk(B).login(s, s, ip());
      assert(r.status === 401 && r.body.error === 'Email or password is not right', `status ${r.status} for ${s.slice(0, 20)}`);
      assert(!JSON.stringify(r.body).includes('script') && !JSON.stringify(r.body).includes('OR'), 'reflected');
    }
    const r = await fetch(B + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin: B, ...ip() }, body: '{not json' });
    eq(r.status, 401, 'malformed JSON');
  });
  await R.run('AUTH-04', 'Brute force: 5 failures from one address, then the 6th try — even with the right password — is 429; another address is not affected', async () => {
    const h = ip();
    for (let i = 0; i < 5; i++) eq((await mk(B).login('admin@example.com', 'bad' + i, h)).status, 401, 'try ' + (i + 1));
    const r6 = await mk(B).login('admin@example.com', PASSWORD, h);
    eq([r6.status, r6.body.error], [429, 'Too many tries — please wait 15 minutes and try again'], '6th');
    eq((await mk(B).login('admin@example.com', PASSWORD, ip())).status, 200, 'other address');
    const ok = ip();
    for (let i = 0; i < 8; i++) eq((await mk(B).login('admin@example.com', PASSWORD, ok)).status, 200, 'successes are not counted');
  });
  await api.login('admin@example.com', PASSWORD, ip());
  const goodCookie = api.cookie;
  await R.run('AUTH-05', 'Session token: forged-clock expiry, far-future expiry, tampered payload, wrong key, garbage and oversized cookies are all refused (pages redirect, API 401)', async () => {
    const now = Date.now();
    const cases = {
      valid_control: [forge(now + 3600e3), true],
      expired_1s_ago: [forge(now - 1000), false],
      expired_12h_ago: [forge(now - 12 * 3600e3), false],
      far_future: [forge(now + 13 * 3600e3), false],
      exp_string: [forge(String(now + 3600e3)), false],
      tampered_payload: [Buffer.from(JSON.stringify({ exp: now + 9 * 3600e3 })).toString('base64url') + '.' + goodCookie.split('.')[1], false],
      wrong_password_key: [forge(now + 3600e3, 'guess'), false],
      truncated_sig: [goodCookie.split('=')[1].slice(0, -3), false],
      no_dot: ['abcdef', false], empty: ['', false], two_dots: [goodCookie.split('=')[1] + '.x', false], huge: ['a'.repeat(600) + '.' + 'b'.repeat(43), false],
      alg_none_like: [Buffer.from(JSON.stringify({ exp: now + 3600e3 })).toString('base64url') + '.', false],
    };
    for (const [name, [tok, ok]] of Object.entries(cases)) {
      const a = await api.get('/api/admin/games', { cookie: 'lpt_admin=' + tok });
      eq(a.status, ok ? 200 : 401, name + ' API');
      const p = await api.get('/admin/games', { cookie: 'lpt_admin=' + tok });
      eq(p.status, ok ? 200 : 307, name + ' page');
      if (!ok) eq(p.headers.get('location').replace(/^https?:\/\/[^/]+/, ''), '/admin/login', name + ' location');
    }
  });
  await R.run('AUTH-06', 'Session cookie flags: HttpOnly, SameSite=Lax, Secure (production build), Path=/, Max-Age 12 h', async () => {
    const r = await mk(B).login('admin@example.com', PASSWORD, ip());
    const c = r.setCookie.toLowerCase();
    for (const f of ['httponly', 'samesite=lax', 'secure', 'path=/', 'max-age=43200']) assert(c.includes(f), 'missing ' + f + ' in ' + r.setCookie);
    const exp = JSON.parse(Buffer.from(r.setCookie.split('=')[1].split('.')[0], 'base64url').toString()).exp;
    assert(Math.abs(exp - Date.now() - 12 * 3600e3) < 5000, 'exp is 12 h ahead');
  });
  await R.run('AUTH-07', 'Sign out clears the cookie AND the signed-out session can no longer be replayed', async () => {
    const a = mk(B); await a.login('admin@example.com', PASSWORD, ip());
    const old = a.cookie;
    eq((await a.get('/api/admin/games')).status, 200, 'before');
    const out = await a.post('/api/admin/logout', {});
    eq(out.status, 200, 'logout');
    assert(/lpt_admin=;/.test(out.headers.get('set-cookie')) && /max-age=0/i.test(out.headers.get('set-cookie')), 'cookie cleared: ' + out.headers.get('set-cookie'));
    eq((await a.get('/api/admin/games', { cookie: old })).status, 401, 'replaying the old cookie after sign-out (API)');
    eq((await a.get('/admin', { cookie: old })).status, 307, 'replaying the old cookie after sign-out (page)');
    eq((await api.get('/api/admin/games')).status, 200, 'another signed-in session is not affected');
  });
  await R.run('AUTH-08', 'Changing ADMIN_PASSWORD signs everyone out (a cookie from the old password is refused by a server with a new one)', async () => {
    eq((await mk(OTHER).get('/api/admin/games', { cookie: goodCookie })).status, 401, 'old cookie on the server with the new password');
    eq((await mk(OTHER).get('/admin', { cookie: goodCookie })).status, 307, 'page');
    eq((await mk(OTHER).login('admin@example.com', 'another-password-456', ip())).status, 200, 'new password works');
  });
  await R.run('AUTH-09', `Admin switched off (no env): every admin page (${pages.length}) says "not set up" and every admin API (${apiRoutes.length} routes) answers 404`, async () => {
    for (const p of [...pages]) {
      const r = await mk(OFF).get(p, { cookie: goodCookie });
      assert(r.status === 200 || r.status === 404, p + ' status ' + r.status);
      assert(/Admin is not set up/i.test(r.text), p + ' has no "not set up" text');
      assert(!/Diwali|Sign in to|Erase this device/i.test(r.text), p + ' leaks content');
    }
    for (const rt of apiRoutes) for (const m of rt.methods) {
      const r = await fetch(OFF + rt.path, { method: m, headers: { 'content-type': 'application/json', origin: OFF, cookie: goodCookie }, ...(m === 'POST' ? { body: '{}' } : {}) });
      eq(r.status, 404, `${m} ${rt.path}`);
    }
  });
  await R.run('AUTH-10', `Without a cookie every admin API route (${apiRoutes.map((r) => r.methods.join('/') + ' ' + r.path).join(', ')}) answers 401 — except sign-in`, async () => {
    assert(apiRoutes.length >= 10, 'route enumeration found only ' + apiRoutes.length);
    for (const rt of apiRoutes) for (const m of rt.methods) {
      if (rt.path.endsWith('/login')) continue;
      const r = await fetch(B + rt.path, { method: m, headers: { 'content-type': 'application/json', origin: B }, ...(m === 'POST' ? { body: '{"device":"aaaa0001"}' } : {}) });
      eq(r.status, 401, `${m} ${rt.path}`);
      const t = await r.text();
      assert(!/aaaa0001|Diwali|9810/.test(t), 'data in a 401 body');
      assert(/no-store/.test(r.headers.get('cache-control') || ''), 'no-store on 401 ' + rt.path);
    }
  });
  await R.run('AUTH-11', `Without a cookie every admin page (${pages.length}: ${pages.join(' ')}) redirects (307) to /admin/login and sends no content`, async () => {
    assert(pages.length >= 15, 'page enumeration found only ' + pages.length);
    for (const p of pages) {
      if (p === '/admin/login') continue;
      const r = await api.get(p, { noCookie: true });
      eq(r.status, 307, p);
      assert(r.headers.get('location').endsWith('/admin/login'), p + ' location');
      assert(r.text.length < 200, p + ' body');
    }
  });
  await R.run('AUTH-12', 'CSRF: every state-changing admin API refuses a missing Origin, a foreign Origin, Origin "null" and a non-JSON body — even with a valid session', async () => {
    const posts = apiRoutes.filter((r) => r.methods.includes('POST'));
    assert(posts.length >= 4, 'POST routes: ' + posts.length);
    for (const rt of posts) {
      const body = rt.path.endsWith('/login') ? JSON.stringify({ email: 'admin@example.com', password: PASSWORD }) : JSON.stringify({ device: 'ffffffff' });
      const call = (headers) => fetch(B + rt.path, { method: 'POST', headers: { cookie: goodCookie, ...headers }, body });
      eq((await call({ 'content-type': 'application/json' })).status, 403, rt.path + ' no Origin');
      eq((await call({ 'content-type': 'application/json', origin: 'https://evil.example' })).status, 403, rt.path + ' foreign Origin');
      eq((await call({ 'content-type': 'application/json', origin: 'null' })).status, 403, rt.path + ' Origin null');
      eq((await call({ 'content-type': 'application/json', origin: B.replace('localhost', 'localhost.evil.example') })).status, 403, rt.path + ' look-alike Origin');
      eq((await call({ 'content-type': 'text/plain', origin: B })).status, 415, rt.path + ' text/plain');
      eq((await call({ 'content-type': 'application/x-www-form-urlencoded', origin: B })).status, 415, rt.path + ' form');
      eq((await call({ origin: B })).status, 415, rt.path + ' no content type');
    }
    eq((await api.get('/api/admin/games')).status, 200, 'the session survived (logout was refused each time)');
    // state-changing via GET must not exist
    for (const rt of posts) { const r = await fetch(B + rt.path, { headers: { cookie: goodCookie } }); assert(r.status === 405 || r.status === 404, rt.path + ' GET → ' + r.status); }
  });
  await R.run('AUTH-13', 'Never cached, never indexed: admin pages and APIs send no-store + X-Robots-Tag noindex; pages carry a robots meta; robots.txt disallows /admin; the sitemap has no admin URL', async () => {
    for (const p of ['/admin', '/admin/games', '/admin/login', '/api/admin/games', '/api/admin/games.csv', '/api/admin/players.csv', '/api/admin/events.csv', '/api/admin/notify.csv', '/api/admin/games/XXXXX']) {
      const r = await api.get(p, p === '/admin/login' ? { noCookie: true } : {});
      assert(/no-store/.test(r.headers.get('cache-control') || ''), p + ' cache-control: ' + r.headers.get('cache-control'));
      assert(/noindex/.test(r.headers.get('x-robots-tag') || ''), p + ' x-robots-tag: ' + r.headers.get('x-robots-tag'));
      if (p.startsWith('/admin')) assert(/<meta name="robots" content="noindex, nofollow/.test(r.text), p + ' robots meta');
    }
    const robots = (await api.get('/robots.txt')).text;
    assert(/Disallow: \/admin/.test(robots), 'robots.txt');
    const sm = (await api.get('/sitemap.xml')).text;
    assert(sm.includes('<loc>') && !/admin/.test(sm), 'sitemap');
    const home = (await api.get('/', { noCookie: true })).text;
    assert(!/href="\/admin/.test(home), 'home links to /admin');
  });
  await R.run('AUTH-14', 'Sign-in page: signed-in visit goes to /admin; wrong methods are refused; failure answers take ≥ 400 ms whatever was wrong', async () => {
    eq((await api.get('/admin/login')).status, 307, 'signed in → redirect');
    eq((await fetch(B + '/api/admin/login')).status, 405, 'GET login');
    const time = async (e, p) => { const t = Date.now(); await mk(B).login(e, p, ip()); return Date.now() - t; };
    const a = await time('admin@example.com', 'wrong'), b = await time('nobody@example.com', 'wrong');
    assert(a >= 395 && b >= 395 && Math.abs(a - b) < 150, `timings ${a} ${b}`);
  });
  await R.run('AUTH-15', 'Security headers on admin responses: X-Frame-Options SAMEORIGIN, frame-ancestors self, nosniff', async () => {
    const r = await api.get('/admin');
    eq([r.headers.get('x-frame-options'), r.headers.get('content-security-policy'), r.headers.get('x-content-type-options')], ['SAMEORIGIN', "frame-ancestors 'self'", 'nosniff'], 'headers');
  });
})();
