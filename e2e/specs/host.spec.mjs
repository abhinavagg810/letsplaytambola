// Host setup (/host) and Ways to win (/host/prizes).
import { BASE, check, equal, go, hostThroughUi, hydrated, tokenOf, until, view } from '../lib.mjs';

const toastText = (page) => page.locator('[role="status"][aria-live="polite"]').last().innerText();
const expectToast = (page, text) => until(async () => (await page.getByText(text, { exact: true }).count()) > 0, `toast "${text}"`, 4000);
const createBtn = (page) => page.getByRole('button', { name: /Create game & get link|Creating your game/ });
const pattern = (page, name) => page.getByRole('checkbox', { name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`) });
const amount = (page, name) => page.getByLabel(`Prize amount for ${name} in rupees (optional)`);
const summary = (page) => page.getByRole('link', { name: /Ways to win/ }).innerText();

export default [
  {
    id: 'HOST-01', area: 'Host setup', priority: 'P0', type: 'functional',
    title: 'Host setup screen matches the spec; Create looks disabled until a name is typed and explains itself',
    steps: 'Open /host on a fresh Android phone; read the screen; tap Create with no name; type a name', expected: 'Label NEW GAME, h1 "Host a game", subtitle, Your name (helper text follows the name), Game name "Tambola Night" + 4 chips, Ticket price OPTIONAL "Collected outside the app", Deal me a ticket ON, Ways to win "Classic · 6 ways". Tapping Create without a name → toast "Type your name first" and the name field is focused; no request',
    run: async (t) => {
      const page = await t.device('android');
      const posts = [];
      page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/games')) posts.push(1); });
      await go(page, '/host');
      await hydrated(page);
      const body = await page.locator('main, body').first().innerText();
      for (const s of ['NEW GAME', 'Host a game', 'Takes a minute. No sign-up for you or your players.', 'Your name', 'Players will see “Priya invited you”.', 'Game name', 'Kitty Party', 'Diwali Night', 'Family Sunday', 'Teej Special', 'Ticket price', 'OPTIONAL', 'Collected outside the app', 'Deal me a ticket', 'Play while you call numbers', 'Classic · 6 ways', 'Change →', 'Create game & get link']) {
        check(body.toLowerCase().includes(s.toLowerCase()), `"${s}" is missing on /host`);
      }
      equal(await page.locator('input[name="gameName"]').inputValue(), 'Tambola Night', 'default game name');
      equal(await page.getByRole('switch', { name: /Deal me a ticket/ }).getAttribute('aria-checked'), 'true', 'toggle on by default');
      const disabledBg = await createBtn(page).evaluate((e) => getComputedStyle(e).backgroundColor);
      await createBtn(page).click();
      await expectToast(page, 'Type your name first');
      equal(await page.evaluate(() => document.activeElement?.getAttribute('name')), 'hostName', 'focus moves to the name field');
      await page.locator('input[name="hostName"]').fill('   ');
      await createBtn(page).click();
      await expectToast(page, 'Type your name first');
      equal(posts.length, 0, 'no create request without a name');
      await page.locator('input[name="hostName"]').fill('Sunita');
      await page.getByText('Players will see “Sunita invited you”.').waitFor();
      const enabledBg = await createBtn(page).evaluate((e) => getComputedStyle(e).backgroundColor);
      check(disabledBg !== enabledBg, `the button looks the same with and without a name (${enabledBg})`);
      const h = await createBtn(page).evaluate((e) => e.getBoundingClientRect().height);
      check(h >= 60, `Create button is ${h}px tall`);
      await t.shot(page, 'host-360', { fullPage: true });
    },
  },
  {
    id: 'HOST-02', area: 'Host setup', priority: 'P0', type: 'edge',
    title: 'Host and game names: 24/32-character limits, Hindi, emoji, right-to-left, and HTML are shown as plain text everywhere',
    steps: 'Try to type 30 characters in each field; create games named with Devanagari, emoji, Arabic and <img onerror>/<script> payloads; open the lobby as host and the invite as a visitor', expected: 'Fields stop at 24 / 32 characters; names appear exactly as typed in the header, lobby list, invite card and helper text; no script runs; no horizontal scrolling',
    run: async (t) => {
      const page = await t.device('android');
      await page.addInitScript(() => { window.__xss = 0; window.alert = () => { window.__xss++; }; });
      await go(page, '/host');
      await hydrated(page);
      await page.locator('input[name="hostName"]').fill('abcdefghijklmnopqrstuvwxyz1234');
      equal((await page.locator('input[name="hostName"]').inputValue()).length, 24, 'host name stops at 24');
      await page.locator('input[name="gameName"]').fill('G'.repeat(40));
      equal((await page.locator('input[name="gameName"]').inputValue()).length, 32, 'game name stops at 32');
      const cases = [
        ['सुनीता देवी', 'दिवाली की रात 🪔'],
        ['Nani 👵🏽❤️', '🎉🎉 Kitty 🎉🎉'],
        ['مريم العلي', 'ليلة تمبولا'],
        ['<img src=x onerror=alert(1)>'.slice(0, 24), '<script>alert(1)</script>'],
        ['WWWWWWWWWWWWWWWWWWWWWWWW', 'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM'],
      ];
      for (const [host, game] of cases) {
        const code = await hostThroughUi(page, { name: host, gameName: game });
        await page.getByRole('heading', { level: 1, name: game }).waitFor();
        check((await page.locator('ul li', { hasText: host }).count()) >= 1, `host "${host}" not listed in the lobby as typed`);
        equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, `horizontal overflow with names ${host} / ${game}`);
        const visitor = await t.device('iphone');
        await visitor.addInitScript(() => { window.__xss = 0; window.alert = () => { window.__xss++; }; });
        await go(visitor, `/g/${code}`);
        await visitor.getByText(`${host} invited you to`).waitFor();
        await visitor.getByRole('heading', { level: 1, name: game }).waitFor();
        equal(await visitor.evaluate(() => [window.__xss, document.querySelectorAll('main img, main script:not([src])').length]), [0, 0], 'no injected element on the invite');
        equal(await visitor.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, `invite overflows with ${host}`);
        if (host.startsWith('WWW')) await t.shot(visitor, 'long-names-invite-390', { fullPage: true });
        await visitor.context().close();
      }
      equal(await page.evaluate(() => window.__xss), 0, 'no alert fired on the host device');
      await t.shot(page, 'long-names-lobby-360', { fullPage: true });
      t.note(`${cases.length} name pairs created and displayed verbatim; 0 scripts executed`);
    },
  },
  {
    id: 'HOST-03', area: 'Host setup', priority: 'P1', type: 'functional',
    title: 'Game name chips fill the field; an empty game name becomes "Tambola Night"',
    steps: 'Tap each chip; clear the field and create', expected: 'The field takes the chip text and the chip looks selected (aria-pressed); the created game is called "Tambola Night"',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/host');
      await hydrated(page);
      for (const chip of ['Kitty Party', 'Diwali Night', 'Family Sunday', 'Teej Special']) {
        await page.getByRole('button', { name: chip }).click();
        equal(await page.locator('input[name="gameName"]').inputValue(), chip, `chip ${chip}`);
        const h = await page.getByRole('button', { name: chip }).evaluate((e) => e.getBoundingClientRect().height);
        check(h >= 40, `chip ${chip} is ${h}px tall`);
      }
      const code = await hostThroughUi(page, { name: 'Priya', gameName: '   ' });
      await page.getByRole('heading', { level: 1, name: 'Tambola Night' }).waitFor();
      t.note(`game ${code} created with a blank name → "Tambola Night"`);
    },
  },
  {
    id: 'HOST-04', area: 'Host setup', priority: 'P1', type: 'edge',
    title: 'Ticket price: digits only, five digits at most; 0 and empty mean "no price"',
    steps: 'Type letters, symbols, a pasted "₹1,500", 7 digits, "0", "007"; create with 0, with 99999 and with nothing', expected: 'Only digits stay, at most 5; numeric keypad (inputmode numeric); invite shows "₹99999 ticket, pay Priya directly" for 99999 and no price text for 0/empty',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/host');
      await hydrated(page);
      const price = page.locator('input[name="price"]');
      for (const [typed, want] of [['abc', ''], ['12ab3', '123'], ['₹1,500', '1500'], ['1234567', '12345'], ['-50', '50'], ['1e3', '13'], ['١٢٣', ''], ['0', '0']]) {
        await price.fill(typed);
        equal(await price.inputValue(), want, `typing ${JSON.stringify(typed)}`);
      }
      equal(await price.getAttribute('inputmode'), 'numeric', 'numeric keypad');
      const meta = async (p) => {
        const code = await hostThroughUi(page, { name: 'Priya', price: p });
        const v = await t.device('android');
        await go(v, `/g/${code}`);
        const line = await v.getByText(/people? in ·|person in ·/).innerText();
        await v.context().close();
        return line;
      };
      check(!/₹/.test(await meta('0')), 'price 0 shows a ₹ on the invite');
      check(!/₹/.test(await meta('')), 'no price shows a ₹ on the invite');
      const top = await meta('99999');
      check(top.includes('₹99999 ticket, pay Priya directly'), `invite line: ${top}`);
      equal(await meta('007').then((s) => /₹7 ticket/.test(s)), true, '"007" is ₹7');
      t.note(`invite line for the top price: "${top}"`);
    },
  },
  {
    id: 'HOST-05', area: 'Host setup', priority: 'P0', type: 'functional',
    title: '"Deal me a ticket" off: the host gets no ticket and cannot start alone',
    steps: 'Switch the toggle off (tap, then with the keyboard); create; look at the lobby; tap the start button', expected: 'Toggle is a switch with aria-checked; lobby shows no "Your ticket", "Who’s here · 0", "No one yet — share the link.", button "Waiting for players…" looks disabled; tapping it → toast "Share the link — no one has joined yet"',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/host');
      await hydrated(page);
      const sw = page.getByRole('switch', { name: /Deal me a ticket/ });
      await sw.click();
      equal(await sw.getAttribute('aria-checked'), 'false', 'off after a tap');
      await sw.focus();
      await page.keyboard.press('Space');
      equal(await sw.getAttribute('aria-checked'), 'true', 'on again with the space bar');
      const code = await hostThroughUi(page, { name: 'Priya', hostPlays: false });
      equal(await page.getByRole('heading', { name: 'Your ticket' }).count(), 0, 'no ticket for the host');
      await page.getByRole('heading', { name: 'Who’s here · 0' }).waitFor();
      await page.getByText('No one yet — share the link.').waitFor();
      await page.getByRole('button', { name: 'Waiting for players…' }).click();
      await expectToast(page, 'Share the link — no one has joined yet');
      const g = (await view(code, await tokenOf(page))).body.game;
      equal([g.status, g.you.ticket, g.players.length], ['lobby', undefined, 0], 'server state');
      await t.shot(page, 'lobby-host-no-ticket', { fullPage: true });
    },
  },
  {
    id: 'HOST-06', area: 'Host setup', priority: 'P1', type: 'functional',
    title: 'The draft survives going to Ways to win and back, a refresh and back/forward; a new tab and a created game start clean',
    steps: 'Fill everything; open Ways to win; change; Done; refresh; browser back/forward; open /host in a second tab; create; open /host again', expected: 'All fields keep their values through navigation and refresh in the same tab; a second tab has only the remembered name; after creating, /host shows defaults with the name remembered',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/');
      await hydrated(page);
      await page.getByRole('link', { name: 'Host a game free' }).first().click();
      await page.waitForURL('**/host');
      await page.locator('input[name="hostName"]').fill('Sunita');
      await page.locator('input[name="gameName"]').fill('Teej at Home');
      await page.locator('input[name="price"]').fill('250');
      await page.getByRole('switch', { name: /Deal me a ticket/ }).click();
      await page.getByRole('link', { name: /Ways to win/ }).click();
      await page.waitForURL('**/host/prizes');
      await page.getByRole('button', { name: 'Lines + House' }).click();
      await page.getByRole('button', { name: /Done · 4 picked/ }).click();
      await page.waitForURL('**/host');
      const state = () => page.evaluate(() => [document.querySelector('input[name=hostName]').value, document.querySelector('input[name=gameName]').value, document.querySelector('input[name=price]').value, document.querySelector('[role=switch]').getAttribute('aria-checked')]);
      const want = ['Sunita', 'Teej at Home', '250', 'false'];
      equal(await state(), want, 'after Ways to win → Done');
      check((await summary(page)).includes('Lines + House · 4 ways'), `summary: ${await summary(page)}`);
      await page.reload();
      await hydrated(page);
      await until(async () => JSON.stringify(await state()) === JSON.stringify(want), 'draft restored after refresh');
      check((await summary(page)).includes('Lines + House · 4 ways'), 'summary after refresh');
      await page.goBack();
      await page.waitForTimeout(400);
      await page.goForward();
      await page.waitForURL('**/host');
      await until(async () => JSON.stringify(await state()) === JSON.stringify(want), 'draft kept after back/forward');
      const tab2 = await page.context().newPage();
      await tab2.goto(BASE + '/host');
      await until(async () => (await tab2.locator('input[name="gameName"]').inputValue()) === 'Tambola Night', 'second tab starts with defaults');
      equal(await tab2.locator('input[name="price"]').inputValue(), '', 'second tab: no price');
      await tab2.close();
      await createBtn(page).click();
      await page.waitForURL(/\/g\/[A-Z0-9]{5}$/);
      await page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
      await go(page, '/host');
      await hydrated(page);
      await until(async () => JSON.stringify(await state()) === JSON.stringify(['Sunita', 'Tambola Night', '', 'true']), 'clean form with the remembered name after creating');
      check((await summary(page)).includes('Classic · 6 ways'), 'summary reset');
    },
  },
  {
    id: 'HOST-07', area: 'Host setup', priority: 'P0', type: 'resilience',
    title: 'Create on a slow connection: one game only, however often the button is tapped',
    steps: 'Delay the create request by 2.5 s; tap Create five times and press Enter in the name field', expected: 'Exactly one POST; the button reads "Creating your game…" (aria-busy) meanwhile; then the lobby opens',
    run: async (t) => {
      const page = await t.device('android');
      let posts = 0;
      await page.route('**/api/games', async (route) => { posts++; await new Promise((r) => setTimeout(r, 2500)); await route.continue(); });
      await go(page, '/host');
      await hydrated(page);
      await page.locator('input[name="hostName"]').fill('Priya');
      await createBtn(page).click();
      await page.getByRole('button', { name: 'Creating your game…' }).waitFor();
      equal(await createBtn(page).getAttribute('aria-busy'), 'true', 'aria-busy while creating');
      for (let i = 0; i < 4; i++) await createBtn(page).click({ force: true });
      await page.locator('input[name="hostName"]').press('Enter');
      await page.waitForURL(/\/g\/[A-Z0-9]{5}$/);
      await page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
      equal(posts, 1, 'create requests');
    },
  },
  {
    id: 'HOST-08', area: 'Host setup', priority: 'P0', type: 'resilience',
    title: 'Create when the server fails or the phone is offline: a clear message, nothing lost, retry works',
    steps: 'Make the create request answer 500, then a non-JSON 502 page, then 429, then fail (offline); then let it through', expected: 'Toasts: "Something went wrong on our side — please try again" (500, 502), "Too many tries — please wait a minute and try again" (429), "Can’t reach the game — check your internet" (offline). The form keeps its values and the button works again; the final try opens the lobby',
    run: async (t) => {
      const page = await t.device('android');
      let mode = '500';
      await page.route('**/api/games', async (route) => {
        if (mode === '500') return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false,"error":"Something went wrong on our side — please try again","code":"server"}' });
        if (mode === '502') return route.fulfill({ status: 502, contentType: 'text/html', body: '<html>Bad gateway</html>' });
        if (mode === '429') return route.fulfill({ status: 429, contentType: 'application/json', body: '{"ok":false,"error":"Too many tries — please wait a minute and try again","code":"rate_limited"}' });
        if (mode === 'offline') return route.abort('internetdisconnected');
        return route.continue();
      });
      await go(page, '/host');
      await hydrated(page);
      await page.locator('input[name="hostName"]').fill('Priya');
      await page.locator('input[name="gameName"]').fill('Resilient');
      for (const [m, copy] of [['500', 'Something went wrong on our side — please try again'], ['502', 'Something went wrong on our side — please try again'], ['429', 'Too many tries — please wait a minute and try again'], ['offline', 'Can’t reach the game — check your internet']]) {
        mode = m;
        await createBtn(page).click();
        await expectToast(page, copy);
        await page.getByRole('button', { name: 'Create game & get link' }).waitFor();
        equal(await page.locator('input[name="gameName"]').inputValue(), 'Resilient', `form kept after ${m}`);
        check(page.url().endsWith('/host'), `still on /host after ${m}`);
        await page.waitForTimeout(2500); // let the toast go
      }
      mode = 'ok';
      await createBtn(page).click();
      await page.waitForURL(/\/g\/[A-Z0-9]{5}$/);
      await page.getByRole('heading', { level: 1, name: 'Resilient' }).waitFor();
      t.note(`last toast region text: "${await toastText(page).catch(() => '')}"`);
    },
  },
  {
    id: 'HOST-09', area: 'Host setup', priority: 'P2', type: 'functional',
    title: 'The round back button returns to where the person came from, or home on a direct visit',
    steps: 'Home → Host a game → back arrow. Then open /host directly → back arrow. Then /join → Host a game → back arrow', expected: 'Back to the home page; home; back to /join. The button is 44px with the accessible name "Back"',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/join');
      await hydrated(page);
      await page.getByRole('link', { name: 'Host a game' }).first().click();
      await page.waitForURL('**/host');
      const back = page.getByRole('button', { name: 'Back' });
      const box = await back.evaluate((e) => { const r = e.getBoundingClientRect(); return [r.width, r.height]; });
      check(box[0] >= 44 && box[1] >= 44, `back button is ${box}`);
      await back.click();
      await page.waitForURL('**/join');
      const fresh = await t.device('android');
      await go(fresh, '/host');
      await hydrated(fresh);
      await fresh.getByRole('button', { name: 'Back' }).click();
      await fresh.waitForURL(BASE + '/');
    },
  },
  {
    id: 'PRZ-01', area: 'Ways to win', priority: 'P0', type: 'functional',
    title: 'Ways to win: presets select exactly their patterns; all 26 patterns in six groups with one-line rules',
    steps: 'Open /host/prizes; read groups and rows; tap each preset', expected: 'Groups Quick(6), Lines(5), Corners(5), Shapes(4), Number ranges(5), Full ticket(1) = 26 rows ≥ 60px; Classic selected at first (6); Lines + House → 4; Just Full House → 1; Full House rule reads "All 15 numbers"; the selected preset is marked',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/host/prizes');
      await hydrated(page);
      await page.getByRole('heading', { name: 'How can people win?' }).waitFor();
      const groups = await page.locator('section[aria-label]').evaluateAll((els) => els.map((e) => [e.getAttribute('aria-label'), e.querySelectorAll('[role=checkbox]').length]));
      equal(groups, [['Quick', 6], ['Lines', 5], ['Corners', 5], ['Shapes', 4], ['Number ranges', 5], ['Full ticket', 1]], 'groups');
      const rows = page.getByRole('checkbox');
      equal(await rows.count(), 26, 'patterns');
      const heights = await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      check(Math.min(...heights) >= 60, `shortest row is ${Math.min(...heights)}px`);
      const on = () => rows.evaluateAll((els) => els.filter((e) => e.getAttribute('aria-checked') === 'true').map((e) => e.querySelector('span span').textContent));
      equal(await on(), ['Early Five', 'Top Line', 'Middle Line', 'Bottom Line', 'Four Corners', 'Full House'], 'Classic by default');
      equal(await page.getByRole('button', { name: 'Classic' }).getAttribute('aria-pressed'), 'true', 'Classic marked');
      await page.getByRole('button', { name: 'Lines + House' }).click();
      equal(await on(), ['Top Line', 'Middle Line', 'Bottom Line', 'Full House'], 'Lines + House');
      await page.getByRole('button', { name: /Done · 4 picked/ }).waitFor();
      await page.getByRole('button', { name: 'Just Full House' }).click();
      equal(await on(), ['Full House'], 'Just Full House');
      equal(await page.getByRole('button', { name: 'Just Full House' }).getAttribute('aria-pressed'), 'true', 'preset marked');
      equal(await page.getByRole('button', { name: 'Classic' }).getAttribute('aria-pressed'), 'false', 'Classic unmarked');
      await page.getByRole('button', { name: /Done · 1 picked/ }).waitFor();
      const fullText = await pattern(page, 'Full House').innerText();
      check(/All 15 numbers/.test(fullText) && !/Second House|add again/i.test(fullText), `Full House row reads: ${fullText.replace(/\n/g, ' / ')}`);
      const preH = await page.getByRole('button', { name: 'Classic' }).evaluate((e) => e.getBoundingClientRect().height);
      check(preH >= 46, `preset pill ${preH}px`);
      await t.shot(page, 'prizes-360', { fullPage: true });
    },
  },
  {
    id: 'PRZ-02', area: 'Ways to win', priority: 'P0', type: 'negative',
    title: 'At least one way to win is needed — on the picker and on Create',
    steps: 'Deselect everything; tap Done; tap the back arrow; use the browser Back button to reach /host with nothing picked; tap Create', expected: 'Done and the arrow → toast "Pick at least one way to win", stay on the picker ("Done · 0 picked"). On /host the summary says "Your own mix · 0 ways", Create looks disabled and gives the same toast; no request',
    run: async (t) => {
      const page = await t.device('android');
      let posts = 0;
      page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/games')) posts++; });
      await go(page, '/host');
      await hydrated(page);
      await page.locator('input[name="hostName"]').fill('Priya');
      await page.getByRole('link', { name: /Ways to win/ }).click();
      await page.waitForURL('**/host/prizes');
      for (const name of ['Early Five', 'Top Line', 'Middle Line', 'Bottom Line', 'Four Corners', 'Full House']) await pattern(page, name).click();
      await page.getByRole('button', { name: 'Done · 0 picked' }).click();
      await expectToast(page, 'Pick at least one way to win');
      await page.getByRole('button', { name: 'Back to game setup' }).click();
      check(page.url().endsWith('/host/prizes'), 'the arrow must not leave with nothing picked');
      equal(await page.getByRole('button', { name: /^(Classic|Lines \+ House|Just Full House)$/ }).evaluateAll((els) => els.filter((e) => e.getAttribute('aria-pressed') === 'true').length), 0, 'no preset marked');
      await page.goBack();
      await page.waitForURL('**/host');
      await until(async () => (await summary(page)).includes('Your own mix · 0 ways'), 'summary shows 0 ways');
      await page.waitForTimeout(2500);
      await createBtn(page).click();
      await expectToast(page, 'Pick at least one way to win');
      equal(posts, 0, 'no create request');
    },
  },
  {
    id: 'PRZ-03', area: 'Ways to win', priority: 'P1', type: 'edge',
    title: 'All 26 ways selected: the game is created and every screen lists all 26',
    steps: 'Select every pattern; Done; Create; read the lobby', expected: '"Done · 26 picked"; summary "Your own mix · 26 ways"; lobby "Ways to win" has 26 rows in the order picked; no overflow at 360px',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/host');
      await hydrated(page);
      await page.locator('input[name="hostName"]').fill('Priya');
      await page.getByRole('link', { name: /Ways to win/ }).click();
      await page.waitForURL('**/host/prizes');
      const rows = page.getByRole('checkbox');
      for (let i = 0; i < 26; i++) if ((await rows.nth(i).getAttribute('aria-checked')) !== 'true') await rows.nth(i).click();
      await page.getByRole('button', { name: 'Done · 26 picked' }).click();
      await page.waitForURL('**/host');
      check((await summary(page)).includes('Your own mix · 26 ways'), `summary: ${await summary(page)}`);
      await createBtn(page).click();
      await page.waitForURL(/\/g\/[A-Z0-9]{5}$/);
      const code = page.url().split('/g/')[1];
      const list = page.locator('section', { has: page.getByRole('heading', { name: 'Ways to win' }) }).locator('li');
      await until(async () => (await list.count()) === 26, '26 rows in the lobby');
      const g = (await view(code, await tokenOf(page))).body.game;
      equal(g.prizes.length, 26, 'server has 26 prizes');
      equal(g.prizes.slice(0, 6).map((p) => p.id), ['early5', 'top', 'middle', 'bottom', 'corners', 'full'], 'order picked: Classic first');
      equal(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 0, 'no horizontal overflow');
      await t.shot(page, 'lobby-26-prizes', { fullPage: true });
    },
  },
  {
    id: 'PRZ-04', area: 'Ways to win', priority: 'P0', type: 'functional',
    title: 'Prize amounts: digits only up to 999999, totals shown, and a mix of typed and empty amounts is kept exactly',
    steps: 'Type amounts: "500", "0", "abc", "₹1,000", "1234567", "007", then clear one; watch Done and the /host summary; deselect a pattern with an amount; create with price ₹100; start with one player; check amounts', expected: 'Only digits, ≤ 6; leading zeros dropped; "0"/empty = none; total "· ₹N in prizes" on Done and on /host counts only picked patterns; the game shows the typed amounts in the lobby and after start, the others stay without an amount (no automatic split)',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/host');
      await hydrated(page);
      await page.locator('input[name="hostName"]').fill('Priya');
      await page.locator('input[name="price"]').fill('100');
      await page.getByRole('link', { name: /Ways to win/ }).click();
      await page.waitForURL('**/host/prizes');
      equal(await page.getByLabel(/Prize amount for/).count(), 6, 'one amount field per picked pattern');
      for (const [typed, want] of [['abc', ''], ['₹1,000', '1000'], ['1234567', '123456'], ['999999', '999999'], ['007', '7'], ['0', '0'], ['000', '0'], ['12.50', '1250'], ['-5', '5']]) {
        await amount(page, 'Top Line').fill(typed);
        equal(await amount(page, 'Top Line').inputValue(), want, `typing ${JSON.stringify(typed)}`);
      }
      equal(await amount(page, 'Top Line').getAttribute('inputmode'), 'numeric', 'numeric keypad');
      await amount(page, 'Top Line').fill('0');
      await page.getByRole('button', { name: 'Done · 6 picked', exact: true }).waitFor(); // 0 is not an amount
      await amount(page, 'Top Line').fill('500');
      await amount(page, 'Full House').fill('1500');
      await amount(page, 'Early Five').fill('250');
      await page.getByRole('button', { name: 'Done · 6 picked · ₹2,250 in prizes' }).waitFor();
      await pattern(page, 'Early Five').click(); // deselect: its amount no longer counts
      await page.getByRole('button', { name: 'Done · 5 picked · ₹2,000 in prizes' }).waitFor();
      await pattern(page, 'Early Five').click(); // pick it again
      const kept = await amount(page, 'Early Five').inputValue();
      await amount(page, 'Early Five').fill('');
      await page.getByRole('button', { name: 'Done · 6 picked · ₹2,000 in prizes' }).click();
      await page.waitForURL('**/host');
      check((await summary(page)).includes('₹2,000 in prizes'), `summary: ${await summary(page)}`);
      await createBtn(page).click();
      await page.waitForURL(/\/g\/[A-Z0-9]{5}$/);
      const code = page.url().split('/g/')[1];
      const tok = await tokenOf(page);
      const amounts = (g) => Object.fromEntries(g.prizes.map((p) => [p.id, p.amount]));
      const want = { top: 500, middle: 0, bottom: 0, corners: 0, full: 1500, early5: 0 };
      equal(amounts((await view(code, tok)).body.game), want, 'typed amounts on the server (lobby)');
      await page.getByText('₹1,500 · All 15 numbers').waitFor();
      await page.getByRole('button', { name: 'Start the game' }).click();
      await page.getByRole('button', { name: 'Call next number' }).waitFor();
      equal(amounts((await view(code, tok)).body.game), want, 'amounts unchanged after start (no split although a price is set)');
      await page.getByText('₹500 · All 5 numbers of the top line').waitFor();
      t.note(`amount typed for a deselected-then-reselected pattern came back as "${kept}"`);
      await t.shot(page, 'live-typed-amounts', { fullPage: true });
    },
  },
  {
    id: 'PRZ-05', area: 'Ways to win', priority: 'P2', type: 'functional',
    title: 'Opening /host/prizes directly (bookmark, refresh) still leads back to setup',
    steps: 'Load /host/prizes directly; change the set; tap Done; then refresh on the picker and tap the back arrow', expected: 'Done → /host with the new selection; refresh keeps the selection; arrow → /host',
    run: async (t) => {
      const page = await t.device('android');
      await go(page, '/host/prizes');
      await hydrated(page);
      await page.getByRole('button', { name: 'Just Full House' }).click();
      await page.reload();
      await hydrated(page);
      await page.getByRole('button', { name: 'Done · 1 picked' }).waitFor();
      await page.getByRole('button', { name: 'Back to game setup' }).click();
      await page.waitForURL('**/host');
      await until(async () => (await summary(page)).includes('Just Full House · 1 way'), 'summary shows the preset');
      check(!(await summary(page)).includes('1 ways'), 'singular "1 way"');
    },
  },
];
