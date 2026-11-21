// The live game: calling, the voice, dabbing, claims, the win banner, the end of the round.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { act, callUntilComplete, cell, check, drawUntil, equal, expectToast, go, needFor, sleep, spoken, table, ticketNumbers, toastNow, until, view } from '../lib.mjs';

const CALLOUTS = JSON.parse(fs.readFileSync(new URL('../../docs/design_handoff/data/number-callouts.json', import.meta.url), 'utf8'));
/** What the caller should say for n — written from the README, with the callouts from the design's seed data. */
const speechFor = (n) => `${CALLOUTS.find((c) => c.number === n).callout}! ... ${n < 10 ? `Single number, ${n}` : `${Math.floor(n / 10)} and ${n % 10}, ${n}`}`;
const banner = (page) => page.locator('[aria-live="assertive"][aria-atomic="true"]');
const myView = async (code, token) => (await view(code, token)).body.game;
/** Dab (through the screen) every called number of `nums`. */
async function dabOnScreen(page, nums) {
  for (const n of nums) {
    if ((await cell(page, n).getAttribute('aria-pressed')) !== 'true') await cell(page, n).click();
    await page.getByRole('button', { name: `${n}, dabbed`, exact: true }).waitFor();
  }
}
async function claimOnScreen(page, prize) {
  await page.getByRole('button', { name: 'Claim!' }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${prize}`) }).click();
}

export default [
  {
    id: 'LIVE-01', area: 'Live', priority: 'P0', type: 'responsive',
    title: 'Live layout: phone = caller, controls, ticket, ways to win, board, players; desktop = caller+controls+ticket+ways left, board+players right',
    steps: 'Open a live game as the host on a 360px phone and on a 1280px desktop; measure where each block is', expected: 'Phone: one column in that order. Desktop: two columns — caller, controls, ticket, Ways to win in the left one; The board and Playing in the right one, side by side with the caller',
    run: async (t) => {
      const { host, code } = await table(t, { players: ['Meera'], start: true });
      const blocks = (page) => page.evaluate(() => {
        const rect = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top + window.scrollY) }; };
        const h = (text) => [...document.querySelectorAll('h2')].find((e) => e.textContent.startsWith(text));
        return {
          caller: rect(document.querySelector('section[aria-label="Caller"]')),
          controls: rect([...document.querySelectorAll('button')].find((b) => b.textContent === 'Call next number')),
          ticket: rect(document.querySelector('[role="group"]')),
          ways: rect(h('Ways to win')), board: rect(h('The board')), players: rect(h('Playing')),
        };
      });
      await host.page.getByRole('button', { name: 'Call next number' }).waitFor();
      const m = await blocks(host.page);
      const order = Object.entries(m).sort((a, b) => a[1].y - b[1].y).map(([k]) => k);
      equal(order, ['caller', 'controls', 'ticket', 'ways', 'board', 'players'], 'phone order top to bottom');
      const desk = await t.device('desktop');
      await desk.addInitScript((tok) => window.localStorage.setItem('lpt:token', tok), host.token);
      await go(desk, `/g/${code}`);
      await desk.getByRole('button', { name: 'Call next number' }).waitFor();
      const d = await blocks(desk);
      const left = ['caller', 'controls', 'ticket', 'ways'];
      check(left.every((k) => d[k].x < 640) && d.board.x > 640 && d.players.x > 640, `desktop columns: ${JSON.stringify(d)}`);
      equal(left.slice().sort((a, b) => d[a].y - d[b].y), left, 'left column order');
      check(d.players.y > d.board.y && Math.abs(d.board.y - d.caller.y) < 60, 'board starts level with the caller; players under the board');
      await t.shot(desk, 'live-host-desktop-1280', { fullPage: true });
      await t.shot(host.page, 'live-host-360', { fullPage: true });
    },
  },
  {
    id: 'LIVE-02', area: 'Live', priority: 'P0', type: 'functional',
    title: 'Calling a number: the ball, count, callout, "Before" chips and board update on every device',
    steps: 'Host taps "Call next number" seven times (waiting for each); compare host and player screens with the server', expected: 'Each tap calls exactly one new number. Ball = latest; "N OF 90 CALLED"; callout = that number’s rhyme; "Before:" = the previous five, newest first; board: latest pink, earlier ones marked, count matches; the player sees the same within ~2 s',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      const btn = host.page.getByRole('button', { name: 'Call next number' });
      await host.page.getByText('Tap “Call next number” to begin').waitFor();
      await p.page.getByText('Waiting for Priya to call').waitFor();
      for (let i = 1; i <= 7; i++) {
        await btn.click();
        await host.page.getByText(`${i} OF 90 CALLED`).first().waitFor();
      }
      const g = await myView(code, host.token);
      equal(g.called.length, 7, 'numbers on the server');
      const last = g.called[6];
      const read = (page) => page.evaluate(() => {
        const caller = document.querySelector('section[aria-label="Caller"]');
        const board = document.querySelector('[role="img"][aria-label^="Board"]');
        const colour = (el) => getComputedStyle(el).backgroundColor;
        const cells = [...board.children];
        const base = colour(cells.find((c) => !c.className.includes('called') && !c.className.includes('latest')) ?? cells[0]);
        return {
          ball: caller.querySelector('[role="img"], [aria-label^="Number"]')?.getAttribute('aria-label'),
          text: caller.innerText.replace(/\s+/g, ' '),
          before: [...caller.querySelectorAll('span')].filter((s) => /^\d+$/.test(s.textContent) && s.children.length === 0 && s.closest('div')?.textContent.startsWith('Before')).map((s) => Number(s.textContent)),
          boardLabel: board.getAttribute('aria-label'),
          lit: cells.filter((c) => colour(c) !== base).map((c) => Number(c.textContent)).sort((a, b) => a - b),
        };
      });
      for (const [who, page] of [['host', host.page], ['player', p.page]]) {
        await page.getByText('7 OF 90 CALLED').first().waitFor({ timeout: 5000 });
        const s = await read(page);
        equal(s.ball, `Number ${last}`, `${who}: ball`);
        check(s.text.includes(CALLOUTS.find((c) => c.number === last).callout), `${who}: callout for ${last} missing in "${s.text}"`);
        equal(s.before, g.called.slice(1, 6).reverse(), `${who}: Before chips`);
        equal(s.boardLabel, `Board: 7 of 90 numbers called, latest ${last}`, `${who}: board label`);
        equal(s.lit, g.called.slice().sort((a, b) => a - b), `${who}: lit cells on the board`);
      }
      await t.shot(p.page, 'live-player-390', { fullPage: true });
      t.note(`called ${g.called.join(', ')}; both screens matched the server`);
    },
  },
  {
    id: 'LIVE-03', area: 'Live', priority: 'P0', type: 'edge',
    title: 'Double tap / frantic tapping on "Call next number" calls one number per tap that the host could see',
    steps: 'Fire 6 clicks in the same instant; then 3 bursts of double-taps 80 ms apart; then delay the server by 1.5 s and tap 5 times', expected: 'Burst of 6 → exactly 1 number. Each double-tap → 1 number. 5 taps during one slow request → 1 number. Never two numbers that the host did not see',
    run: async (t) => {
      const { code, host } = await table(t, { players: ['Meera'], start: true });
      const btn = host.page.getByRole('button', { name: 'Call next number' });
      await btn.waitFor();
      const count = async () => (await myView(code, host.token)).called.length;
      await btn.evaluate((e) => { for (let i = 0; i < 6; i++) e.click(); });
      await host.page.getByText('1 OF 90 CALLED').first().waitFor();
      await sleep(700);
      equal(await count(), 1, 'after a burst of 6 clicks');
      for (let i = 0; i < 3; i++) {
        await btn.click();
        await sleep(80);
        await btn.click();
        await sleep(900);
      }
      const afterDoubles = await count();
      check(afterDoubles >= 4 && afterDoubles <= 7, `after three double-taps: ${afterDoubles} numbers`);
      await host.page.route('**/act', async (route) => { await sleep(1500); await route.continue(); });
      const before = await count();
      for (let i = 0; i < 5; i++) { await btn.click(); await sleep(100); }
      await sleep(2500);
      equal(await count(), before + 1, 'five taps during one slow request');
      t.note(`burst of 6 → 1 number; three human double-taps → ${afterDoubles - 1} numbers (a second tap after the first answer is a real second call); 5 taps on a slow line → 1`);
    },
  },
  {
    id: 'LIVE-04', area: 'Live', priority: 'P0', type: 'functional',
    title: 'The voice caller says the right words; Sound off silences it at once and is remembered',
    steps: 'With a speech spy installed: call numbers until a single-digit and a two-digit number have come; read what each device was asked to say; switch Sound off on the player; call again; reload', expected: 'For each number: "<rhyme>! ... Single number, 7" or "<rhyme>! ... 4 and 2, 42" at rate 0.95, pitch 1.15, cutting off the previous one. Only the newest number is spoken when several arrive together. Muted device: nothing spoken, also after a reload. Joining/starting speaks a silent unlock utterance (for iPhones)',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'] });
      const all = (page) => page.evaluate(() => window.__said);
      await host.page.getByRole('button', { name: 'Start the game' }).click();
      await host.page.getByRole('button', { name: 'Call next number' }).waitFor();
      const unlock = (await all(host.page)).filter((u) => u.volume === 0);
      check(unlock.length >= 1, 'tapping Start did not make the silent "unlock" utterance needed on iPhones');
      const btn = host.page.getByRole('button', { name: 'Call next number' });
      let g;
      let seenSingle = false;
      let seenDouble = false;
      for (let i = 1; i <= 60 && !(seenSingle && seenDouble && i > 6); i++) {
        await btn.click();
        await host.page.getByText(`${i} OF 90 CALLED`).first().waitFor();
        g = await myView(code, host.token);
        const n = g.called[i - 1];
        if (n < 10) seenSingle = true; else seenDouble = true;
        const said = await spoken(host.page);
        equal(said[said.length - 1], speechFor(n), `host device, number ${n}`);
      }
      const hostSaid = await spoken(host.page);
      equal(hostSaid, g.called.map(speechFor), 'everything the host device said, in order');
      const raw = (await all(host.page)).filter((u) => !u.cancel && u.volume !== 0);
      check(raw.every((u) => Math.abs(u.rate - 0.95) < 0.001 && Math.abs(u.pitch - 1.15) < 0.001 && /^en/i.test(u.lang)), `rate/pitch/lang: ${JSON.stringify(raw[0])}`);
      check((await all(host.page)).filter((u) => u.cancel).length >= g.called.length, 'each new number cuts off the previous one');
      // The player polls every 1.5 s: it must say the newest number, never a queue of old ones.
      await p.page.getByText(`${g.called.length} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
      const playerSaid = await spoken(p.page);
      equal(playerSaid[playerSaid.length - 1], speechFor(g.called[g.called.length - 1]), 'player device says the latest number');
      check(playerSaid.every((s) => g.called.map(speechFor).includes(s)), 'player device said something that was not called');
      // Mute on the player.
      await p.page.getByRole('button', { name: 'Sound on. Turn sound off' }).click();
      const before = (await spoken(p.page)).length;
      await btn.click();
      await p.page.getByText(`${g.called.length + 1} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
      await sleep(300);
      equal((await spoken(p.page)).length, before, 'a muted device says nothing');
      await p.page.reload();
      await p.page.getByRole('button', { name: 'Sound off. Turn sound on' }).waitFor();
      await btn.click();
      await p.page.getByText(`${g.called.length + 2} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
      await sleep(300);
      equal((await spoken(p.page)).length, 0, 'still muted after a reload');
      t.note(`${g.called.length} numbers checked on the host (single digit seen: ${seenSingle}); e.g. "${hostSaid[0]}"; player said ${playerSaid.length} of them (it polls), always the newest`);
    },
  },
  {
    id: 'LIVE-05', area: 'Live', priority: 'P0', type: 'functional',
    title: 'Dabbing: only called numbers; tap again to undo; the dab is kept on refresh',
    steps: 'Player taps a number that has not been called; host calls until one of the player’s numbers comes; player taps it, taps again, taps again; refreshes', expected: 'Uncalled → toast "N hasn’t been called yet", no dab, no request. Called → pink dab at once (aria-pressed, "N, dabbed"); second tap removes it; after refresh the dab is still there. Hint line under the ticket. Other devices never see it',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await p.page.getByText('Meera’s ticket').waitFor();
      await p.page.getByText('Tap a number when it’s called. Tap Claim when you have a pattern.').waitFor();
      const mine = ticketNumbers((await myView(code, p.token)).you.ticket);
      let marks = 0;
      p.page.on('request', (r) => { if ((r.postData() || '').includes('"mark"')) marks++; });
      await cell(p.page, mine[0]).click();
      await expectToast(p.page, `${mine[0]} hasn’t been called yet`);
      equal(await cell(p.page, mine[0]).getAttribute('aria-pressed'), 'false', 'no dab on an uncalled number');
      equal(marks, 0, 'no request for an uncalled number');
      const called = await drawUntil(code, host.token, (c) => mine.some((n) => c.includes(n)));
      const n = mine.find((x) => called.includes(x));
      await p.page.getByText(`${called.length} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
      const t0 = Date.now();
      await cell(p.page, n).click();
      await p.page.getByRole('button', { name: `${n}, dabbed`, exact: true }).waitFor();
      const shownIn = Date.now() - t0;
      const colours = await cell(p.page, n).locator('span').first().evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).color]);
      check(colours[0] !== 'rgba(0, 0, 0, 0)', `the dab has no colour: ${colours}`);
      await sleep(400);
      equal((await myView(code, p.token)).you.marks, [n], 'server has the dab');
      await cell(p.page, n).click();
      await until(async () => (await cell(p.page, n).getAttribute('aria-pressed')) === 'false', 'dab removed on the second tap');
      await sleep(400);
      equal((await myView(code, p.token)).you.marks, [], 'server: dab removed');
      await cell(p.page, n).click();
      await sleep(400);
      await p.page.reload();
      await p.page.getByRole('button', { name: `${n}, dabbed`, exact: true }).waitFor();
      check(!JSON.stringify({ ...(await myView(code, host.token)), you: null }).includes('marks'), 'the host’s view carries marks');
      t.note(`number ${n}: dab drawn ${shownIn} ms after the tap; undo and re-dab confirmed by the server; kept after refresh`);
    },
  },
  {
    id: 'LIVE-06', area: 'Live', priority: 'P0', type: 'edge',
    title: 'Rapid tapping on the ticket ends in the right state; a dab the server refuses is rolled back with a message',
    steps: 'Tap one called number 9 times as fast as possible, then 10 times; tap 3 different called numbers at once. Then make the server refuse a dab (400), then cut the network', expected: 'Odd number of taps → dabbed, even → not; screen and server agree after the burst; three quick dabs all stay. Refused → the dab disappears and the server’s message shows; offline → dab disappears + "Can’t reach the game — check your internet"',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      const mine = ticketNumbers((await myView(code, p.token)).you.ticket);
      const called = await drawUntil(code, host.token, (c) => mine.filter((n) => c.includes(n)).length >= 5);
      const hit = mine.filter((n) => called.includes(n));
      await p.page.getByText(`${called.length} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
      const burst = (n, times) => cell(p.page, n).evaluate((e, k) => { for (let i = 0; i < k; i++) e.click(); }, times);
      await burst(hit[0], 9);
      equal(await cell(p.page, hit[0]).getAttribute('aria-pressed'), 'true', 'dabbed right after 9 taps (optimistic)');
      await until(async () => JSON.stringify((await myView(code, p.token)).you.marks) === JSON.stringify([hit[0]]), 'server agrees after 9 taps', 6000);
      equal(await cell(p.page, hit[0]).getAttribute('aria-pressed'), 'true', 'still dabbed once the server has answered');
      await burst(hit[0], 10); // an even number of taps: back where it was (dabbed)
      await sleep(1500);
      equal([(await myView(code, p.token)).you.marks, await cell(p.page, hit[0]).getAttribute('aria-pressed')], [[hit[0]], 'true'], 'still dabbed after 10 more taps (even)');
      await burst(hit[0], 7);
      equal(await cell(p.page, hit[0]).getAttribute('aria-pressed'), 'false', 'un-dabbed right after 7 more taps');
      await until(async () => (await myView(code, p.token)).you.marks.length === 0, 'server agrees after 7 more taps', 6000);
      await sleep(600);
      equal(await cell(p.page, hit[0]).getAttribute('aria-pressed'), 'false', 'still un-dabbed once the server has answered');
      for (const n of hit.slice(1, 4)) await cell(p.page, n).click({ noWaitAfter: true }); // three different numbers, as fast as a finger can
      await until(async () => (await myView(code, p.token)).you.marks.length === 3, `three quick dabs saved (server has ${JSON.stringify((await myView(code, p.token)).you.marks)}, wanted ${hit.slice(1, 4)})`, 6000);
      for (const n of hit.slice(1, 4)) equal(await cell(p.page, n).getAttribute('aria-pressed'), 'true', `dab ${n} stays`);
      // Server refusal → rollback.
      let mode = 'refuse';
      await p.page.route('**/act', async (route) => {
        if (!(route.request().postData() || '').includes('"mark"')) return route.continue();
        if (mode === 'refuse') return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ ok: false, error: `${hit[4]} hasn’t been called yet`, code: 'invalid' }) });
        return route.abort('internetdisconnected');
      });
      await cell(p.page, hit[4]).click();
      await expectToast(p.page, `${hit[4]} hasn’t been called yet`);
      await until(async () => (await cell(p.page, hit[4]).getAttribute('aria-pressed')) === 'false', 'refused dab rolled back');
      mode = 'offline';
      await sleep(2500);
      await cell(p.page, hit[4]).click();
      await expectToast(p.page, 'Can’t reach the game — check your internet');
      await until(async () => (await cell(p.page, hit[4]).getAttribute('aria-pressed')) === 'false', 'offline dab rolled back');
      equal((await myView(code, p.token)).you.marks.length, 3, 'server untouched by the failed dabs');
    },
  },
  {
    id: 'LIVE-07', area: 'Live', priority: 'P0', type: 'usability',
    title: 'Ticket cells are big enough to tap on small phones, and a tap near the edge never hits the neighbour',
    steps: 'At 320, 360, 390 and 412 px wide: measure every number cell; call all 90 numbers except the last; tap each of the 15 numbers 3 px inside its left, right, top and bottom edges', expected: 'Cells at least 44px tall and at least 30px wide at 320 / 34px at 360; no sideways scrolling; every edge tap dabs exactly the tapped number (60 taps per width, 0 wrong)',
    run: async (t) => {
      const sizes = {};
      for (const width of [320, 360, 390, 412]) {
        const { code, host, players: [p] } = await table(t, { input: { prizes: ['full'] }, players: ['Meera'], kinds: ['android'], start: true });
        await p.page.setViewportSize({ width, height: 760 });
        await drawUntil(code, host.token, (c) => c.length >= 89);
        await p.page.getByText('89 OF 90 CALLED').first().waitFor({ timeout: 5000 });
        const g = await myView(code, p.token);
        const mine = ticketNumbers(g.you.ticket).filter((n) => g.called.includes(n));
        const boxes = await p.page.locator('[role="group"] button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { n: Number(e.textContent), w: r.width, h: r.height }; }));
        const minW = Math.min(...boxes.map((b) => b.w));
        const minH = Math.min(...boxes.map((b) => b.h));
        sizes[width] = `${minW.toFixed(1)}×${minH.toFixed(1)}`;
        check(minH >= 44, `${width}px: cells are ${minH.toFixed(1)}px tall`);
        check(minW >= (width <= 320 ? 30 : 34), `${width}px: cells are ${minW.toFixed(1)}px wide`);
        equal(await p.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, `${width}px: sideways overflow`);
        let taps = 0;
        for (const n of mine) {
          for (const [fx, fy] of [[3, null], [-3, null], [null, 3], [null, -3]]) {
            const before = (await myView(code, p.token)).you.marks;
            const box = await cell(p.page, n).boundingBox();
            const x = fx === null ? box.width / 2 : fx > 0 ? fx : box.width + fx;
            const y = fy === null ? box.height / 2 : fy > 0 ? fy : box.height + fy;
            await cell(p.page, n).tap({ position: { x, y } });
            taps++;
            const want = before.includes(n) ? before.filter((m) => m !== n) : [...before, n];
            await until(async () => JSON.stringify((await myView(code, p.token)).you.marks.slice().sort()) === JSON.stringify(want.slice().sort()), `${width}px: tap at (${x.toFixed(0)},${y.toFixed(0)}) of ${n} changed exactly ${n}`, 4000, 40);
          }
        }
        if (width === 360) await t.shot(p.page, 'ticket-360', { clip: await p.page.locator('[role="group"]').first().evaluate((e) => { const r = e.parentElement.parentElement.getBoundingClientRect(); return { x: Math.max(0, r.left), y: Math.max(0, r.top), width: Math.min(r.width, 360), height: r.height }; }) }).catch(() => undefined);
        check(taps >= 56, `only ${taps} edge taps made at ${width}px`);
        await p.page.context().close();
        await host.page.context().close();
      }
      t.note(`smallest cell (w×h) by screen width: ${JSON.stringify(sizes)}; 4 edge taps × every called number × 4 widths, none hit a neighbour`);
    },
  },
  {
    id: 'CLM-01', area: 'Claims', priority: 'P0', type: 'functional',
    title: 'Claim sheet: lists the open prizes; a claim that is not complete gets the gentle message and nothing else happens',
    steps: 'Player taps Claim!; reads the sheet; closes it with Escape and by tapping outside; opens it and claims Top Line with nothing dabbed', expected: 'Sheet "What are you claiming?" / "We’ll check your ticket instantly." with one button per open prize (name + rule, ≥ 60px), focus inside the sheet, page behind does not scroll; Escape and outside-tap close it and focus returns to Claim!; wrong claim → toast "Not yet for Top Line — keep playing!"; no banner on any device',
    run: async (t) => {
      const { host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      const claim = p.page.getByRole('button', { name: 'Claim!' });
      await claim.click();
      const sheet = p.page.getByRole('dialog', { name: 'What are you claiming?' });
      await sheet.waitFor();
      await sheet.getByText('We’ll check your ticket instantly.').waitFor();
      equal(await sheet.getByRole('button').evaluateAll((els) => els.map((e) => e.innerText.replace(/\n+/g, ' — '))), ['Early Five — Any 5 numbers', 'Top Line — All 5 numbers of the top line', 'Middle Line — All 5 numbers of the middle line', 'Bottom Line — All 5 numbers of the bottom line', 'Four Corners — First & last of top and bottom lines', 'Full House — All 15 numbers'], 'sheet options');
      const hs = await sheet.getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      check(Math.min(...hs) >= 60, `option height ${Math.min(...hs)}`);
      check(await p.page.evaluate(() => document.querySelector('[role=dialog]').contains(document.activeElement)), 'focus is not inside the sheet');
      equal(await p.page.evaluate(() => document.body.style.overflow), 'hidden', 'page scroll locked');
      for (let i = 0; i < 8; i++) await p.page.keyboard.press('Tab');
      check(await p.page.evaluate(() => document.querySelector('[role=dialog]').contains(document.activeElement)), 'Tab left the sheet');
      await p.page.keyboard.press('Escape');
      await sheet.waitFor({ state: 'detached' });
      check(await claim.evaluate((e) => e === document.activeElement), 'focus did not return to Claim!');
      await claim.click();
      await p.page.mouse.click(20, 20);
      await sheet.waitFor({ state: 'detached' });
      await claim.click();
      await sheet.getByRole('button', { name: /^Top Line/ }).click();
      await expectToast(p.page, 'Not yet for Top Line — keep playing!');
      await sheet.waitFor({ state: 'detached' });
      await sleep(1800);
      equal([await banner(p.page).innerText(), await banner(host.page).innerText()], ['', ''], 'no banner after a wrong claim');
      await claim.click();
      await t.shot(p.page, 'claim-sheet-390');
    },
  },
  {
    id: 'CLM-02', area: 'Claims', priority: 'P0', type: 'functional',
    title: 'A valid claim: banner on every device for 5 seconds, voice line, winner shown in Ways to win and Playing, nobody is moved away',
    steps: 'Call numbers until the player’s top line is out; the player dabs it and claims Top Line; watch host, winner and a third player; time the banner', expected: 'All three show "Meera wins Top Line!" / "Checked and confirmed ✓" within ~2 s, for about 5 s (4–6.5 s); voice "Meera wins Top Line!"; Ways to win: "Meera" ("Meera (you)" on her phone); Playing: Top Line under her name with the amount; the URL and screen stay; the prize is gone from the claim sheet; claiming it again says "Meera already won Top Line"',
    run: async (t) => {
      const { code, host, players: [p, q] } = await table(t, { input: { price: 100 }, players: ['Meera', 'Nani'], start: true, prepare: callUntilComplete(0, 'top') });
      const g0 = await myView(code, p.token);
      const top = needFor(g0.you.ticket, 'top').nums;
      await p.page.getByText(new RegExp(`^${(await myView(code, host.token)).called.length} OF 90 CALLED`)).first().waitFor({ timeout: 5000 });
      await dabOnScreen(p.page, top);
      const urls = [host.page.url(), p.page.url(), q.page.url()];
      await claimOnScreen(p.page, 'Top Line');
      const t0 = Date.now();
      const seen = {};
      for (const [who, page] of [['winner', p.page], ['host', host.page], ['other', q.page]]) {
        await banner(page).getByText('Meera wins Top Line!').waitFor({ timeout: 5000 });
        seen[who] = Date.now() - t0;
        check((await banner(page).innerText()).includes('Checked and confirmed ✓'), `${who}: banner second line`);
      }
      await t.shot(q.page, 'win-banner-other-player');
      const gone = {};
      for (const [who, page] of [['winner', p.page], ['host', host.page], ['other', q.page]]) {
        await until(async () => (await banner(page).innerText()) === '', `${who}: banner gone`, 9000, 50);
        gone[who] = Date.now() - t0;
        check(gone[who] - seen[who] <= 6500 && gone[who] >= 4000, `${who}: banner showed from ${seen[who]} to ${gone[who]} ms`);
      }
      equal([host.page.url(), p.page.url(), q.page.url()], urls, 'nobody was navigated away');
      for (const page of [host.page, p.page, q.page]) await until(async () => (await spoken(page)).includes('Meera wins Top Line!'), 'voice line "Meera wins Top Line!"', 4000);
      const amount = (await myView(code, host.token)).prizes.find((x) => x.id === 'top').amount;
      const rupee = `₹${amount}`;
      const waysRow = (page) => page.locator('li', { hasText: 'All 5 numbers of the top line' }).innerText();
      check(/Meera \(you\)/.test(await waysRow(p.page)), `winner’s Ways to win row: ${await waysRow(p.page)}`);
      check(/Meera$/.test((await waysRow(host.page)).trim()), `host’s Ways to win row: ${await waysRow(host.page)}`);
      const playing = await q.page.locator('section', { has: q.page.getByRole('heading', { name: /^Playing/ }) }).locator('li', { hasText: 'Meera' }).innerText();
      check(playing.includes('Top Line') && playing.includes(rupee), `Playing row for Meera: ${playing.replace(/\n/g, ' | ')}`);
      await q.page.getByRole('button', { name: 'Claim!' }).click();
      equal(await q.page.getByRole('dialog').getByRole('button', { name: /^Top Line/ }).count(), 0, 'won prize still offered in the sheet');
      await q.page.keyboard.press('Escape');
      const again = await act(code, q.token, { type: 'claim', prizeId: 'top' });
      equal(again.body.error, 'Meera already won Top Line', 'second claim');
      t.note(`banner appeared after ${JSON.stringify(seen)} ms and left after ${JSON.stringify(gone)} ms; Top Line amount ${rupee}`);
    },
  },
  {
    id: 'CLM-03', area: 'Claims', priority: 'P0', type: 'concurrency',
    title: 'Two phones claim the same prize at the same moment through the screen: one banner, one winner, the other is told who won',
    steps: 'Two players both complete Early Five; both open the sheet; both tap "Early Five" together', expected: 'Exactly one name wins everywhere; the other phone shows "<winner> already won Early Five"; both show the same banner',
    run: async (t) => {
      const { code, host, players: [a, b] } = await table(t, { input: { hostPlays: false, prizes: ['early5', 'full'] }, players: ['Asha', 'Bina'], start: true });
      const called = await drawUntil(code, host.token, (c) => c.length >= 70);
      for (const s of [a, b]) {
        await s.page.getByText('70 OF 90 CALLED').first().waitFor({ timeout: 5000 });
        const mine = ticketNumbers((await myView(code, s.token)).you.ticket).filter((n) => called.includes(n)).slice(0, 5);
        await dabOnScreen(s.page, mine);
        await s.page.getByRole('button', { name: 'Claim!' }).click();
        await s.page.getByRole('dialog').waitFor();
      }
      // Record every toast either phone shows from now on.
      const lostToast = [];
      for (const s of [a, b]) {
        await s.page.exposeFunction('__toast', (text) => lostToast.push(text));
        await s.page.evaluate(() => new MutationObserver(() => { const el = document.querySelector('[role="status"][aria-live="polite"][aria-atomic="true"]'); if (el?.textContent) window.__toast(el.textContent); }).observe(document.body, { childList: true, subtree: true, characterData: true }));
      }
      await Promise.all([a, b].map((s) => s.page.getByRole('dialog').getByRole('button', { name: /^Early Five/ }).click()));
      await banner(a.page).getByText(/wins Early Five!/).waitFor({ timeout: 5000 });
      const g = await myView(code, host.token);
      const winner = g.prizes[0].winnerName;
      const loser = winner === 'Asha' ? b : a;
      check(['Asha', 'Bina'].includes(winner), `winner: ${winner}`);
      equal(g.events.filter((e) => e.kind === 'win').length, 1, 'win events');
      for (const s of [a, b]) await banner(s.page).getByText(`${winner} wins Early Five!`).waitFor({ timeout: 5000 });
      check(lostToast.some((x) => x.includes(`${winner} already won Early Five`)), `the other phone was not told who won; toasts seen: ${JSON.stringify(lostToast)}`);
      t.note(`both tapped together; ${winner} won`);
    },
  },
  {
    id: 'CLM-04', area: 'Claims', priority: 'P0', type: 'functional',
    title: 'Dabs of numbers that were never called cannot help a claim; a host without a ticket has nothing to claim',
    steps: 'A) Tamper: send dabs for uncalled numbers straight to the server, then claim. B) Host without a ticket looks at the live screen', expected: 'A) every uncalled dab refused; claim → "Not yet…". B) no ticket, no Claim! button, no claim sheet; the host can still call numbers; Playing lists the host first as "Host · calling numbers · you"',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { input: { hostPlays: false, prizes: ['early5', 'full'] }, players: ['Meera'], start: true });
      const mine = ticketNumbers((await myView(code, p.token)).you.ticket);
      for (const n of mine) equal((await act(code, p.token, { type: 'mark', n, on: true })).status, 400, `uncalled dab ${n}`);
      equal((await act(code, p.token, { type: 'claim', prizeId: 'early5' })).body.code, 'not_yet', 'claim with only uncalled dabs');
      await host.page.getByRole('button', { name: 'Call next number' }).waitFor();
      equal([await host.page.getByRole('button', { name: 'Claim!' }).count(), await host.page.locator('[role="group"] button').count()], [0, 0], 'host without a ticket: claim button / ticket cells');
      const first = await host.page.locator('section', { has: host.page.getByRole('heading', { name: /^Playing/ }) }).locator('li').first().innerText();
      check(/Priya/.test(first) && /Host · calling numbers · you/.test(first), `first row of Playing: ${first.replace(/\n/g, ' | ')}`);
      await host.page.getByRole('button', { name: 'Call next number' }).click();
      await host.page.getByText('1 OF 90 CALLED').first().waitFor();
      const pFirst = await p.page.locator('section', { has: p.page.getByRole('heading', { name: /^Playing/ }) }).locator('li').first().innerText();
      check(/Host · calling numbers$/.test(pFirst.trim()), `player sees: ${pFirst.replace(/\n/g, ' | ')}`);
      await t.shot(host.page, 'live-host-no-ticket', { fullPage: true });
    },
  },
  {
    id: 'CLM-05', area: 'Claims', priority: 'P0', type: 'functional',
    title: 'The last prize: the banner carries over to the results screen on every device',
    steps: 'One prize (Early Five). The player completes and claims it', expected: 'Every device switches to "That’s the game!" without a reload, and still shows "Meera wins Early Five!" for the rest of its 5 seconds, with the voice line; a device that opens the game a few seconds later shows no banner',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { input: { prizes: ['early5'] }, players: ['Meera'], start: true });
      const called = await drawUntil(code, host.token, (c) => c.length >= 60);
      await p.page.getByText('60 OF 90 CALLED').first().waitFor({ timeout: 5000 });
      const mine = ticketNumbers((await myView(code, p.token)).you.ticket).filter((n) => called.includes(n)).slice(0, 5);
      await dabOnScreen(p.page, mine);
      await claimOnScreen(p.page, 'Early Five');
      for (const page of [p.page, host.page]) {
        await page.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 5000 });
        await banner(page).getByText('Meera wins Early Five!').waitFor({ timeout: 3000 });
      }
      await t.shot(host.page, 'results-with-banner-host');
      await until(async () => (await spoken(host.page)).includes('Meera wins Early Five!'), 'voice line on the results screen', 4000);
      await until(async () => (await banner(host.page).innerText()) === '', 'banner leaves the results screen', 8000);
      await sleep(1000);
      await host.page.reload();
      await host.page.getByRole('heading', { name: 'That’s the game!' }).waitFor();
      await sleep(800);
      equal(await banner(host.page).innerText(), '', 'no banner for an old win after a reload');
    },
  },
  {
    id: 'LIVE-08', area: 'Live', priority: 'P0', type: 'functional',
    title: 'The 90th number ends the round for everyone; the call button cannot go past 90',
    steps: 'Call 89 numbers (API); the host taps "Call next number" for the 90th', expected: 'After the 90th: results screen on host and player ("90 of 90 numbers called."), prizes nobody claimed read "Open", auto-call off; no error',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await act(code, host.token, { type: 'setAuto', auto: 10 });
      await drawUntil(code, host.token, (c) => c.length >= 89);
      await host.page.getByText('89 OF 90 CALLED').first().waitFor({ timeout: 5000 });
      await host.page.getByRole('button', { name: 'Call next number' }).click();
      for (const page of [host.page, p.page]) {
        await page.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 5000 });
        await page.getByText('90 of 90 numbers called. Settle any prize money between yourselves — the app never handles payments.').waitFor();
      }
      const g = await myView(code, host.token);
      equal([g.status, g.auto, g.called.length], ['done', 0, 90], 'server');
      equal(await host.page.locator('li', { hasText: 'Open' }).count(), 6, 'unclaimed prizes read "Open"');
      equal(host.page.consoleErrors.concat(p.page.consoleErrors), [], 'console errors');
    },
  },
  {
    id: 'LIVE-09', area: 'Live', priority: 'P0', type: 'resilience',
    title: 'A phone that sleeps, loses signal or switches apps catches up when it comes back',
    steps: 'Player goes offline; host calls 4 numbers; player comes back online. Then the player’s tab is hidden while 3 more are called and shown again. Then a second tab of the same player', expected: 'While offline: the last screen stays and a toast says "Can’t reach the game — check your internet". Back online: the latest number, count, board and Before chips are right within ~5 s, without a reload; only the newest number is spoken. A hidden tab does not poll; when shown it catches up at once',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await drawUntil(code, host.token, (c) => c.length >= 2);
      await p.page.getByText('2 OF 90 CALLED').first().waitFor({ timeout: 5000 });
      await p.page.context().setOffline(true);
      await expectToast(p.page, 'Can’t reach the game — check your internet', 9000);
      await drawUntil(code, host.token, (c) => c.length >= 6);
      equal(await p.page.getByText('2 OF 90 CALLED').count() > 0, true, 'last screen stays while offline');
      const saidBefore = (await spoken(p.page)).length;
      await p.page.context().setOffline(false);
      const t0 = Date.now();
      await p.page.getByText('6 OF 90 CALLED').first().waitFor({ timeout: 8000 });
      const back = Date.now() - t0;
      const g = await myView(code, host.token);
      equal(await p.page.locator('section[aria-label="Caller"] [aria-label^="Number"]').getAttribute('aria-label'), `Number ${g.called[5]}`, 'ball after reconnect');
      const said = (await spoken(p.page)).slice(saidBefore);
      equal(said, [speechFor(g.called[5])], 'only the newest number is spoken after catching up');
      // Hidden tab: no polling; visible again: immediate refetch.
      let gets = 0;
      p.page.on('request', (r) => { if (r.method() === 'GET' && r.url().includes('/api/games/')) gets++; });
      const setVisibility = (state) => p.page.evaluate((s) => { Object.defineProperty(document, 'visibilityState', { value: s, configurable: true }); Object.defineProperty(document, 'hidden', { value: s === 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, state);
      await setVisibility('hidden');
      await sleep(1600);
      gets = 0;
      await drawUntil(code, host.token, (c) => c.length >= 9);
      await sleep(4000);
      equal(gets, 0, 'requests while the tab is hidden');
      equal(await p.page.getByText('6 OF 90 CALLED').count() > 0, true, 'screen unchanged while hidden');
      await setVisibility('visible');
      const t1 = Date.now();
      await p.page.getByText('9 OF 90 CALLED').first().waitFor({ timeout: 4000 });
      t.note(`caught up ${back} ms after the network returned and ${Date.now() - t1} ms after the tab was shown again`);
    },
  },
  {
    id: 'LIVE-10', area: 'Live', priority: 'P1', type: 'performance',
    title: 'Polling fallback (no realtime): one request about every 1.5 s, nothing piles up, updates arrive within ~2 s',
    steps: 'Count this device’s GET requests for 12 s on the live screen; then measure how long a called number takes to show on a player phone, 8 times', expected: '6–10 requests in 12 s; never two at once; a new number shows on the player within 2.2 s every time (average under 1.3 s)',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await p.page.getByText('Waiting for Priya to call').waitFor();
      let gets = 0;
      let inflight = 0;
      let maxInflight = 0;
      p.page.on('request', (r) => { if (r.method() === 'GET' && r.url().includes('/api/games/')) { gets++; inflight++; maxInflight = Math.max(maxInflight, inflight); } });
      p.page.on('requestfinished', (r) => { if (r.method() === 'GET' && r.url().includes('/api/games/')) inflight--; });
      await sleep(12000);
      check(gets >= 6 && gets <= 10, `${gets} polls in 12 s`);
      equal(maxInflight, 1, 'requests in flight at once');
      const delays = [];
      for (let i = 1; i <= 8; i++) {
        await sleep(Math.random() * 1500);
        await act(code, host.token, { type: 'draw' });
        const t0 = Date.now();
        await p.page.getByText(`${i} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
        delays.push(Date.now() - t0);
      }
      const avg = Math.round(delays.reduce((a, b) => a + b, 0) / delays.length);
      check(Math.max(...delays) <= 2200 && avg <= 1300, `delays ${delays} (avg ${avg})`);
      t.note(`${gets} polls in 12 s; a called number reached the player after ${delays.join(', ')} ms (average ${avg} ms)`);
    },
  },
  {
    id: 'LIVE-11', area: 'Live', priority: 'P1', type: 'functional',
    title: 'Ways to win and Playing show prize money: automatic split at start, a late joiner raises only open prizes',
    steps: 'Price ₹100, host + 1 player; start; read amounts on screen; win Early Five; a third person joins late; read again', expected: 'Amounts on screen add up to ₹200 at start; after the late joiner the won prize keeps its amount and the open ones add up to ₹300 minus it; Playing shows the winner’s total; lobby showed no amounts before start',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { input: { price: 100 }, players: ['Meera'] });
      await host.page.getByRole('heading', { name: 'Ways to win' }).waitFor();
      check(!/₹/.test(await host.page.locator('section', { has: host.page.getByRole('heading', { name: 'Ways to win' }) }).innerText()), 'amounts shown in the lobby before the split');
      await host.page.getByRole('button', { name: 'Start the game' }).click();
      await host.page.getByRole('button', { name: 'Call next number' }).waitFor();
      const onScreen = async (page) => (await page.locator('section', { has: page.getByRole('heading', { name: 'Ways to win' }) }).locator('li').allInnerTexts()).map((s) => Number((s.match(/₹([\d,]+)/) || [0, '0'])[1].replace(/,/g, '')));
      const start = await onScreen(host.page);
      equal(start.reduce((a, b) => a + b, 0), 200, `amounts at start ${start}`);
      const called = await drawUntil(code, host.token, (c) => c.length >= 60);
      await p.page.getByText('60 OF 90 CALLED').first().waitFor({ timeout: 5000 });
      await dabOnScreen(p.page, ticketNumbers((await myView(code, p.token)).you.ticket).filter((n) => called.includes(n)).slice(0, 5));
      await claimOnScreen(p.page, 'Early Five');
      await banner(host.page).getByText('Meera wins Early Five!').waitFor({ timeout: 5000 });
      await act(code, crypto.randomUUID(), { type: 'join', name: 'Late' });
      await host.page.getByRole('heading', { name: 'Playing · 3' }).waitFor({ timeout: 5000 });
      const after = await onScreen(host.page);
      equal(after[0], start[0], 'won prize keeps its amount');
      equal(after.reduce((a, b) => a + b, 0), 300, `amounts after the late joiner ${after}`);
      const row = await host.page.locator('section', { has: host.page.getByRole('heading', { name: /^Playing/ }) }).locator('li', { hasText: 'Meera' }).innerText();
      check(row.includes(`₹${start[0]}`) && row.includes('Early Five'), `Playing row: ${row.replace(/\n/g, ' | ')}`);
      t.note(`start ${start.join('/')} → after late joiner ${after.join('/')}`);
      await t.shot(host.page, 'live-amounts-late-joiner', { fullPage: true });
    },
  },
  {
    id: 'LIVE-12', area: 'Live', priority: 'P1', type: 'functional',
    title: 'One player wins several prizes: all are listed with the total',
    steps: 'Classic game at ₹50 × 2; the same player claims Early Five, then Top Line', expected: 'Playing row shows both prize names and the sum of both amounts; Ways to win shows her name on both rows',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { input: { price: 50 }, players: ['Meera'], start: true, prepare: callUntilComplete(0, 'top') });
      const tk = (await myView(code, p.token)).you.ticket;
      const called = (await myView(code, host.token)).called;
      for (const n of ticketNumbers(tk).filter((x) => called.includes(x))) await act(code, p.token, { type: 'mark', n, on: true });
      const c1 = await act(code, p.token, { type: 'claim', prizeId: 'early5' });
      const c2 = await act(code, p.token, { type: 'claim', prizeId: 'top' });
      check(c1.body.ok && c2.body.ok, `claims: ${c1.text.slice(0, 120)} / ${c2.text.slice(0, 120)}`);
      const g = c2.body.game;
      const total = g.prizes.filter((x) => x.winnerPid === g.you.pid).reduce((a, x) => a + x.amount, 0);
      const row = host.page.locator('section', { has: host.page.getByRole('heading', { name: /^Playing/ }) }).locator('li', { hasText: 'Meera' });
      await until(async () => (await row.innerText()).includes('Top Line'), 'host sees both wins', 5000);
      const text = (await row.innerText()).replace(/\n/g, ' | ');
      check(text.includes('Early Five, Top Line') && text.includes(`₹${total}`), `Playing row: ${text} (total should be ₹${total})`);
    },
  },
];
