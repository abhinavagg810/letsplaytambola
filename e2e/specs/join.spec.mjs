// Joining a game (by link, by code) and the lobby.
import { BASE, act, addressFor, api, check, createGame, drawUntil, equal, expectToast, go, hostThroughUi, hydrated, joinThroughUi, newToken, table, ticketNumbers, toastNow, tokenOf, until, useToken, view } from '../lib.mjs';

const ticketOnPage = (page) => page.locator('[role="group"]').first().evaluate((g) => [...g.children].map((c) => (c.getAttribute('aria-hidden') ? 0 : parseInt(c.textContent, 10))));

export default [
  {
    id: 'JOIN-01', area: 'Join', priority: 'P0', type: 'functional',
    title: 'Join with a code (/join): the code field cleans what is typed; "Find my game" opens the invite',
    steps: 'Open /join; read both cards; submit empty; type lower case, spaces, symbols, 8 characters, a pasted link; submit a real code', expected: 'Cards "Join a game" and "Host your own" (→ /host); empty → toast "Type the game code"; input is upper-cased, letters/digits only, max 6; pasted link gives its code; a real code opens "<host> invited you to <game>"',
    run: async (t) => {
      const code = await createGame(newToken(), { hostName: 'Priya', name: 'Kitty Party', price: 100 });
      const page = await t.device('android');
      await go(page, '/join');
      await hydrated(page);
      const body = await page.locator('body').innerText();
      for (const s of ['Join a game', 'Type the 5-letter code from your host. Or just tap the link they sent you.', 'Find my game', 'Host your own', 'Host a game']) check(body.includes(s), `"${s}" missing on /join`);
      await page.getByRole('button', { name: 'Find my game' }).click();
      await expectToast(page, 'Type the game code');
      const box = page.getByLabel('Game code');
      for (const [typed, want] of [['k7rq2', 'K7RQ2'], [' k7 rq-2 ', 'K7RQ2'], ['abcdefgh', 'ABCDEF'], ['!!@@', ''], [`https://letsplaytambola.com/g/${code.toLowerCase()}`, code], [`${BASE}/g/${code}?utm=1#x`, code], ['letsplaytambola.com/g/ab12c/', 'AB12C']]) {
        await box.fill(typed);
        equal(await box.inputValue(), want, `typing ${JSON.stringify(typed)}`);
      }
      const size = await box.evaluate((e) => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).fontSize), getComputedStyle(e).textTransform]);
      check(size[0] >= 60 && size[1] >= 16, `code field size ${size}`);
      await box.fill(code.toLowerCase());
      await page.keyboard.press('Enter');
      await page.waitForURL(`**/g/${code}`);
      await page.getByText('Priya invited you to').waitFor();
      await page.getByRole('heading', { level: 1, name: 'Kitty Party' }).waitFor();
      await page.getByText('1 person in · 6 ways to win · ₹100 ticket, pay Priya directly').waitFor();
      await t.shot(page, 'invite-360');
    },
  },
  {
    id: 'JOIN-02', area: 'Join', priority: 'P0', type: 'negative',
    title: 'Wrong, mistyped or hostile codes show "We can’t find game …" with a way back',
    steps: 'Open /g/ZZZZZ, /g/abc, /g/O0I1L, /g/%3Cscript%3E, /g/AAAAAAAAAAAAAAAAAAAAAAAA; from /join submit "QQQQQ"', expected: 'Heading "We can’t find game <CODE>" (letters/digits only, at most 12 shown), text "Check the code with whoever sent you the link.", button "Try another code" → /join. No script runs. The page does not keep asking the server every 1.5 s',
    run: async (t) => {
      const page = await t.device('android');
      await page.addInitScript(() => { window.__xss = 0; window.alert = () => { window.__xss++; }; });
      for (const [path, shown] of [['ZZZZZ', 'ZZZZZ'], ['abc', 'ABC'], ['O0I1L', 'O0I1L'], ['%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'SCRIPTALERT1'], ['A'.repeat(24), 'A'.repeat(12)]]) {
        await go(page, `/g/${path}`);
        await page.getByRole('heading', { level: 1, name: `We can’t find game ${shown}`, exact: true }).waitFor();
        await page.getByText('Check the code with whoever sent you the link.').waitFor();
      }
      equal(await page.evaluate(() => window.__xss), 0, 'no script ran');
      let gets = 0;
      page.on('request', (r) => { if (r.url().includes('/api/games/')) gets++; });
      await page.waitForTimeout(4000);
      check(gets <= 1, `a missing game was requested ${gets} more times in 4 s`);
      await page.getByRole('link', { name: 'Try another code' }).click();
      await page.waitForURL('**/join');
      await hydrated(page);
      await page.getByLabel('Game code').fill('QQQQQ');
      await page.getByRole('button', { name: 'Find my game' }).click();
      await page.getByRole('heading', { name: 'We can’t find game QQQQQ' }).waitFor();
      await t.shot(page, 'not-found-360');
    },
  },
  {
    id: 'JOIN-03', area: 'Join', priority: 'P0', type: 'functional',
    title: 'Join by link: type a name → a ticket is dealt at once; the name is remembered for next time',
    steps: 'Open the link on an iPhone; tap Join with no name; type a name with spaces around it; join; open another game’s link on the same phone', expected: 'Empty → toast "Type your name to join", field focused, no request. After joining: toast "You’re in — ticket dealt!", "You’re in! Waiting for Priya to start the game.", a 15-number ticket, the list shows the name with "you". The next invite has the name prefilled. Field is 62px / ≥16px font; footnote "No sign-up…"',
    run: async (t) => {
      const hostTok = newToken();
      const code = await createGame(hostTok, { hostName: 'Priya', name: 'Diwali Night' });
      const page = await t.device('iphone');
      let posts = 0;
      page.on('request', (r) => { if (r.method() === 'POST') posts++; });
      await go(page, `/g/${code}`);
      const name = page.getByLabel('What should we call you?');
      await name.waitFor();
      await page.getByText('No sign-up. Your name is only shown to people in this game.').waitFor();
      equal(await name.inputValue(), '', 'empty on a new device');
      const size = await name.evaluate((e) => [e.getBoundingClientRect().height, parseFloat(getComputedStyle(e).fontSize)]);
      check(size[0] >= 60 && size[1] >= 16, `name field size ${size}`);
      await page.getByRole('button', { name: 'Join game' }).click();
      await expectToast(page, 'Type your name to join');
      equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'name', 'focus on the name field');
      equal(posts, 0, 'no request without a name');
      await name.fill('  Meera   Devi ');
      await page.getByRole('button', { name: 'Join game' }).click();
      await expectToast(page, 'You’re in — ticket dealt!');
      await page.getByText('Waiting for Priya to start the game.').waitFor();
      const nums = (await ticketOnPage(page)).filter(Boolean);
      equal(nums.length, 15, 'numbers on the ticket');
      const me = page.locator('li', { hasText: 'Meera Devi' });
      check((await me.innerText()).includes('you'), 'my row is tagged "you"');
      check((await page.locator('li', { hasText: 'Priya' }).first().innerText()).includes('host'), 'host row is tagged "host"');
      equal(await page.getByRole('button', { name: /Start the game|Waiting for players/ }).count(), 0, 'players have no start button');
      equal(await page.getByRole('button', { name: 'Share on WhatsApp' }).count(), 0, 'players have no share card');
      await t.shot(page, 'lobby-player-390', { fullPage: true });
      const code2 = await createGame(newToken(), { hostName: 'Asha' });
      await go(page, `/g/${code2}`);
      await until(async () => (await page.getByLabel('What should we call you?').inputValue()) === 'Meera Devi', 'name prefilled on the next invite');
    },
  },
  {
    id: 'JOIN-04', area: 'Join', priority: 'P1', type: 'edge',
    title: 'Two people with the same name: the second is shown as "Meera (2)" on every device',
    steps: 'Host "Meera" plays; two more devices join as "Meera" and "meera"', expected: 'Lobby lists "Meera", "Meera (2)", "meera (3)"; each device’s own row says "you"; live ticket header reads "Meera (2)’s ticket"',
    run: async (t) => {
      const host = await t.device('android');
      const code = await hostThroughUi(host, { name: 'Meera' });
      const a = await t.device('iphone');
      const b = await t.device('android');
      await joinThroughUi(a, code, 'Meera');
      await joinThroughUi(b, code, 'meera');
      await until(async () => (await host.locator('li', { hasText: 'meera (3)' }).count()) === 1, 'host sees the third Meera');
      equal(await host.locator('ul').first().locator('li').evaluateAll((els) => els.map((e) => e.querySelector('span:nth-of-type(2)')?.textContent)), ['Meera', 'Meera (2)', 'meera (3)'], 'names in the lobby');
      check((await a.locator('li', { hasText: 'Meera (2)' }).innerText()).includes('you'), 'second device is "Meera (2) · you"');
      await host.getByRole('button', { name: 'Start the game' }).click();
      await a.getByText('Meera (2)’s ticket').waitFor();
      await b.getByText('meera (3)’s ticket').waitFor();
    },
  },
  {
    id: 'JOIN-05', area: 'Join', priority: 'P0', type: 'functional',
    title: 'Same device comes back (refresh, re-opened link, second tab): same seat, same ticket',
    steps: 'Join; note the ticket; refresh; open the link in a second tab; close everything and open the link again (same browser storage)', expected: 'Never asked for a name again; the ticket is identical each time; still one seat on the server',
    run: async (t) => {
      const hostTok = newToken();
      const code = await createGame(hostTok);
      const page = await t.device('android');
      await joinThroughUi(page, code, 'Meera');
      const first = await ticketOnPage(page);
      await page.reload();
      await page.getByText('Waiting for Priya to start the game.').waitFor();
      equal(await ticketOnPage(page), first, 'ticket after refresh');
      const tab2 = await page.context().newPage();
      await tab2.goto(`${BASE}/g/${code.toLowerCase()}`);
      await tab2.getByText('Waiting for Priya to start the game.').waitFor();
      equal(await ticketOnPage(tab2), first, 'ticket in a second tab');
      equal(await tab2.getByLabel('What should we call you?').count(), 0, 'no join card in the second tab');
      await page.close();
      const tab3 = await tab2.context().newPage();
      await tab2.close();
      await tab3.goto(`${BASE}/g/${code}`);
      await tab3.getByText('Waiting for Priya to start the game.').waitFor();
      equal(await ticketOnPage(tab3), first, 'ticket after closing and re-opening');
      equal((await view(code, hostTok)).body.game.players.length, 2, 'still two seats');
    },
  },
  {
    id: 'JOIN-06', area: 'Join', priority: 'P1', type: 'edge',
    title: 'Clearing the browser’s storage makes a new identity (accepted: no cross-device recovery)',
    steps: 'Join; clear localStorage; reload; join again with the same name', expected: 'The invite card shows again (the old seat cannot be recovered); joining again gives "Meera (2)" and a different ticket; the first seat stays in the list',
    run: async (t) => {
      const hostTok = newToken();
      const code = await createGame(hostTok);
      const page = await t.device('android');
      await joinThroughUi(page, code, 'Meera');
      const first = await ticketOnPage(page);
      const tok1 = await tokenOf(page);
      await page.evaluate(() => { window.localStorage.clear(); window.sessionStorage.clear(); });
      await page.reload();
      await page.getByLabel('What should we call you?').waitFor();
      await page.getByText('2 people in · 6 ways to win').waitFor();
      await page.getByLabel('What should we call you?').fill('Meera');
      await page.getByRole('button', { name: 'Join game' }).click();
      await page.getByText('Waiting for Priya to start the game.').waitFor();
      check(JSON.stringify(await ticketOnPage(page)) !== JSON.stringify(first), 'a different ticket');
      check((await tokenOf(page)) !== tok1, 'a new device token');
      equal((await view(code, hostTok)).body.game.players.map((p) => p.name), ['Priya', 'Meera', 'Meera (2)'], 'seats');
      t.note('old seat stays (nobody can remove it) — recorded as a product question in the report');
    },
  },
  {
    id: 'JOIN-07', area: 'Join', priority: 'P0', type: 'functional',
    title: 'Joining while the game is live: straight to the ticket, with numbers already called available to dab',
    steps: 'Start a game and call 30 numbers; a new person opens the link and joins', expected: 'Invite line ends "· already playing"; after joining they are on the live screen with a ticket, the board shows 30 called, and a called number on their ticket can be dabbed; host and others see them in "Playing"',
    run: async (t) => {
      const { code, host } = await table(t, { players: ['Meera'], start: true });
      const called = await drawUntil(code, host.token, (c) => c.length >= 30);
      const late = await t.device('android');
      await go(late, `/g/${code}`);
      await late.getByText(/2 people in · 6 ways to win · already playing/).waitFor();
      await late.getByLabel('What should we call you?').fill('Latecomer');
      await late.getByRole('button', { name: 'Join game' }).click();
      await late.getByText('Latecomer’s ticket').waitFor();
      await late.getByText('30 OF 90 CALLED').first().waitFor();
      const mine = (await ticketOnPage(late)).filter(Boolean);
      const n = mine.find((x) => called.includes(x));
      check(n !== undefined, 'none of 30 called numbers is on the late ticket (very unlikely)');
      await late.getByRole('button', { name: String(n), exact: true }).click();
      await late.getByRole('button', { name: `${n}, dabbed`, exact: true }).waitFor();
      await until(async () => (await host.page.locator('li', { hasText: 'Latecomer' }).count()) === 1, 'host sees the late joiner');
      await host.page.getByRole('heading', { name: 'Playing · 3' }).waitFor();
    },
  },
  {
    id: 'JOIN-08', area: 'Join', priority: 'P1', type: 'functional',
    title: 'A visitor opening a finished game sees "This game has finished" and can join when the next round opens',
    steps: 'Finish a game; a new device opens the link; the host taps "Play again"; the visitor waits on the page', expected: 'Card "<host>’s game / <name> / This game has finished." + "If <host> starts another round, you can join right here — keep this page open." + "Host my own game". No name field. When the new round opens, the same page turns into the invite card without a refresh and joining works',
    run: async (t) => {
      const { code, host } = await table(t, { input: { prizes: ['full'] }, players: ['Meera'], start: true });
      await drawUntil(code, host.token, () => false);
      const visitor = await t.device('android');
      await go(visitor, `/g/${code}`);
      await visitor.getByText('This game has finished.').waitFor();
      await visitor.getByText('If Priya starts another round, you can join right here — keep this page open.').waitFor();
      equal(await visitor.getByLabel('What should we call you?').count(), 0, 'no name field on a finished game');
      equal(await visitor.getByRole('link', { name: 'Host my own game' }).getAttribute('href'), '/host', 'host-my-own link');
      const body = await visitor.locator('main, body').first().innerText();
      check(!/Meera/.test(body), 'a visitor can see who played');
      await t.shot(visitor, 'finished-visitor');
      await host.page.getByRole('button', { name: 'Play again with same people' }).click();
      await visitor.getByLabel('What should we call you?').waitFor({ timeout: 6000 });
      await visitor.getByLabel('What should we call you?').fill('Newcomer');
      await visitor.getByRole('button', { name: 'Join game' }).click();
      await visitor.getByText('Waiting for Priya to start the game.').waitFor();
    },
  },
  {
    id: 'JOIN-09', area: 'Join', priority: 'P1', type: 'edge',
    title: 'A full game (100 people): the 101st sees "This game is full" and stays on the invite',
    steps: 'Fill a game to 100 through the API; open the link on a phone; type a name; Join', expected: 'Invite says "100 people in"; Join → toast "This game is full"; the button is usable again; the lobby with 100 people renders without horizontal scrolling',
    run: async (t) => {
      const hostTok = newToken();
      const code = await createGame(hostTok);
      const toks = Array.from({ length: 99 }, newToken);
      for (let i = 0; i < 99; i += 11) await Promise.all(toks.slice(i, i + 11).map((tok, k) => act(code, tok, { type: 'join', name: `Guest number ${i + k + 1}` })));
      const page = await t.device('android');
      await go(page, `/g/${code}`);
      await page.getByText(/100 people in/).waitFor();
      await page.getByLabel('What should we call you?').fill('One too many');
      await page.getByRole('button', { name: 'Join game' }).click();
      await expectToast(page, 'This game is full');
      await page.getByRole('button', { name: 'Join game' }).waitFor();
      const host = await t.device('android');
      await useToken(host, hostTok);
      await go(host, `/g/${code}`);
      await host.getByRole('heading', { name: 'Who’s here · 100' }).waitFor();
      equal(await host.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'lobby with 100 people overflows sideways');
      await t.shot(host, 'lobby-100-players');
    },
  },
  {
    id: 'JOIN-10', area: 'Join', priority: 'P0', type: 'resilience',
    title: 'Join on a slow or broken connection: one seat only; clear message on failure; retry works',
    steps: 'Delay the join by 2 s and tap Join 4 times + Enter; then make the request fail (offline), answer 500, then succeed', expected: 'One join request while busy ("Joining…", aria-busy); offline → "Can’t reach the game — check your internet"; 500 → "Something went wrong on our side — please try again"; the name stays; the last try gets a ticket; the server has one seat for this device',
    run: async (t) => {
      const hostTok = newToken();
      const code = await createGame(hostTok);
      const page = await t.device('android');
      let mode = 'slow';
      let posts = 0;
      await page.route('**/act', async (route) => {
        posts++;
        if (mode === 'offline') return route.abort('internetdisconnected');
        if (mode === '500') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' });
        if (mode === 'slow') await new Promise((r) => setTimeout(r, 2000));
        return route.continue();
      });
      await go(page, `/g/${code}`);
      await page.getByLabel('What should we call you?').fill('Meera');
      mode = 'offline';
      await page.getByRole('button', { name: 'Join game' }).click();
      await expectToast(page, 'Can’t reach the game — check your internet');
      mode = '500';
      await page.waitForTimeout(2500);
      await page.getByRole('button', { name: 'Join game' }).click();
      await expectToast(page, 'Something went wrong on our side — please try again');
      equal(await page.getByLabel('What should we call you?').inputValue(), 'Meera', 'name kept');
      mode = 'slow';
      posts = 0;
      await page.getByRole('button', { name: 'Join game' }).click();
      await page.getByRole('button', { name: 'Joining…' }).waitFor();
      equal(await page.getByRole('button', { name: 'Joining…' }).getAttribute('aria-busy'), 'true', 'aria-busy');
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Joining…' }).click({ force: true });
      await page.getByLabel('What should we call you?').press('Enter');
      await page.getByText('Waiting for Priya to start the game.').waitFor();
      equal(posts, 1, 'join requests while busy');
      equal((await view(code, hostTok)).body.game.players.length, 2, 'seats');
    },
  },
  {
    id: 'JOIN-11', area: 'Join', priority: 'P2', type: 'resilience',
    title: 'A browser that blocks storage (private mode / strict in-app browser) can still host and join for that visit',
    steps: 'Make localStorage and sessionStorage throw on every call; host a game; in another blocked browser join it', expected: 'Both work for the visit (identity kept in memory); no error page',
    run: async (t) => {
      const block = () => {
        const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
        for (const s of ['localStorage', 'sessionStorage']) Object.defineProperty(window, s, { get: boom, configurable: true });
      };
      const host = await t.device('android');
      await host.addInitScript(block);
      const code = await hostThroughUi(host, { name: 'Priya' });
      const p = await t.device('iphone');
      await p.addInitScript(block);
      await joinThroughUi(p, code, 'Meera');
      await until(async () => (await host.locator('li', { hasText: 'Meera' }).count()) === 1, 'host sees Meera');
      await host.getByRole('button', { name: 'Start the game' }).click();
      await p.getByText('Meera’s ticket').waitFor();
      equal([...host.consoleErrors, ...p.consoleErrors].filter((e) => !/blocked|SecurityError/.test(e)), [], 'unexpected console errors');
    },
  },
  // ------------------------------------------------------------------ lobby
  {
    id: 'LOB-01', area: 'Lobby', priority: 'P0', type: 'functional',
    title: 'Host share card: WhatsApp opens wa.me with the invite text and link; Copy link copies it; no link text, no "Share another way"',
    steps: 'As host in the lobby read the share card; tap "Share on WhatsApp" (capture what opens); tap both "Copy link" buttons; read the clipboard', expected: 'Card "Share this link with everyone" with only WhatsApp (60px, green) and Copy link; hint "Playing in the same room? Read out the code: CODE". WhatsApp → new tab https://wa.me/?text=<Join my Tambola game “NAME”! Tap the link, type your name and you’re in:\\n<origin>/g/CODE>. Copy → clipboard = link, toast "Link copied"',
    run: async (t) => {
      const page = await t.device('android', { permissions: ['clipboard-read', 'clipboard-write'] });
      await page.addInitScript(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a); return null; }; });
      const code = await hostThroughUi(page, { name: 'Priya', gameName: 'Kitty & Co “Special” #1' });
      const card = page.locator('section', { has: page.getByRole('heading', { name: 'Share this link with everyone' }) });
      const cardText = await card.innerText();
      check(!/https?:\/\/|localhost|letsplaytambola\.com/.test(cardText), `the share card shows the link text: ${cardText}`);
      check(!/another way/i.test(cardText), 'the card offers "Share another way"');
      equal(await card.getByRole('button').allInnerTexts(), ['Share on WhatsApp', 'Copy link'], 'buttons on the card');
      check(cardText.includes(`Playing in the same room? Read out the code: ${code}`), 'room hint');
      const wa = card.getByRole('button', { name: 'Share on WhatsApp' });
      const h = await wa.evaluate((e) => e.getBoundingClientRect().height);
      check(h >= 60, `WhatsApp button ${h}px`);
      await wa.click();
      const opened = await page.evaluate(() => window.__opened);
      equal(opened.length, 1, 'one window opened');
      const url = new URL(opened[0][0]);
      equal([url.origin + url.pathname, opened[0][1]], ['https://wa.me/', '_blank'], 'WhatsApp address and target');
      check(/noopener/.test(opened[0][2] || ''), 'opened with noopener');
      equal(url.searchParams.get('text'), `Join my Tambola game “Kitty & Co “Special” #1”! Tap the link, type your name and you’re in:\n${BASE}/g/${code}`, 'WhatsApp text');
      await card.getByRole('button', { name: 'Copy link' }).click();
      await expectToast(page, 'Link copied');
      equal(await page.evaluate(() => navigator.clipboard.readText()), `${BASE}/g/${code}`, 'clipboard after the card button');
      await page.evaluate(() => navigator.clipboard.writeText('x'));
      await page.getByRole('button', { name: 'Copy link' }).first().click();
      await until(async () => (await page.evaluate(() => navigator.clipboard.readText())) === `${BASE}/g/${code}`, 'clipboard after the header pill');
      await t.shot(page, 'lobby-host-360', { fullPage: true });
      t.note(`wa.me text: ${JSON.stringify(url.searchParams.get('text'))}`);
    },
  },
  {
    id: 'LOB-02', area: 'Lobby', priority: 'P1', type: 'negative',
    title: 'Copy link when the browser refuses the clipboard: the link is shown so it can be copied by hand',
    steps: 'Make navigator.clipboard.writeText reject and document.execCommand("copy") fail; tap Copy link', expected: 'Toast "Copy: <origin>/g/CODE" (the full link, readable); no error',
    run: async (t) => {
      const page = await t.device('android');
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new DOMException('denied', 'NotAllowedError')) }, configurable: true });
        document.execCommand = () => false;
      });
      const code = await hostThroughUi(page, { name: 'Priya' });
      await page.getByRole('button', { name: 'Copy link' }).first().click();
      await expectToast(page, `Copy: ${BASE}/g/${code}`);
      equal(page.consoleErrors, [], 'console errors');
      const box = await page.locator('[role="status"][aria-live="polite"] > div').first().evaluate((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, window.innerWidth]; });
      check(box[0] >= 0 && box[1] <= box[2], `the toast with the link is cut off: ${box}`);
      await t.shot(page, 'copy-denied-toast');
    },
  },
  {
    id: 'LOB-03', area: 'Lobby', priority: 'P0', type: 'functional',
    title: 'The lobby list updates live on every device as people join (no refresh)',
    steps: 'Host in lobby; three people join one by one from their phones; watch the host and the first player', expected: 'Within about 2 seconds each new name appears on every device; "Who’s here · N" counts up; avatars show the first letter; order = join order',
    run: async (t) => {
      const host = await t.device('desktop');
      const code = await hostThroughUi(host, { name: 'Priya' });
      const pages = [];
      const waits = [];
      for (const [i, name] of ['Meera', 'Nani', 'Sunita'].entries()) {
        const p = await t.device(i % 2 ? 'android' : 'iphone');
        await joinThroughUi(p, code, name);
        const t0 = Date.now();
        await host.getByRole('heading', { name: `Who’s here · ${i + 2}` }).waitFor({ timeout: 5000 });
        waits.push(Date.now() - t0);
        pages.push(p);
      }
      const names = (page) => page.locator('section', { has: page.getByRole('heading', { name: /Who’s here/ }) }).locator('li').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
      equal(await names(host), ['P Priya host · you', 'M Meera', 'N Nani', 'S Sunita'], 'host list');
      await until(async () => JSON.stringify(await names(pages[0])) === JSON.stringify(['P Priya host', 'M Meera you', 'N Nani', 'S Sunita']), 'first player sees everyone');
      check(Math.max(...waits) < 3500, `slowest update took ${Math.max(...waits)} ms`);
      await t.shot(host, 'lobby-host-desktop');
      t.note(`time for a new joiner to show on the host: ${waits.join(', ')} ms (polling every 1.5 s)`);
    },
  },
  {
    id: 'LOB-04', area: 'Lobby', priority: 'P0', type: 'functional',
    title: 'Start the game: only the host can; one tap (or five) starts once; every device moves to the live screen',
    steps: 'Host taps "Start the game" five times quickly; watch two player phones', expected: 'One start request reaches the server; all devices show the caller card and their ticket within about 2 s; players never had a Start button',
    run: async (t) => {
      const { code, host, players } = await table(t, { players: ['Meera', 'Nani'] });
      let starts = 0;
      host.page.on('request', (r) => { if (r.method() === 'POST' && (r.postData() || '').includes('"start"')) starts++; });
      const btn = host.page.getByRole('button', { name: 'Start the game' });
      await btn.waitFor();
      for (const p of players) equal(await p.page.getByRole('button', { name: /Start the game/ }).count(), 0, 'player start button');
      await btn.evaluate((e) => { for (let i = 0; i < 5; i++) e.click(); });
      await host.page.getByRole('button', { name: 'Call next number' }).waitFor();
      for (const p of players) {
        await p.page.getByText(`${p.name}’s ticket`).waitFor({ timeout: 5000 });
        await p.page.getByText('Waiting for Priya to call').waitFor();
        equal(await p.page.getByRole('button', { name: /Call next number|Auto call/ }).count(), 0, 'players have no host controls');
      }
      equal(starts, 1, 'start requests');
      equal((await view(code, host.token)).body.game.status, 'live', 'server status');
    },
  },
  {
    id: 'LOB-05', area: 'Lobby', priority: 'P1', type: 'functional',
    title: 'Lobby survives refresh and the Back button; the title row shows code, copy and sound',
    steps: 'As host: refresh; press Back (to /host) and Forward; toggle Sound off; refresh', expected: 'Still the host of the same lobby after refresh and after Back/Forward (the setup form is clean); "Code CODE" pill, "Copy link", "Sound on/off" pills ≥ 44px; the sound choice survives a refresh and applies to other games on this device',
    run: async (t) => {
      const page = await t.device('android');
      const code = await hostThroughUi(page, { name: 'Priya', gameName: 'Sunday Game' });
      await page.reload();
      await page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
      await page.getByText('You’re hosting').waitFor();
      check((await page.getByText(/^Code/).first().innerText()).includes(code), 'code pill');
      for (const name of ['Copy link', /Sound on/]) {
        const h = await page.getByRole('button', { name }).first().evaluate((e) => e.getBoundingClientRect().height);
        check(h >= 44, `${name} pill is ${h}px tall`);
      }
      await page.goBack();
      await page.waitForURL('**/host');
      await hydrated(page);
      await until(async () => (await page.locator('input[name="gameName"]').inputValue()) === 'Tambola Night', 'setup form is clean after Back');
      await page.goForward();
      await page.waitForURL(`**/g/${code}`);
      await page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
      await page.getByRole('button', { name: 'Sound on. Turn sound off' }).click();
      await page.getByRole('button', { name: 'Sound off. Turn sound on' }).waitFor();
      await page.reload();
      await page.getByRole('button', { name: 'Sound off. Turn sound on' }).waitFor();
      equal(await page.evaluate(() => window.localStorage.getItem('lpt:muted')), '1', 'mute stored on the device');
    },
  },
];
