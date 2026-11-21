const { OUT } = require('./lib.cjs');
const fs = require('fs');
const { chromium, adminContext, scrape } = require('./pw.cjs');
const { Results, assert, eq, RESULTS } = require('./lib.cjs');
const R = new Results(RESULTS);
const S = process.env.BASE || 'http://localhost:8600';
const SH = OUT + '/';
const PAGES = { overview: '/admin?cmp=1', acquisition: '/admin/acquisition?range=90d', funnels: '/admin/funnels', geography: '/admin/geography?range=90d', technology: '/admin/technology?range=90d', engagement: '/admin/engagement?range=90d', retention: '/admin/retention', plays: '/admin/games?range=90d', play: '/admin/games/MXRND', players: '/admin/players', player: '/admin/players/aaaa0001', events: '/admin/events?range=90d', notify: '/admin/notify', privacy: '/admin/privacy' };
const WIDTHS = [1920, 1440, 1280, 1024, 768, 390, 360];
(async () => {
  const browser = await chromium.launch();
  const problems = [];
  for (const w of WIDTHS) {
    const ctx = await adminContext(browser, S, { viewport: { width: w, height: w < 500 ? 780 : 900 }, hasTouch: w < 500, isMobile: w < 500 });
    const page = await ctx.newPage();
    const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text())); page.on('pageerror', (e) => errs.push(e.message));
    for (const [name, url] of Object.entries(PAGES)) {
      await page.goto(S + url, { waitUntil: 'networkidle' });
      const m = await page.evaluate(() => {
        const de = document.documentElement;
        const small = [...document.querySelectorAll('main *')].filter((e) => e.children.length === 0 && e.textContent.trim() && e.getClientRects().length && parseFloat(getComputedStyle(e).fontSize) < 11).length;
        const clipped = [...document.querySelectorAll('main h1, main h2, [class*="kpiValue"], [class*="kpiLabel"]')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.textContent.slice(0, 30));
        const taps = [...document.querySelectorAll('main a, main button, main select, main input, header a, header button')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 24); }).length;
        return { sw: de.scrollWidth, cw: de.clientWidth, small, clipped, taps };
      });
      if (m.sw > m.cw + 1) problems.push(`${w} ${name}: page scrolls sideways (${m.sw} > ${m.cw})`);
      if (m.clipped.length) problems.push(`${w} ${name}: clipped ${m.clipped.join(' | ')}`);
      if (m.small) problems.push(`${w} ${name}: ${m.small} texts under 11px`);
      if (w < 500 && m.taps) problems.push(`${w} ${name}: ${m.taps} controls under 24px tall`);
      if ([1440, 390].includes(w) || (w === 1024 && ['overview', 'plays'].includes(name)) || (w === 768 && name === 'overview') || (w === 1920 && name === 'overview') || (w === 360 && name === 'plays')) await page.screenshot({ path: `${SH}${w}-${name}.png`, fullPage: true });
    }
    if (errs.length) problems.push(`${w}: console ${errs.slice(0, 3).join(' | ')}`);
    await ctx.close();
  }
  fs.writeFileSync(OUT + '/ui-problems.json', JSON.stringify(problems, null, 1));
  console.log(problems.join('\n') || 'no layout problems found by the automatic checks');
  await browser.close();
})();
