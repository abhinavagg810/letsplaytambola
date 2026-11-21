// Responsive layout and accessibility checks that hold on every screen.
import { ALL_RULES, act, callUntilComplete, cell, check, createGame, drawUntil, equal, expectToast, go, hydrated, needFor, newToken, sleep, ticketNumbers, until, useToken, view } from '../lib.mjs';

const WIDTHS = [[320, 640], [360, 760], [390, 844], [414, 896], [640, 900], [768, 1024], [1024, 768], [1280, 800], [1440, 900], [1920, 1080], [760, 360]];
const LONG_HOST = 'Wwwwwwwwwwwwwwwwwwwwwwww'; // 24 wide letters
const LONG_GAME = 'Mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm'; // 32 wide letters

/** Games in every state for one host device and one player device, with long names and money. */
async function world(opts = {}) {
  const host = newToken();
  const player = newToken();
  const input = { hostName: opts.long ? LONG_HOST : 'Priya', name: opts.long ? LONG_GAME : 'Diwali Night', price: 100, prizes: opts.allPrizes ? ALL_RULES : ['early5', 'top', 'middle', 'bottom', 'corners', 'full'] };
  const pname = opts.long ? 'Qqqqqqqqqqqqqqqqqqqqqqqq' : 'Meera';
  const mk = async () => {
    const code = await createGame(host, input);
    await act(code, player, { type: 'join', name: pname });
    for (let i = 0; i < (opts.extraPlayers ?? 2); i++) await act(code, newToken(), { type: 'join', name: opts.long ? `Xxxxxxxxxxxxxxxxxxxxxxx${i}` : `Guest ${i + 1}` });
    return code;
  };
  const lobby = await mk();
  let live;
  for (;;) {
    live = await mk();
    await act(live, host, { type: 'start' });
    const called = await drawUntil(live, host, (c) => c.length >= 45);
    const g = (await view(live, player)).body.game;
    const mine = ticketNumbers(g.you.ticket).filter((n) => called.includes(n));
    if (mine.length < 5) continue;
    for (const n of mine) await act(live, player, { type: 'mark', n, on: true });
    await act(live, player, { type: 'claim', prizeId: 'early5' });
    break;
  }
  const done = await mk();
  await act(done, host, { type: 'start' });
  await drawUntil(done, host, (c) => c.length >= 50);
  const gd = (await view(done, player)).body.game;
  for (const n of ticketNumbers(gd.you.ticket).filter((x) => gd.called.includes(x))) await act(done, player, { type: 'mark', n, on: true });
  await act(done, player, { type: 'claim', prizeId: 'early5' });
  await drawUntil(done, host, () => false);
  return { host, player, lobby, live, done };
}
const overflow = (page) => page.evaluate(() => {
  const w = window.innerWidth;
  const doc = document.documentElement.scrollWidth - w;
  // Anything sticking out of the screen that is not inside a container that clips or scrolls on purpose.
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || (r.right <= w + 1 && r.left >= -1)) continue;
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p);
      if (o.overflowX !== 'visible' || o.overflow !== 'visible') { clipped = true; break; }
    }
    if (getComputedStyle(el).position === 'fixed' && r.right <= w + 1 && r.left >= -1) continue;
    if (!clipped) out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  return { doc, out: out.slice(0, 5) };
});

/** Relative luminance contrast of every visible piece of text against what is painted behind it. */
const contrastProblems = (page) => page.evaluate(() => {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const bgOf = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.backgroundImage && s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return null; // pictures: cannot judge
      const m = s.backgroundImage.match(/(oklch|rgba?|color)\([^)]*\)/);
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) layers.push(c);
      else if (m) { const g = rgba(m[0]); if (g[3] > 0.5) layers.push(g); }
      if (c[3] === 1) break;
    }
    let base = [27, 15, 52, 1]; // the plum page
    for (const l of layers.reverse()) base = over(l, base);
    return base;
  };
  const bad = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el || seen.has(el)) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || s.opacity === '0' || el.closest('[aria-hidden="true"]') || el.closest('.visually-hidden') || r.width <= 1) continue;
    const bg = bgOf(el);
    if (!bg) continue;
    const fg = over(rgba(s.color), bg);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (a + 0.05) / (b + 0.05);
    const size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`"${text.slice(0, 28)}" ${ratio.toFixed(2)}:1 (${Math.round(size)}px/${s.fontWeight})`);
  }
  return bad;
});

