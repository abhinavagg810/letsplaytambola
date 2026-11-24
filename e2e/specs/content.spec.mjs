// The content pages added for the AdSense review: /about, /contact (+ POST /api/contact), /how-to-play, /ways-to-win,
// /tambola-number-calls — server-rendered text, metadata, links, the contact form.
import { BASE, check, equal, go, hydrated, until } from '../lib.mjs';

const PAGES = ['/about', '/contact', '/how-to-play', '/ways-to-win', '/tambola-number-calls'];
const raw = async (p) => {
  const res = await fetch(BASE + p);
  return { status: res.status, html: await res.text() };
};
const jsonLdTypes = (html) => [...html.matchAll(/<script type="application\/ld\+json">([^<]*)<\/script>/g)].map((m) => JSON.parse(m[1])['@type']);

const cases = [
  {
    id: 'CNT-01', area: 'Content', priority: 'P0', type: 'functional',
    title: 'The five content pages are server-rendered with real text, metadata and structured data, and no ads',
    steps: 'GET each page without a browser; read the raw HTML', expected: '200; one h1; the main text is in the HTML; unique title and description; canonical; og:image; BreadcrumbList; Organization on /about, FAQPage on /how-to-play; no ad slot',
    run: async () => {
      const titles = new Set();
      const must = { '/about': [/Delhi, India/, /the Letsplaytambola team/], '/contact': [/Send us a message/, /Remove my data/], '/how-to-play': [/fifteen numbers/i, /Not yet — keep playing/], '/ways-to-win': [/Laddoo/, /Devrani/, /Centre number of the middle line/], '/tambola-number-calls': [/Gandhi&#x27;s breakfast|Gandhi's breakfast/, /Top of the house/, /4 and 2, 42/] };
      for (const p of PAGES) {
        const { status, html } = await raw(p);
        equal(status, 200, `${p} status`);
        equal((html.match(/<h1[\s>]/g) || []).length, 1, `${p} h1 count`);
        for (const re of must[p]) check(re.test(html), `${p}: raw HTML lacks ${re}`);
        const title = /<title>([^<]*)<\/title>/.exec(html)?.[1];
        check(title && !titles.has(title), `${p}: title "${title}" missing or repeated`);
        titles.add(title);
        check(/<meta name="description" content="[^"]{60,}"/.test(html), `${p}: description`);
        check(html.includes(`<link rel="canonical" href="`) && html.includes(`${p}"/>`), `${p}: canonical`);
        check(/property="og:image"/.test(html), `${p}: og:image`);
        const types = jsonLdTypes(html);
        check(types.includes('BreadcrumbList'), `${p}: BreadcrumbList`);
        if (p === '/about') check(types.includes('Organization'), 'Organization on /about');
        if (p === '/how-to-play') check(types.includes('FAQPage'), 'FAQPage on /how-to-play');
        check(!/adsbygoogle|data-ad-slot/.test(html), `${p}: has an ad slot`);
      }
      const home = await raw('/');
      check(jsonLdTypes(home.html).includes('WebSite'), 'WebSite JSON-LD on /');
      const sitemap = await raw('/sitemap.xml');
      for (const p of PAGES) check(sitemap.html.includes(`${p}</loc>`), `sitemap lists ${p}`);
    },
  },
  {
    id: 'CNT-02', area: 'Content', priority: 'P0', type: 'functional',
    title: 'Every internal link on the home page and the content pages answers 200',
    steps: 'Collect every same-site href on /, the five pages, /privacy and /terms; GET each (without the #hash)', expected: 'All 200',
    run: async (t) => {
      const seen = new Set();
      for (const p of ['/', ...PAGES, '/privacy', '/terms']) {
        const { html } = await raw(p);
        for (const m of html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) if (!m[1].startsWith('/_next') && !/\.(png|ico|webmanifest|css|js)$/.test(m[1].split('?')[0])) seen.add(m[1]);
      }
      const bad = [];
      for (const href of seen) {
        const res = await fetch(BASE + href, { redirect: 'manual' });
        if (res.status !== 200) bad.push(`${href} → ${res.status}`);
      }
      equal(bad, [], 'broken links');
      t.note(`${seen.size} internal links checked`);
    },
  },
  {
    id: 'CNT-03', area: 'Content', priority: 'P0', type: 'functional',
    title: 'Contact form: errors in place, then a message is sent and acknowledged',
    steps: 'On a phone open /contact?topic=feedback; tap Send with nothing typed; type a message and a bad reply-to; fix it; Send', expected: 'Topic preselected; "at least 10 characters" and reply-to errors next to the fields; then "Thank you — your message has reached us."',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/contact?topic=feedback');
      await hydrated(page);
      await until(async () => (await page.locator('select[name="topic"]').inputValue()) === 'feedback', 'topic from the address');
      await page.getByRole('button', { name: 'Send message' }).click();
      check(await page.getByText('at least 10 characters', { exact: false }).first().isVisible(), 'message error shown');
      await page.locator('textarea[name="message"]').fill('A lovely game, thank you from all of us!');
      await page.locator('input[name="replyTo"]').fill('not an address');
      await page.getByRole('button', { name: 'Send message' }).click();
      check(await page.locator('#replyTo-error').isVisible(), 'reply-to error shown');
      await page.locator('input[name="replyTo"]').fill('kamla@example.com');
      await page.getByRole('button', { name: 'Send message' }).click();
      await page.getByText('Thank you — your message has reached us.').waitFor({ timeout: 8000 });
    },
  },
  {
    id: 'CNT-04', area: 'Content', priority: 'P1', type: 'security',
    title: 'POST /api/contact refuses other sites, non-JSON and junk, and pretends success to bots',
    steps: 'POST with a foreign Origin, as text/plain, with a hostile invalid body, and with the honeypot filled', expected: '403, 415, 400 without echoing the input, 200 {ok:true}',
    run: async () => {
      const send = (body, headers = {}) => fetch(BASE + '/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', origin: BASE, 'x-forwarded-for': `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body) });
      const good = { topic: 'help', message: 'The game froze after 42' };
      equal((await send(good, { origin: 'https://evil.example' })).status, 403, 'foreign origin');
      equal((await send(good, { 'content-type': 'text/plain' })).status, 415, 'text/plain');
      const bad = await send({ topic: '<img src=x onerror=alert(1)>', message: '<b>' });
      equal(bad.status, 400, 'invalid');
      check(!(await bad.text()).includes('onerror'), 'echoed the input');
      const bot = await send({ ...good, website: 'http://spam.example' });
      equal(bot.status, 200, 'honeypot status');
      equal(await bot.json(), { ok: true }, 'honeypot body');
    },
  },
  {
    id: 'CNT-05', area: 'Content', priority: 'P1', type: 'functional',
    title: 'Ways to win has all 26 patterns with anchors and pictures; Number calls has all 90',
    steps: 'Open /ways-to-win#top-line and /tambola-number-calls on a desktop', expected: '26 pattern cards, each with a caption; #top-line in view; 90 rows of calls',
    run: async (t) => {
      const page = await t.device('desktop');
      await go(page, '/ways-to-win#top-line');
      equal(await page.locator('article').count(), 26, 'pattern cards');
      equal(await page.locator('article figcaption').count(), 26, 'captions');
      await until(async () => { const top = await page.locator('#top-line').evaluate((e) => e.getBoundingClientRect().top); return top >= 0 && top < 300; }, '#top-line scrolled into view');
      await go(page, '/tambola-number-calls');
      equal(await page.locator('table tbody tr').count(), 90, 'number rows');
    },
  },
];

export default cases;
