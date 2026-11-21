// Playwright helpers: a signed-in admin browser context, and a structured scrape of an admin page.
const { chromium } = require('playwright');
const { EMAIL, PASSWORD } = require('./lib.cjs');
async function adminContext(browser, base, opts = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const r = await context.request.post(base + '/api/admin/login', { headers: { 'content-type': 'application/json', origin: base }, data: { email: EMAIL, password: PASSWORD } });
  if (!r.ok()) throw new Error('login failed ' + r.status());
  return context;
}
async function scrape(page) {
  return page.evaluate(() => {
    const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : '');
    const tableOf = (t) => ({ caption: txt(t.querySelector('caption')), head: [...t.querySelectorAll('thead th')].map(txt), rows: [...t.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map(txt)) });
    const kpis = {};
    for (const k of document.querySelectorAll('[class*="_kpi "], [class$="_kpi"]')) {
      const label = txt(k.querySelector('[class*="kpiLabel"]'));
      kpis[label] = { value: txt(k.querySelector('[class*="kpiValue"]')), delta: txt(k.querySelector('[class*="_delta"]')), foot: txt(k.querySelector('[class*="kpiFoot"]')) };
    }
    const panels = {};
    for (const s of document.querySelectorAll('section[aria-labelledby]')) {
      const title = txt(s.querySelector('h2'));
      const t = s.querySelector('table');
      panels[title] = { sub: txt(s.querySelector('[class*="panelSub"]')), table: t ? tableOf(t) : null, text: txt(s).slice(0, 4000) };
    }
    const tables = [...document.querySelectorAll('table')].filter((t) => !t.closest('section[aria-labelledby]')).map(tableOf);
    const facts = {};
    for (const f of document.querySelectorAll('[class*="_fact"]')) { const dt = f.querySelector('dt'); if (dt) facts[txt(dt)] = txt(f.querySelector('dd')); }
    return { url: location.pathname + location.search, title: document.title, h1: txt(document.querySelector('h1')), kpis, panels, tables, facts, xss: window.__xss ?? null,
      pager: txt(document.querySelector('nav[aria-label="Pages"]')), text: txt(document.querySelector('main') || document.body), scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
  });
}
/** Visit and scrape; collects console errors, page errors, dialogs and the requests the page made. */
async function visit(context, url) {
  const page = await context.newPage();
  const errors = [], requests = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => { errors.push('DIALOG: ' + d.message()); d.dismiss().catch(() => {}); });
  page.on('request', (r) => requests.push(r.method() + ' ' + r.url()));
  const t0 = Date.now();
  const resp = await page.goto(url, { waitUntil: 'networkidle' });
  const data = await scrape(page);
  return { page, status: resp && resp.status(), ms: Date.now() - t0, errors, requests, ...data };
}
module.exports = { chromium, adminContext, scrape, visit };
