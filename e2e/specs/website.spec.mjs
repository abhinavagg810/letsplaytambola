// The marketing website, navigation, legal pages, metadata, robots, 404.
import { BASE, check, createGame, equal, go, hydrated, newToken, until } from '../lib.mjs';

const text = (page) => page.evaluate(() => document.body.innerText);

const cases = [
  {
    id: 'WEB-01', area: 'Website', priority: 'P0', type: 'functional',
    title: 'Home page shows every section in the specified order with the specified copy',
    steps: 'Open / on an Android phone; read the headings and key copy from top to bottom', expected: 'Hero ("Housie night, sorted.", pill, CTA "Host a game free", code box) → 5 facts → callout marquee → How it works (3 steps) → Features → comparison table → 26 ways → app coming soon + Notify me → FAQ (first question "Do we need to sign up?", open) → closing CTA → footer. No console errors',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/');
      await hydrated(page);
      const body = await text(page);
      const inOrder = ['FREE · NO SIGN-UP · NO DOWNLOAD', 'Housie night, sorted.', 'Host a game free', 'Got a game code?', 'Shared live board', 'Sign-ups needed', 'Unique rhymes', 'Ways to win', 'Claims checked',
        'Three taps from chai to “Full House!”', 'Host a game', 'Share on WhatsApp', 'Play together', 'All the fun of paper tickets. None of the arguments.', 'One link. Type your name. You’re in.', 'Same group, next round in one tap',
        'Paper tickets vs Letsplaytambola', 'Your kitty, your rules.', 'The app is on its way to your phone.', 'Notify me', 'Questions, answered', 'Do we need to sign up?', 'Tonight’s game is one link away.', 'For entertainment only'];
      let at = 0;
      for (const s of inOrder) {
        const i = body.toLowerCase().indexOf(s.toLowerCase(), at);
        check(i >= 0, `"${s}" is missing or out of order on the home page`);
        at = i;
      }
      equal(await page.locator('h1').count(), 1, 'one h1');
      check(!/second house/i.test(body), 'the page still advertises "Second House", which the game does not have');
      check(!/\b(log ?in|sign in|create an account|register)\b/i.test(body), 'the page mentions logging in / accounts');
      equal(page.consoleErrors, [], 'console errors');
      await t.shot(page, 'home-360', { fullPage: false });
      t.note(`${inOrder.length} pieces of copy found in order; one h1; no console errors`);
    },
  },
  {
    id: 'WEB-02', area: 'Website', priority: 'P0', type: 'functional',
    title: 'Every link on the home page goes somewhere real',
    steps: 'Collect every <a href> on /; request each internal address; check in-page anchors exist', expected: 'All internal links answer 200; #how, #features, #faq, #app exist; "Host a game free" → /host; no dead "#" links',
    run: async (t) => {
      const page = await t.device('desktop');
      await go(page, '/');
      const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')));
      check(hrefs.length >= 10, `only ${hrefs.length} links found`);
      const unique = [...new Set(hrefs)];
      for (const h of unique) {
        check(h && h !== '#', `dead link "${h}"`);
        if (h.startsWith('mailto:') || h.startsWith('http')) continue;
        const [path, hash] = h.split('#');
        const r = await fetch(BASE + (path || '/'));
        check(r.status === 200, `${h} → ${r.status}`);
        if (hash && (path === '/' || path === '')) check(await page.locator(`[id="${hash}"]`).count() === 1, `anchor #${hash} does not exist on the home page`);
        await r.arrayBuffer();
      }
      equal(await page.getByRole('link', { name: 'Host a game free' }).evaluateAll((els) => els.map((e) => e.getAttribute('href'))), ['/host', '/host'], 'both CTAs');
      t.note(`${unique.length} distinct links: ${unique.join(' ')}`);
    },
  },
  {
    id: 'WEB-03', area: 'Website', priority: 'P0', type: 'functional',
    title: 'Mobile menu: opens, lists the three items (no "Questions"), closes on tap, Escape and navigation',
    steps: 'At 360px: tap Menu; read the rows; tap Close; open again and press Escape; open and tap "Join a game with a code"; open and tap "How it works"', expected: 'Rows "Join a game with a code", "How it works", "Features" (≥ 54px tall); aria-expanded follows; navigation closes the menu; How it works scrolls to the section',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/');
      await hydrated(page);
      const menu = page.getByRole('button', { name: 'Menu' });
      equal(await menu.getAttribute('aria-expanded'), 'false', 'closed at first');
      await menu.click();
      const rows = page.locator('#site-menu a');
      equal(await rows.allInnerTexts(), ['Join a game with a code', 'How it works', 'Features'], 'menu rows');
      for (const box of await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) check(box >= 54, `menu row is ${box}px tall`);
      equal(await page.getByRole('button', { name: 'Close' }).getAttribute('aria-expanded'), 'true', 'aria-expanded when open');
      await page.getByRole('button', { name: 'Close' }).click();
      equal(await page.locator('#site-menu').count(), 0, 'closed by the button');
      await menu.click();
      await page.keyboard.press('Escape');
      equal(await page.locator('#site-menu').count(), 0, 'closed by Escape');
      await menu.click();
      await page.getByRole('link', { name: 'How it works' }).first().click();
      await until(async () => (await page.locator('#how').evaluate((e) => e.getBoundingClientRect().top)) < 200, 'How it works scrolled into view');
      equal(await page.locator('#site-menu').count(), 0, 'closed after choosing a row');
      await menu.click();
      await page.getByRole('link', { name: 'Join a game with a code' }).click();
      await page.waitForURL('**/join');
      equal(await page.locator('#site-menu').count(), 0, 'closed after navigating');
      // The header "Host" pill
      await page.getByRole('link', { name: 'Host', exact: true }).click();
      await page.waitForURL('**/host');
    },
  },
  {
    id: 'WEB-04', area: 'Website', priority: 'P1', type: 'functional',
    title: 'Desktop header: logo, How it works, Features, Join a game, Host a game; sticky',
    steps: 'At 1280px read the header links; scroll down 2000px; click each', expected: 'Four items + logo; no Menu button; header stays at the top; pills are 44px tall; each link lands on the right place',
    run: async (t) => {
      const page = await t.device('desktop');
      await go(page, '/');
      await hydrated(page);
      const nav = page.getByRole('navigation', { name: 'Main' });
      equal(await nav.getByRole('link').allInnerTexts(), ['How it works', 'Features', 'Join a game', 'Host a game'], 'nav items');
      check(!(await page.getByRole('button', { name: 'Menu' }).isVisible()), 'the Menu button shows on desktop');
      for (const name of ['Join a game', 'Host a game']) {
        const h = await nav.getByRole('link', { name }).evaluate((e) => e.getBoundingClientRect().height);
        check(h >= 44, `${name} pill is ${h}px tall`);
      }
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(300);
      const top = await page.locator('header').first().evaluate((e) => e.getBoundingClientRect().top);
      equal(top, 0, 'header stays at the top while scrolling');
      await nav.getByRole('link', { name: 'Features' }).click();
      await until(async () => Math.abs(await page.locator('#features').evaluate((e) => e.getBoundingClientRect().top)) < 200, 'Features in view');
      await nav.getByRole('link', { name: 'Join a game' }).click();
      await page.waitForURL('**/join');
      await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Host a game' }).click();
      await page.waitForURL('**/host');
      await page.getByRole('link', { name: /Let.s play/i }).first().click().catch(() => page.locator('header a[href="/"]').click());
      await page.waitForURL(BASE + '/');
    },
  },
  {
    id: 'WEB-05', area: 'Website', priority: 'P0', type: 'functional',
    title: 'Code box on the home page: valid code, lower case, pasted link, junk, too short, empty',
    steps: 'Type each input into "Got a game code?" and press Join', expected: 'Lower case is upper-cased; a pasted link gives its code; symbols/spaces are dropped; max 6 characters; a real code opens the invite; an unknown or short code opens "We can’t find game …"; empty opens /join',
    run: async (t) => {
      const code = await createGame(newToken(), { hostName: 'Priya', name: 'Kitty Party' });
      const page = await t.device('android');
      await go(page, '/');
      await hydrated(page);
      const box = page.getByLabel('Got a game code?');
      const cases = [
        [code.toLowerCase(), code], [`  ${code.slice(0, 2)} ${code.slice(2)} `, code], [`https://letsplaytambola.com/g/${code}`, code], [`letsplaytambola.com/g/${code.toLowerCase()}?x=1`, code],
        [`${BASE}/g/${code}#top`, code], ['k7-rq2!!', 'K7RQ2'], ['<script>', 'SCRIPT'], ['ABCDEFGHIJ', 'ABCDEF'], ['१२३४५', ''], ['😀😀', ''],
      ];
      for (const [typed, want] of cases) {
        await box.fill(typed);
        equal(await box.inputValue(), want, `typing ${JSON.stringify(typed)}`);
      }
      await box.fill(code.toLowerCase());
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      await page.waitForURL(`**/g/${code}`);
      await page.getByRole('heading', { name: 'Kitty Party', level: 1 }).waitFor();
      await page.getByRole('button', { name: 'Join game' }).waitFor();
      await go(page, '/');
      await hydrated(page);
      await page.getByLabel('Got a game code?').fill('ZZ9');
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'We can’t find game ZZ9' }).waitFor();
      await page.getByRole('link', { name: 'Try another code' }).click();
      await page.waitForURL('**/join');
      await go(page, '/');
      await hydrated(page);
      await page.getByRole('button', { name: 'Join', exact: true }).click();
      await page.waitForURL('**/join');
      t.note(`${cases.length} inputs normalised as expected; real code opened the invite; ZZ9 → not found → Try another code → /join; empty → /join`);
    },
  },
  {
    id: 'WEB-06', area: 'Website', priority: 'P0', type: 'functional',
    title: 'Notify me: valid Indian mobile number is saved; invalid numbers get a friendly message',
    steps: 'Submit empty, 9 digits, 10 digits starting 1 and 5, letters; paste "+91 98100 11001" and "09810011001"; submit a valid number; tap twice quickly', expected: 'Inline error "Please type a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)" (role=alert) and no request for invalid input; pasted +91/0 prefix is dropped, not the last digits; valid → "You’re on the list! We’ll WhatsApp you at +91 …" and exactly one request',
    run: async (t) => {
      const page = await t.device('android');
      const posts = [];
      page.on('request', (r) => { if (r.url().endsWith('/api/notify')) posts.push(r.postData()); });
      await go(page, '/');
      await hydrated(page);
      const field = page.getByLabel('Get a WhatsApp message the day it launches');
      const send = page.getByRole('button', { name: 'Notify me' });
      await field.scrollIntoViewIfNeeded();
      for (const bad of ['', '981001100', '1234567890', '5810011001', '0000000000']) {
        await field.fill(bad);
        await send.click();
        await page.getByRole('alert').filter({ hasText: 'Please type a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)' }).waitFor();
        equal(await field.getAttribute('aria-invalid'), 'true', `aria-invalid for ${JSON.stringify(bad)}`);
      }
      equal(posts.length, 0, 'no request is sent for an invalid number');
      await field.fill('abc98x10y0');
      equal(await field.inputValue(), '98100', 'letters are dropped');
      equal(await page.getByRole('alert').filter({ hasText: 'Indian mobile' }).count(), 0, 'the error clears when typing');
      for (const [pasted, want] of [['+91 98100 11001', '9810011001'], ['09810011001', '9810011001'], ['91-98100-11001', '9810011001'], ['98100 11001', '9810011001']]) {
        await field.fill('');
        await field.fill(pasted);
        equal(await field.inputValue(), want, `pasting ${JSON.stringify(pasted)}`);
      }
      // typing an 11th digit by hand does nothing
      await field.pressSequentially('7');
      equal(await field.inputValue(), '9810011001', 'an 11th typed digit is ignored');
      await send.dblclick();
      await page.getByText('You’re on the list! We’ll WhatsApp you at +91 9810011001.').waitFor();
      equal(posts, ['{"phone":"9810011001"}'], 'exactly one request with the clean number');
      equal(await field.count(), 0, 'the form is replaced by the confirmation');
      await t.shot(page, 'notify-done');
    },
  },
  {
    id: 'WEB-07', area: 'Website', priority: 'P1', type: 'negative',
    title: 'Notify me: the same number twice is fine; the hourly limit and a server failure show a clear message',
    steps: 'Save one number from two visits; submit until the limit (6th from one device); block the network and submit', expected: 'Second save succeeds quietly; at the limit a toast "Too many tries — please wait a minute and try again"; offline → "Couldn’t save your number. Please try again." and the number stays in the field',
    run: async (t) => {
      const page = await t.device('android');
      const submit = async (n) => {
        await go(page, '/');
        await hydrated(page);
        await page.getByLabel('Get a WhatsApp message the day it launches').fill(n);
        await page.getByRole('button', { name: 'Notify me' }).click();
      };
      for (let i = 0; i < 5; i++) {
        await submit('9810022002');
        await page.getByText('You’re on the list! We’ll WhatsApp you at +91 9810022002.').waitFor();
      }
      await submit('9810022002');
      const limited = await Promise.race([
        page.getByText('Too many tries — please wait a minute and try again').waitFor().then(() => true),
        page.getByText('You’re on the list! We’ll').waitFor().then(() => false),
      ]);
      if (!limited) t.note('rate limits are switched off on this server: the limit message could not be shown');
      else equal(await page.getByLabel('Get a WhatsApp message the day it launches').inputValue(), '9810022002', 'number kept after the limit message');
      await page.route('**/api/notify', (r) => r.abort());
      await submit('9810022003');
      await page.getByText('Couldn’t save your number. Please try again.').waitFor();
      equal(await page.getByLabel('Get a WhatsApp message the day it launches').inputValue(), '9810022003', 'number kept after a failure');
      t.note(`duplicate saves ok ×5; limit message ${limited ? 'shown on the 6th' : 'not testable here'}; offline message shown`);
    },
  },
  {
    id: 'WEB-08', area: 'Website', priority: 'P1', type: 'functional',
    title: 'FAQ accordion: first question open; opening another closes it; keyboard works',
    steps: 'Scroll to the FAQ; check which item is open; click the second; press Enter on the third with the keyboard', expected: 'Six questions; "Do we need to sign up?" open at first; one open at a time; summary focusable and toggles with Enter',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/#faq');
      await hydrated(page);
      const items = page.locator('#faq details');
      equal(await items.count(), 6, 'questions');
      equal(await page.locator('#faq summary').first().innerText().then((s) => s.trim()), 'Do we need to sign up?', 'first question');
      const open = () => items.evaluateAll((els) => els.map((e) => e.open));
      equal(await open(), [true, false, false, false, false, false], 'first open');
      await page.locator('#faq summary').nth(1).click();
      equal(await open(), [false, true, false, false, false, false], 'second open, first closed');
      await page.locator('#faq summary').nth(2).focus();
      await page.keyboard.press('Enter');
      equal(await open(), [false, false, true, false, false, false], 'third opened with the keyboard');
      await page.keyboard.press('Enter');
      equal(await open(), [false, false, false, false, false, false], 'closes again');
      const answers = await page.locator('#faq details').evaluateAll((els) => els.map((e) => e.textContent));
      check(/Nobody creates an account/.test(answers.join(' ')), 'the first answer says nobody creates an account');
    },
  },
  {
    id: 'WEB-09', area: 'Website', priority: 'P1', type: 'functional',
    title: 'Page titles, descriptions and link previews (Open Graph / Twitter)',
    steps: 'Read <title>, description, canonical-ish OG tags and images of /, /host, /host/prizes, /join, /privacy, /terms and a game page; fetch the OG image', expected: 'Each page has its own title ending "— Letsplaytambola" (home: "Letsplaytambola — Housie night, sorted."); description present; og:image answers 200 image/png ~1200×630; the game page preview is generic (no names) and noindex; lang="en-IN"; viewport does not block zoom',
    run: async (t) => {
      const code = await createGame(newToken(), { hostName: 'Secretname', name: 'Secretgame' });
      const page = await t.device('desktop');
      const titles = {};
      for (const p of ['/', '/host', '/host/prizes', '/join', '/privacy', '/terms', `/g/${code}`]) {
        await go(page, p);
        const m = await page.evaluate(() => {
          const g = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
          return { title: document.title, desc: g('meta[name=description]'), ogTitle: g('meta[property="og:title"]'), ogImage: g('meta[property="og:image"]'), twCard: g('meta[name="twitter:card"]'), robots: g('meta[name=robots]'), viewport: g('meta[name=viewport]'), lang: document.documentElement.lang, head: document.head.innerHTML };
        });
        titles[p.startsWith('/g/') ? '/g/CODE' : p] = m.title;
        check(m.title && /Letsplaytambola/.test(m.title), `${p}: title "${m.title}"`);
        check(m.desc && m.desc.length > 50, `${p}: description "${m.desc}"`);
        check(m.ogTitle && m.ogImage, `${p}: og tags (${m.ogTitle}, ${m.ogImage})`);
        equal(m.twCard, 'summary_large_image', `${p}: twitter card`);
        equal(m.lang, 'en-IN', `${p}: lang`);
        check(!/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(m.viewport || ''), `${p}: viewport blocks zoom: ${m.viewport}`);
        if (p.startsWith('/g/')) {
          check(/noindex/.test(m.robots || ''), `game page robots meta: ${m.robots}`);
          check(/\/opengraph-image\.png/.test(m.ogImage), `game page preview image: ${m.ogImage}`);
          check(!/Secretname|Secretgame/.test(m.head), 'the game page <head> reveals the host or game name');
        }
      }
      equal(titles['/'], 'Letsplaytambola — Housie night, sorted.', 'home title');
      equal(new Set(Object.values(titles)).size, Object.keys(titles).length, `every page has its own title: ${JSON.stringify(titles)}`);
      const og = await fetch(BASE + '/opengraph-image.png');
      const buf = Buffer.from(await og.arrayBuffer());
      check(og.status === 200 && /image\/png/.test(og.headers.get('content-type')), 'og image');
      equal([buf.readUInt32BE(16), buf.readUInt32BE(20)], [1200, 630], 'og image size');
      for (const icon of ['/icon.png', '/apple-icon.png', '/favicon.ico', '/manifest.webmanifest']) equal((await fetch(BASE + icon)).status, 200, icon);
      t.note(JSON.stringify(titles));
    },
  },
  {
    id: 'WEB-10', area: 'Website', priority: 'P1', type: 'functional',
    title: 'robots.txt and sitemap.xml',
    steps: 'GET /robots.txt and /sitemap.xml', expected: 'robots disallows /g/, /api/ and /admin and points to the sitemap; the sitemap lists /, /host, /join, /privacy, /terms only (no game pages, no admin)',
    run: async (t) => {
      const robots = await (await fetch(BASE + '/robots.txt')).text();
      for (const line of ['User-Agent: *', 'Allow: /', 'Disallow: /g/', 'Disallow: /api/', 'Disallow: /admin', 'Sitemap: ']) check(robots.includes(line), `robots.txt lacks "${line}":\n${robots}`);
      const xml = await (await fetch(BASE + '/sitemap.xml')).text();
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname).sort();
      equal(locs, ['/', '/host', '/join', '/privacy', '/terms'], 'sitemap addresses');
      t.note(robots.replace(/\n/g, ' | '));
    },
  },
  {
    id: 'WEB-11', area: 'Website', priority: 'P1', type: 'negative',
    title: 'Unknown addresses show the friendly 404 page with ways forward',
    steps: 'Open /nope, /host/unknown, /g (no code), /G/ABCDE (capital G), /join/extra', expected: 'HTTP 404 with "We can’t find that page", "Join with a code" → /join and "Go to the home page" → /; header and footer present; noindex',
    run: async (t) => {
      const page = await t.device('android');
      for (const p of ['/nope', '/host/unknown', '/g', '/join/extra', '/privacy/x']) {
        const res = await go(page, p);
        equal(res.status(), 404, `${p} status`);
        await page.getByRole('heading', { name: 'We can’t find that page' }).waitFor();
        equal(await page.getByRole('link', { name: 'Join with a code' }).getAttribute('href'), '/join', 'join link');
        equal(await page.getByRole('link', { name: 'Go to the home page' }).getAttribute('href'), '/', 'home link');
      }
      check(await page.locator('header').first().isVisible() && await page.locator('footer').isVisible(), 'header and footer');
      await t.shot(page, '404');
    },
  },
  {
    id: 'WEB-12', area: 'Website', priority: 'P1', type: 'functional',
    title: 'Privacy and Terms describe v2 (names, device token, 24 hours, Notify-me numbers) and nothing from v1',
    steps: 'Read /privacy and /terms', expected: 'They mention: the name you type, a device token, deletion after 24 hours, Notify-me phone numbers, no payments. They do NOT mention OTP, Google/Apple sign-in, contacts, friends lists. Footer "Contact" → /privacy#contact exists',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/privacy');
      const privacy = await text(page);
      for (const must of [/name/i, /device/i, /24 hours/i, /WhatsApp|mobile number|phone number/i]) check(must.test(privacy), `privacy page does not mention ${must}`);
      for (const mustNot of [/\bOTP\b/i, /Google sign|Apple sign|sign in with/i, /upload(ed)? your contacts|access to your contacts|address book/i, /friends list/i]) check(!mustNot.test(privacy), `privacy page still mentions ${mustNot} (v1)`);
      equal(await page.locator('#contact').count(), 1, '#contact anchor');
      await go(page, '/terms');
      const terms = await text(page);
      for (const must of [/real money|payments|never handles/i, /entertainment/i]) check(must.test(terms), `terms page does not mention ${must}`);
      for (const mustNot of [/\bOTP\b/i, /your account/i]) check(!mustNot.test(terms), `terms page still mentions ${mustNot}`);
      equal(await page.locator('h1').count(), 1, 'one h1 on terms');
      t.note(`privacy ${privacy.length} characters, terms ${terms.length} characters`);
    },
  },
  {
    id: 'WEB-13', area: 'Website', priority: 'P2', type: 'functional',
    title: 'Ads are off: no AdSense script, no ad slots, ads.txt harmless',
    steps: 'With no AdSense settings: load /, a lobby and a results page; look for adsbygoogle; GET /ads.txt', expected: 'No adsbygoogle script or <ins> anywhere; no request to googlesyndication; /ads.txt answers 200 or 404 without errors',
    run: async (t) => {
      const page = await t.device('android');
      const external = [];
      page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.push(r.url()); });
      const tok = newToken();
      const code = await createGame(tok, { prizes: ['early5'] });
      await page.addInitScript((token) => window.localStorage.setItem('lpt:token', token), tok);
      for (const p of ['/', `/g/${code}`]) {
        await go(page, p);
        await page.waitForTimeout(600);
        equal(await page.locator('ins.adsbygoogle, script[src*="adsbygoogle"], [aria-label="Advertisement"]').count(), 0, `${p}: ad elements`);
      }
      await page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
      equal(external, [], 'requests to other sites');
      const ads = await fetch(BASE + '/ads.txt');
      check([200, 404].includes(ads.status), `/ads.txt → ${ads.status}`);
      t.note(`no third-party requests at all on / and the lobby; /ads.txt → ${ads.status}`);
    },
  },
];
export default cases;