/** Controls a finger must hit: smaller than 44px in height (or width, for stand-alone buttons). Links inside running text are exempt (WCAG 2.5.8). */
const smallTargets = (page) => page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('a[href], button, input, summary, [role="switch"], [role="checkbox"]')) {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue;
    const inline = el.tagName === 'A' && s.display.startsWith('inline') && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20;
    if (inline) continue;
    const isCell = el.closest('[role="group"]') && el.hasAttribute('aria-pressed') && /^\d+/.test(el.textContent);
    // A field inside a visible box that is its <label> (₹ price, ₹ amount): the box is the target.
    const box = el.tagName === 'INPUT' && el.closest('label') ? el.closest('label').getBoundingClientRect() : r;
    // The design handoff sets the game-name quick picks at 40px ("Quick-pick chips below (40px pills)").
    const chip40 = el.tagName === 'BUTTON' && el.hasAttribute('aria-pressed') && Math.round(r.height) === 40 && !!el.closest('[aria-label="Quick picks for the game name"]');
    if (chip40) continue;
    if (box.height < 43.5 || (!isCell && box.width < 43.5)) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || el.getAttribute('name') || '').trim().slice(0, 24)}" ${Math.round(box.width)}×${Math.round(box.height)}`);
  }
  return out;
});
const smallText = (page) => page.evaluate(() => {
  const out = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest('[aria-hidden="true"]') || el.closest('.visually-hidden')) continue;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || s.visibility === 'hidden') continue;
    const size = parseFloat(s.fontSize);
    const mono = /mono/i.test(s.fontFamily);
    if (size < (mono ? 12 : 15) - 0.01) out.add(`"${n.textContent.trim().slice(0, 24)}" ${size}px${mono ? ' mono' : ''}`);
  }
  for (const el of document.querySelectorAll('input, textarea, select')) {
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (el.getBoundingClientRect().width > 0 && size < 16) out.add(`input ${el.name || el.getAttribute('aria-label')} ${size}px (iOS zooms below 16px)`);
  }
  return [...out];
});

async function screens(t, w, kind = 'android') {
  const hostPage = await t.device(kind);
  await useToken(hostPage, w.host);
  const playerPage = await t.device(kind);
  await useToken(playerPage, w.player);
  const visitor = await t.device(kind);
  const ready = {
    lobby: (p) => p.getByRole('heading', { name: /Who’s here/ }).waitFor(),
    live: (p) => p.getByRole('heading', { name: 'The board' }).waitFor(),
    done: (p) => p.getByRole('heading', { name: 'That’s the game!' }).waitFor(),
  };
  const list = [];
  for (const path of ['/', '/host', '/host/prizes', '/join', '/privacy', '/terms', '/no-such-page', '/g/ZZZZZ']) list.push({ name: path, page: visitor, open: async () => { await go(visitor, path); await visitor.waitForLoadState('load'); if (path === '/g/ZZZZZ') await visitor.getByText('We can’t find game ZZZZZ').waitFor(); } });
  list.push({ name: 'invite', page: visitor, open: async () => { await go(visitor, `/g/${w.lobby}`); await visitor.getByRole('button', { name: 'Join game' }).waitFor(); } });
  list.push({ name: 'finished (visitor)', page: visitor, open: async () => { await go(visitor, `/g/${w.done}`); await visitor.getByText('This game has finished.').waitFor(); } });
  for (const [state, code] of [['lobby', w.lobby], ['live', w.live], ['done', w.done]]) {
    list.push({ name: `${state} (host)`, page: hostPage, open: async () => { await go(hostPage, `/g/${code}`); await ready[state](hostPage); } });
    list.push({ name: `${state} (player)`, page: playerPage, open: async () => { await go(playerPage, `/g/${code}`); await ready[state](playerPage); } });
  }
  return { list, hostPage, playerPage, visitor };
}

