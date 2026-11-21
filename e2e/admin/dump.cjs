const { OUT } = require('./lib.cjs');
const fs = require('fs');
const { chromium, adminContext, visit } = require('./pw.cjs');
const BASE = process.env.BASE || 'http://localhost:8600';
const OUTFILE = OUT + '/dump.json';
const PAGES = ['', '/acquisition', '/funnels', '/geography', '/technology', '/engagement', '/retention', '/games', '/players', '/events', '/notify', '/privacy'];
const RANGES = ['range=today', 'range=yesterday', '', 'range=30d', 'range=90d', 'cmp=1', 'range=today&cmp=1', 'range=yesterday&cmp=1'];
(async () => {
  const browser = await chromium.launch();
  const ctx = await adminContext(browser, BASE);
  const out = {};
  for (const p of PAGES) for (const r of RANGES) {
    if (r.includes('cmp') && p !== '') continue;
    const url = `${BASE}/admin${p}${r ? '?' + r : ''}`;
    const v = await visit(ctx, url);
    const { page, ...rest } = v;
    out[`${p || '/'}|${r || '7d'}`] = rest;
    await page.close();
  }
  fs.writeFileSync(OUTFILE, JSON.stringify(out));
  const errs = Object.entries(out).filter(([, v]) => v.errors.length || v.xss !== null || v.status !== 200);
  console.log('pages', Object.keys(out).length, 'with problems', errs.length, errs.slice(0, 5).map(([k, v]) => [k, v.status, v.xss, v.errors.slice(0, 2)]));
  await browser.close();
})();
