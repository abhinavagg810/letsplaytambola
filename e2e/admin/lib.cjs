const fs = require('fs');
const Q = __dirname;
const OUT = process.env.QA_OUT || __dirname + '/.out';
fs.mkdirSync(OUT, { recursive: true });
const EMAIL = 'admin@example.com', PASSWORD = 'test-password-123';
function mk(base) {
  const origin = base;
  const api = {
    base, cookie: '',
    async login(email = EMAIL, password = PASSWORD, headers = {}) {
      const r = await fetch(base + '/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify({ email, password }) });
      const sc = r.headers.get('set-cookie');
      if (r.ok && sc) api.cookie = sc.split(';')[0];
      return { status: r.status, setCookie: sc, body: await r.json().catch(() => null) };
    },
    async get(path, opts = {}) {
      const t0 = performance.now();
      const r = await fetch(base + path, { redirect: 'manual', ...opts, headers: { ...(opts.noCookie ? {} : { cookie: opts.cookie ?? api.cookie }), ...(opts.headers || {}) } });
      const text = await r.text();
      return { status: r.status, headers: r.headers, text, ms: performance.now() - t0, json() { try { return JSON.parse(text); } catch { return null; } } };
    },
    async post(path, body, opts = {}) {
      const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', origin, ...(opts.noCookie ? {} : { cookie: opts.cookie ?? api.cookie }), ...(opts.headers || {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
      const text = await r.text();
      return { status: r.status, headers: r.headers, text, json() { try { return JSON.parse(text); } catch { return null; } } };
    },
  };
  return api;
}
/** minimal RFC-4180 CSV parser */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c === '\r') { /* skip */ }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
class Results {
  constructor(file) { this.file = file; this.list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : []; }
  rec(id, title, ok, detail = '') {
    this.list = this.list.filter((r) => r.id !== id);
    this.list.push({ id, title, status: ok === true ? 'pass' : ok === false ? 'fail' : ok, detail: String(detail).slice(0, 600), at: new Date().toISOString() });
    console.log(`${ok === true ? 'PASS' : ok === false ? 'FAIL' : String(ok).toUpperCase()} ${id} ${title}${detail && ok !== true ? ' — ' + String(detail).slice(0, 400) : ''}`);
    fs.writeFileSync(this.file, JSON.stringify(this.list, null, 1));
  }
  async run(id, title, fn) {
    try { const d = await fn(); this.rec(id, title, true, d || ''); } catch (e) { this.rec(id, title, false, e && e.message ? e.message : e); }
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const eq = (a, b, msg) => { if (JSON.stringify(canon(a)) !== JSON.stringify(canon(b))) throw new Error(`${msg}: got ${JSON.stringify(a)} expected ${JSON.stringify(b)}`); };
module.exports = { mk, parseCsv, Results, assert, eq, Q, EMAIL, PASSWORD, RESULTS: OUT + '/results.json', OUT };