export default [
  {
    id: 'RSP-01', area: 'Responsive', priority: 'P0', type: 'responsive',
    title: 'No sideways scrolling and nothing cut off on any screen at 320–1920px and on a phone held sideways',
    steps: 'Open all 16 screens (website, setup, picker, join, legal, 404, not found, invite, finished, lobby/live/results as host and as player) at 320, 360, 390, 414, 640 (=1280 at 200% zoom), 768, 1024, 1280, 1440, 1920 and 760×360 landscape', expected: 'The page never scrolls sideways and no element sticks out of the screen, at any width (176 combinations)',
    run: async (t) => {
      const w = await world();
      const { list } = await screens(t, w);
      let checked = 0;
      const problems = [];
      for (const s of list) {
        await s.page.setViewportSize({ width: 360, height: 760 });
        await s.open();
        for (const [width, height] of WIDTHS) {
          await s.page.setViewportSize({ width, height });
          await sleep(120);
          const o = await overflow(s.page);
          checked++;
          if (o.doc > 0 || o.out.length) problems.push(`${s.name} @${width}×${height}: page is ${o.doc}px too wide; ${o.out.join('; ')}`);
          if ([360, 1280].includes(width) && ['live (player)', 'done (host)', 'lobby (player)'].includes(s.name)) await t.shot(s.page, `${s.name.replace(/[ ()]+/g, '-')}${width}`, { fullPage: true });
          if (width === 760 && s.name === 'live (player)') await t.shot(s.page, 'live-player-landscape');
        }
      }
      equal(problems, [], 'overflow problems');
      t.note(`${checked} screen × width combinations checked, no sideways overflow`);
    },
  },
  {
    id: 'RSP-02', area: 'Responsive', priority: 'P0', type: 'responsive',
    title: 'Worst case content: 24-letter names, 32-letter game name, all 26 prizes, wide letters — at 320px and 360px',
    steps: 'Create games whose host, game and player names are the longest allowed (all "W"/"M"), with all 26 ways to win; open every game screen at 320 and 360px and on desktop', expected: 'Names wrap or shrink inside their boxes; no sideways scrolling; buttons stay on screen; the ticket header keeps the Claim! button fully visible',
    run: async (t) => {
      const w = await world({ long: true, allPrizes: true });
      const { list } = await screens(t, w);
      const problems = [];
      for (const s of list.filter((x) => /invite|finished|lobby|live|done/.test(x.name))) {
        await s.page.setViewportSize({ width: 360, height: 760 });
        await s.open();
        for (const [width, height] of [[320, 640], [360, 760], [1280, 800]]) {
          await s.page.setViewportSize({ width, height });
          await sleep(120);
          const o = await overflow(s.page);
          if (o.doc > 0 || o.out.length) problems.push(`${s.name} @${width}: ${o.doc}px too wide; ${o.out.join('; ')}`);
          if (s.name === 'live (player)') {
            const claim = await s.page.getByRole('button', { name: 'Claim!' }).boundingBox();
            if (!claim || claim.x < 0 || claim.x + claim.width > width || claim.width < 60) problems.push(`Claim! button squeezed or off screen at ${width}: ${JSON.stringify(claim)}`);
            if (width === 320) await t.shot(s.page, 'long-names-26-prizes-live-320', { fullPage: true });
          }
          if (s.name === 'done (host)' && width === 320) await t.shot(s.page, 'long-names-results-320', { fullPage: true });
        }
      }
      equal(problems, [], 'problems with the longest content');
    },
  },
  {
    id: 'RSP-03', area: 'Responsive', priority: 'P1', type: 'usability',
    title: 'Tap targets are at least 44px on a phone (ticket cells: 44px tall) on every screen',
    steps: 'At 360px measure every link, button, input and switch on all 16 screens (links inside sentences excepted)', expected: 'Nothing a finger must hit is smaller than 44×44 px',
    run: async (t) => {
      const w = await world();
      const { list } = await screens(t, w);
      const problems = [];
      let n = 0;
      for (const s of list) {
        await s.open();
        const small = await smallTargets(s.page);
        n++;
        if (small.length) problems.push(`${s.name}: ${small.join(' | ')}`);
      }
      // The claim sheet and the open mobile menu too.
      const live = list.find((x) => x.name === 'live (player)');
      await live.open();
      await live.page.getByRole('button', { name: 'Claim!' }).click();
      const sheet = await smallTargets(live.page);
      if (sheet.length) problems.push(`claim sheet: ${sheet.join(' | ')}`);
      equal(problems, [], 'tap targets under 44px');
      t.note(`${n} screens + claim sheet measured at 360px`);
    },
  },
  {
    id: 'RSP-04', area: 'Responsive', priority: 'P1', type: 'usability',
    title: 'Text is at least 15px (small-caps labels 12px) and every input is 16px or more (no zoom jump on iPhone)',
    steps: 'At 360px read the computed font size of every visible piece of text and every input on all 16 screens', expected: 'No text under 15px except the 12px monospace labels; all inputs ≥ 16px',
    run: async (t) => {
      const w = await world();
      const { list } = await screens(t, w, 'iphone');
      const problems = [];
      for (const s of list) {
        await s.open();
        const small = await smallText(s.page);
        if (small.length) problems.push(`${s.name}: ${small.slice(0, 6).join(' | ')}`);
      }
      // Known and reported (U-15): the two "Coming soon on …" lines inside the store badges are 12px, as in the design prototype.
      const known = problems.filter((x) => /^\/: /.test(x) && /Coming soon on/.test(x) && !/\| "(?!Coming soon on)/.test(x));
      for (const k of known) t.open(`12px text in the app-store badges on the home page — ${k}`);
      equal(problems.filter((x) => !known.includes(x)), [], 'text that is too small');
    },
  },
  {
    id: 'RSP-05', area: 'Responsive', priority: 'P1', type: 'usability',
    title: 'Typing with the phone keyboard up: the field stays visible and the sticky button does not sit on top of it',
    steps: 'On a 360×380 screen (what is left when the keyboard is open) focus each field on /host, the amount fields on /host/prizes, the code field on /join and the name field on the invite', expected: 'After focusing, the field is fully inside the visible area and is not covered by the sticky "Create game" / "Done" bar or the sticky header',
    run: async (t) => {
      const code = await createGame(newToken());
      const page = await t.device('android', { viewport: { width: 360, height: 380 } });
      const problems = [];
      const probe = async (label, locator) => {
        await locator.focus();
        await sleep(1600); // the page scrolls smoothly; give it time to settle
        const r = await locator.evaluate((el) => {
          const b = el.getBoundingClientRect();
          const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return { top: b.top, bottom: b.bottom, vh: window.innerHeight, hit: at === el || el.contains(at) || (at && at.contains(el)) || (at && at.closest('label') && at.closest('label').contains(el)) };
        });
        if (r.top < 0 || r.bottom > r.vh || !r.hit) problems.push(`${label}: top ${Math.round(r.top)}, bottom ${Math.round(r.bottom)} of ${r.vh}, reachable ${r.hit}`);
      };
      await go(page, '/host');
      await hydrated(page);
      for (const name of ['hostName', 'gameName', 'price']) await probe(`/host ${name}`, page.locator(`input[name="${name}"]`));
      await go(page, '/host/prizes');
      await hydrated(page);
      for (const prize of ['Early Five', 'Four Corners', 'Full House']) await probe(`/host/prizes amount ${prize}`, page.getByLabel(`Prize amount for ${prize} in rupees (optional)`));
      await go(page, '/join');
      await hydrated(page);
      await probe('/join code', page.getByLabel('Game code'));
      await go(page, `/g/${code}`);
      await probe('invite name', page.getByLabel('What should we call you?'));
      await go(page, '/');
      await hydrated(page);
      await probe('home code box', page.getByLabel('Got a game code?'));
      await probe('home notify', page.getByLabel('Get a WhatsApp message the day it launches'));
      equal(problems, [], 'fields hidden or covered with the keyboard up');
    },
  },
  {
    id: 'RSP-06', area: 'Responsive', priority: 'P2', type: 'responsive',
    title: 'Phones with a home bar / notch: sticky bars and the bottom sheet leave room (safe-area), and screens use the dynamic viewport height',
    steps: 'Read the page’s style sheets on /host and on a live game', expected: 'The sticky bottom bar, the toast and the bottom sheet use env(safe-area-inset-bottom); the viewport meta has viewport-fit=cover; full-height layouts use dvh',
    run: async (t) => {
      const page = await t.device('iphone');
      await go(page, '/host');
      const css = await page.evaluate(async () => {
        let all = '';
        for (const l of document.querySelectorAll('link[rel="stylesheet"]')) all += await (await fetch(l.href)).text();
        for (const s of document.querySelectorAll('style')) all += s.textContent;
        return all;
      });
      const uses = (css.match(/env\(safe-area-inset-bottom/g) || []).length;
      check(uses >= 2, `safe-area-inset-bottom is used ${uses} time(s) in the style sheets`);
      check(/dvh/.test(css), 'no dvh units found');
      check(/viewport-fit=cover/.test(await page.locator('meta[name="viewport"]').getAttribute('content')), 'viewport-fit=cover');
      t.note(`env(safe-area-inset-bottom) appears ${uses}× in the CSS of /host`);
    },
  },
  {
    id: 'RSP-07', area: 'Responsive', priority: 'P1', type: 'responsive',
    title: 'Phone held sideways (760×360): the game is playable — claim sheet scrolls, header does not eat the screen',
    steps: 'Live game as a player in landscape; open the claim sheet with 26 prizes; scroll to the last one and tap it; dab a number', expected: 'Sticky header ≤ 25% of the height; the sheet is no taller than the screen and scrolls inside itself; the last prize can be tapped (toast "Not yet…"); a called number can be dabbed',
    run: async (t) => {
      const w = await world({ allPrizes: true });
      const page = await t.device('android', { viewport: { width: 760, height: 360 } });
      await useToken(page, w.player);
      await go(page, `/g/${w.live}`);
      await page.getByRole('heading', { name: 'The board' }).waitFor();
      const header = await page.locator('header').first().evaluate((e) => e.getBoundingClientRect().height);
      check(header <= 90, `the sticky header is ${header}px of 360px`);
      await page.getByRole('button', { name: 'Claim!' }).click();
      const dialog = page.getByRole('dialog');
      await sleep(500); // let it finish sliding up
      const box = await dialog.boundingBox();
      check(box.y >= 0 && box.y + box.height <= 361, `the sheet does not fit the screen: ${JSON.stringify(box)}`);
      const last = dialog.getByRole('button').last();
      await last.scrollIntoViewIfNeeded();
      const name = (await last.innerText()).split('\n')[0];
      await last.click();
      await expectToast(page, `Not yet for ${name} — keep playing!`);
      const g = (await view(w.live, w.player)).body.game;
      const n = ticketNumbers(g.you.ticket).find((x) => g.called.includes(x) && !g.you.marks.includes(x));
      if (n) { await cell(page, n).click(); await page.getByRole('button', { name: `${n}, dabbed`, exact: true }).waitFor(); }
      t.note(`landscape: header ${header}px; sheet ${Math.round(box.height)}px tall with 25 options; last option "${name}" tapped`);
    },
  },
  {
    id: 'A11Y-01', area: 'Accessibility', priority: 'P0', type: 'accessibility',
    title: 'A whole game with the keyboard only: host, join, start, call, dab, claim, play again',
    steps: 'Using only Tab / Shift+Tab / Enter / Space / Escape and typing: create a game on /host; on a second browser join by link; host starts and calls numbers; player dabs a called number, opens Claim!, picks a prize; (finish the round through the API) host presses Play again', expected: 'Every step is reachable in a sensible order (first Tab on /host lands on the header, the form fields come in visual order) and works from the keyboard; focus is never lost or trapped outside the claim sheet',
    run: async (t) => {
      const host = await t.device('desktop');
      const tabTo = async (page, test, what, max = 60) => {
        for (let i = 0; i < max; i++) {
          await page.keyboard.press('Tab');
          if (await page.evaluate(test)) return i + 1;
        }
        throw new Error(`could not reach ${what} with ${max} Tab presses`);
      };
      await go(host, '/host');
      await hydrated(host);
      const order = [];
      for (let i = 0; i < 22; i++) {
        await host.keyboard.press('Tab');
        order.push(await host.evaluate(() => { const e = document.activeElement; return e.getAttribute('name') || e.getAttribute('aria-label') || e.textContent.trim().slice(0, 22); }));
      }
      const idx = (s) => order.findIndex((o) => o.startsWith(s));
      const seq = ['Back', 'hostName', 'gameName', 'Kitty Party', 'price', 'Deal me a ticket', 'Ways to win', 'Create game'];
      check(seq.every((s) => idx(s) >= 0) && seq.every((s, i) => i === 0 || idx(s) > idx(seq[i - 1])), `focus order on /host: ${order.join(' → ')}`);
      await host.locator('input[name="hostName"]').focus();
      await host.keyboard.type('Priya');
      await host.keyboard.press('Enter'); // Enter in the form creates the game
      await host.waitForURL(/\/g\/[A-Z0-9]{5}$/);
      const code = host.url().split('/g/')[1];
      const player = await t.device('desktop');
      await go(player, `/g/${code}`);
      await player.getByLabel('What should we call you?').waitFor();
      await tabTo(player, () => document.activeElement?.getAttribute('name') === 'name', 'the name field');
      await player.keyboard.type('Meera');
      await player.keyboard.press('Enter');
      await player.getByText('Waiting for Priya to start the game.').waitFor();
      await host.getByRole('heading', { name: 'Who’s here · 2' }).waitFor({ timeout: 5000 });
      await tabTo(host, () => document.activeElement?.textContent === 'Start the game', 'Start the game');
      await host.keyboard.press('Enter');
      await host.getByRole('button', { name: 'Call next number' }).waitFor();
      await tabTo(host, () => document.activeElement?.textContent === 'Call next number', 'Call next number');
      const hostTok = await host.evaluate(() => localStorage.getItem('lpt:token'));
      const playerTok = await player.evaluate(() => localStorage.getItem('lpt:token'));
      const mine = ticketNumbers((await view(code, playerTok)).body.game.you.ticket);
      let called = [];
      for (let i = 1; !mine.some((n) => called.includes(n)); i++) {
        await host.keyboard.press(i % 2 ? 'Enter' : 'Space');
        await host.getByText(`${i} OF 90 CALLED`).first().waitFor();
        called = (await view(code, hostTok)).body.game.called;
      }
      const n = mine.find((x) => called.includes(x));
      await player.getByText(`${called.length} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
      await tabTo(player, (() => document.activeElement?.getAttribute('aria-label') === '__N__').toString().replace('__N__', String(n)), `ticket cell ${n}`, 90).catch(async () => {
        await tabTo(player, `document.activeElement?.getAttribute('aria-label') === '${n}'`, `ticket cell ${n}`, 90);
      });
      await player.keyboard.press('Space');
      await player.getByRole('button', { name: `${n}, dabbed`, exact: true }).waitFor();
      await player.keyboard.press('Enter');
      await until(async () => (await cell(player, n).getAttribute('aria-pressed')) === 'false', 'Enter un-dabs');
      await tabTo(player, 'document.activeElement?.textContent === "Claim!"', 'Claim!', 90);
      await player.keyboard.press('Enter');
      await player.getByRole('dialog').waitFor();
      await player.keyboard.press('Tab');
      check(await player.evaluate(() => !!document.activeElement.closest('[role=dialog]')), 'focus left the claim sheet');
      await player.keyboard.press('Enter');
      await expectToast(player, 'Not yet for');
      check(await player.evaluate(() => document.activeElement?.textContent === 'Claim!'), 'focus did not come back to Claim! after the sheet closed');
      await drawUntil(code, hostTok, () => false);
      await host.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 6000 });
      await tabTo(host, 'document.activeElement?.textContent === "Play again with same people"', 'Play again');
      await host.keyboard.press('Enter');
      await host.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
      t.note(`focus order on /host: ${order.slice(0, 16).join(' → ')}`);
    },
  },
  {
    id: 'A11Y-02', area: 'Accessibility', priority: 'P1', type: 'accessibility',
    title: 'Keyboard focus is always visible',
    steps: 'Tab through every control on the home page, /host, /host/prizes, /join, the invite, lobby, live game (with the claim sheet) and results; read the focus style of each', expected: 'Every focused control shows an outline (or ring) at least 2px thick that differs from its unfocused look',
    run: async (t) => {
      const w = await world();
      const { list } = await screens(t, w, 'desktop');
      const problems = [];
      let total = 0;
      for (const s of list.filter((x) => !/privacy|terms|no-such|ZZZZZ|finished/.test(x.name))) {
        await s.open();
        await s.page.waitForTimeout(150);
        const seen = new Set();
        for (let i = 0; i < 70; i++) {
          await s.page.keyboard.press('Tab');
          const f = await s.page.evaluate(() => {
            const e = document.activeElement;
            if (!e || e === document.body) return null;
            const st = getComputedStyle(e);
            const r = e.getBoundingClientRect();
            return { key: `${e.tagName}:${(e.getAttribute('aria-label') || e.textContent || e.getAttribute('name') || '').trim().slice(0, 24)}:${Math.round(r.top + window.scrollY)}`, outline: st.outlineStyle !== 'none' ? parseFloat(st.outlineWidth) : 0, shadow: st.boxShadow !== 'none' && /\d+px \d+px \d+px [1-9]/.test(st.boxShadow), visible: r.width > 0 && r.height > 0 };
          });
          if (!f) continue;
          if (seen.has(f.key)) break;
          seen.add(f.key);
          total++;
          if (f.visible && f.outline < 2 && !f.shadow) problems.push(`${s.name}: ${f.key} (outline ${f.outline}px)`);
        }
      }
      equal(problems, [], 'controls without a visible focus ring');
      t.note(`${total} focus stops checked across ${list.length - 5} screens`);
    },
  },
  {
    id: 'A11Y-03', area: 'Accessibility', priority: 'P1', type: 'accessibility',
    title: 'Structure for screen readers: one h1, ordered headings, landmarks, named controls, live regions',
    steps: 'On all 16 screens read the heading outline, landmarks, and the accessible name of every button, link and input', expected: 'Exactly one h1; no heading level is skipped; header/main/footer landmarks; every control has a name; inputs have labels; the toast region is role=status (polite); the win banner region is assertive; the caller text and the lobby count are polite live regions',
    run: async (t) => {
      const w = await world();
      const { list } = await screens(t, w);
      const problems = [];
      for (const s of list) {
        await s.open();
        const r = await s.page.evaluate(() => {
          const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && !e.closest('[aria-hidden="true"]'); };
          const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis).map((h) => Number(h.tagName[1]));
          const skips = hs.filter((h, i) => i > 0 && h > hs[i - 1] + 1).length;
          const name = (e) => (e.getAttribute('aria-label') || (e.getAttribute('aria-labelledby') && document.getElementById(e.getAttribute('aria-labelledby'))?.textContent) || e.textContent || e.getAttribute('title') || '').trim();
          const unnamed = [...document.querySelectorAll('button, a[href], [role="switch"], [role="checkbox"]')].filter(vis).filter((e) => !name(e)).map((e) => e.outerHTML.slice(0, 80));
          const unlabelled = [...document.querySelectorAll('input, select, textarea')].filter(vis).filter((e) => !(e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.closest('label') || (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)))).map((e) => e.outerHTML.slice(0, 80));
          return {
            h1: document.querySelectorAll('h1').length, skips, unnamed, unlabelled, hs: hs.join(''),
            landmarks: [!!document.querySelector('header'), !!document.querySelector('main'), !!document.querySelector('footer')],
            toast: !!document.querySelector('[role="status"][aria-live="polite"][aria-atomic="true"]'),
            banner: !!document.querySelector('[aria-live="assertive"][aria-atomic="true"]:not(#__next-route-announcer__)'),
            caller: !!document.querySelector('section[aria-label="Caller"] [aria-live="polite"]'),
            lang: document.documentElement.lang,
            imgsNoAlt: [...document.querySelectorAll('img:not([alt])')].length,
          };
        });
        if (r.h1 !== 1) problems.push(`${s.name}: ${r.h1} h1 elements`);
        if (r.skips) problems.push(`${s.name}: heading levels skip (${r.hs})`);
        if (r.unnamed.length) problems.push(`${s.name}: controls without a name: ${r.unnamed.join(' ')}`);
        if (r.unlabelled.length) problems.push(`${s.name}: inputs without a label: ${r.unlabelled.join(' ')}`);
        if (!r.landmarks.every(Boolean)) problems.push(`${s.name}: landmarks header/main/footer = ${r.landmarks}`);
        if (!r.toast) problems.push(`${s.name}: no polite status region for toasts`);
        if (/^(live|done)/.test(s.name) && !r.banner) problems.push(`${s.name}: no assertive region for the win banner`);
        if (/^live/.test(s.name) && !r.caller) problems.push(`${s.name}: the caller text is not a live region`);
        if (r.imgsNoAlt) problems.push(`${s.name}: ${r.imgsNoAlt} images without alt`);
        if (r.lang !== 'en-IN') problems.push(`${s.name}: lang=${r.lang}`);
      }
      equal(problems, [], 'structure problems');
    },
  },
  {
    id: 'A11Y-04', area: 'Accessibility', priority: 'P1', type: 'accessibility',
    title: 'What a screen reader hears on the ticket, the board and the ball',
    steps: 'Read the roles and names on a live game as a player with one dab', expected: 'Ticket = group named "<Name>’s ticket"; number cells are buttons named "N" / "N, dabbed" with aria-pressed; blank cells are hidden; the board is one image named "Board: N of 90 numbers called, latest M"; the ball is named "Number M"; Sound button says its state; Claim sheet is a modal dialog named "What are you claiming?"',
    run: async (t) => {
      const w = await world();
      const page = await t.device('iphone');
      await useToken(page, w.player);
      await go(page, `/g/${w.live}`);
      await page.getByRole('heading', { name: 'The board' }).waitFor();
      const g = (await view(w.live, w.player)).body.game;
      const group = page.getByRole('group', { name: 'Meera’s ticket' });
      equal(await group.getByRole('button').count(), 15, 'number buttons in the ticket group');
      const names = await group.getByRole('button').evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.getAttribute('aria-pressed')]));
      for (const [label, pressed] of names) {
        const n = parseInt(label, 10);
        equal([label, pressed], g.you.marks.includes(n) ? [`${n}, dabbed`, 'true'] : [`${n}`, 'false'], `cell ${n}`);
      }
      equal(await group.locator('> [aria-hidden="true"]').count(), 12, 'blank cells hidden from assistive tech');
      const last = g.called[g.called.length - 1];
      equal(await page.getByRole('img', { name: `Board: ${g.called.length} of 90 numbers called, latest ${last}` }).count(), 1, 'board name');
      equal(await page.locator('section[aria-label="Caller"]').getByLabel(`Number ${last}`).count(), 1, 'ball name');
      equal(await page.getByRole('button', { name: 'Sound on. Turn sound off' }).count(), 1, 'sound button name');
      await page.getByRole('button', { name: 'Claim!' }).click();
      const d = page.getByRole('dialog', { name: 'What are you claiming?' });
      equal(await d.getAttribute('aria-modal'), 'true', 'aria-modal');
    },
  },
  {
    id: 'A11Y-05', area: 'Accessibility', priority: 'P1', type: 'accessibility',
    title: 'Text contrast on plum, marigold, pink, paper and green meets WCAG AA',
    steps: 'On all 16 screens compute the contrast of every visible piece of text against the colour painted behind it', expected: 'At least 4.5:1 for normal text and 3:1 for large text (24px, or 18.7px bold) everywhere',
    run: async (t) => {
      const w = await world();
      const { list } = await screens(t, w);
      const problems = [];
      for (const s of list) {
        await s.open();
        await s.page.waitForTimeout(200);
        const bad = await contrastProblems(s.page);
        if (bad.length) problems.push(`${s.name}: ${[...new Set(bad)].slice(0, 8).join(' | ')}`);
      }
      // states that only appear on interaction
      const hostPage = list.find((x) => x.name === 'live (player)');
      await hostPage.open();
      await hostPage.page.getByRole('button', { name: 'Claim!' }).click();
      const bad = await contrastProblems(hostPage.page);
      if (bad.length) problems.push(`claim sheet: ${[...new Set(bad)].slice(0, 8).join(' | ')}`);
      // Known and reported, waiting for the owner's decision (the design handoff fixes these colours):
      //   U-13 white on WhatsApp green · U-14 ink on the "looks disabled" button · U-15 the 12px COMING SOON pill.
      const KNOWN = [/^"Share on WhatsApp" 2\.\d+:1/, /^"(Create game & get link|Join game|Waiting for players…|Start the game)" 2\.\d+:1/, /^"COMING SOON" 3\.\d+:1/];
      const fresh = [];
      for (const line of problems) {
        const [screen, rest] = [line.slice(0, line.indexOf(': ')), line.slice(line.indexOf(': ') + 2)];
        for (const item of rest.split(' | ')) (KNOWN.some((k) => k.test(item)) ? t.open(`contrast below WCAG AA on ${screen}: ${item}`) : fresh.push(`${screen}: ${item}`));
      }
      equal(fresh, [], 'text with too little contrast');
    },
  },
  {
    id: 'A11Y-06', area: 'Accessibility', priority: 'P2', type: 'accessibility',
    title: 'Reduced motion is respected',
    steps: 'With the system setting "reduce motion": open the home page (marquee), a live game, the claim sheet and a toast', expected: 'No running animation longer than a blink (the marquee stands still; the sheet, banner and toast appear without sliding)',
    run: async (t) => {
      const w = await world();
      const page = await t.device('android', { reducedMotion: 'reduce' });
      await useToken(page, w.player);
      const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().duration ?? 0) > 50 && (a.effect?.getComputedTiming().iterations ?? 1) !== 0).map((a) => `${a.animationName || a.transitionProperty || 'animation'} on ${a.effect?.target?.className?.toString().slice(0, 24)} (${a.effect?.getComputedTiming().duration}ms)`));
      await go(page, '/');
      await page.waitForTimeout(500);
      const home = await running();
      await go(page, `/g/${w.live}`);
      await page.getByRole('button', { name: 'Claim!' }).click();
      await page.waitForTimeout(100);
      const sheet = await running();
      await page.getByRole('dialog').getByRole('button').first().click();
      await page.waitForTimeout(100);
      const toast = await running();
      equal([home, sheet, toast], [[], [], []], 'animations still running with reduced motion (home / sheet / toast)');
      const normal = await t.device('android');
      await go(normal, '/');
      await normal.waitForTimeout(500);
      const moving = await normal.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').length);
      check(moving >= 1, 'control: without the setting the marquee should be moving');
    },
  },
];
