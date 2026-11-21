// The results screen, "Play again" and "Host my own game".
import { act, callUntilComplete, check, drawUntil, equal, go, hydrated, needFor, sleep, spoken, table, tokenOf, until, view } from '../lib.mjs';

const banner = (page) => page.locator('[aria-live="assertive"][aria-atomic="true"]');
const ticketOnPage = (page) => page.locator('[role="group"]').first().evaluate((g) => [...g.children].map((c) => (c.getAttribute('aria-hidden') ? 0 : parseInt(c.textContent, 10))));
/** Finish a round: the first player wins Top Line, then the remaining numbers are called. */
async function finishedTable(t, opts = {}) {
  const tb = await table(t, { input: { price: 50, prizes: ['top', 'full'], ...(opts.input || {}) }, players: opts.players || ['Meera', 'Nani'], start: true, prepare: callUntilComplete(0, 'top') });
  const p = tb.players[0];
  const tk = (await view(tb.code, p.token)).body.game.you.ticket;
  const top = needFor(tk, 'top').nums;
  for (const n of top) await act(tb.code, p.token, { type: 'mark', n, on: true });
  const won = await act(tb.code, p.token, { type: 'claim', prizeId: 'top' });
  if (!won.body.ok) throw new Error(`setup claim failed: ${won.text}`);
  tb.calledAtWin = won.body.game.called.length;
  await drawUntil(tb.code, tb.host.token, (c) => c.length >= (opts.stopAt ?? 90));
  return tb;
}

const cases = [
  {
    id: 'RES-01', area: 'Results', priority: 'P0', type: 'functional',
    title: 'Results screen: headline, count line in normal words, payment note, winners with amounts, the right buttons for host and players',
    steps: 'Finish a round where Meera won Top Line (₹ amount) and Full House stayed open; read host, winner and other player screens', expected: '"That’s the game!"; "90 of 90 numbers called. Settle any prize money between yourselves — the app never handles payments." (no capitals-only text); Winners: "Top Line — Meera · ₹N" ("Meera (you)" on her phone), "Full House — Open". Host: "Play again with same people" (64px). Players: "Stay on this page — if Priya starts another round, you’ll get a fresh ticket." and no Play again. Everyone: "Host my own game" → /host. Title row still shows code/copy/sound',
    run: async (t) => {
      const { code, host, players: [p, q] } = await finishedTable(t);
      for (const page of [host.page, p.page, q.page]) await page.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 6000 });
      const amount = (await view(code, host.token)).body.game.prizes[0].amount;
      check(amount > 0, 'Top Line has an amount');
      for (const [who, page] of [['host', host.page], ['winner', p.page], ['other', q.page]]) {
        const text = await page.locator('main, body').first().innerText();
        check(text.includes('90 of 90 numbers called. Settle any prize money between yourselves — the app never handles payments.'), `${who}: count line / note: ${text.slice(0, 300)}`);
        check(!/\d+ OF 90 CALLED/.test(text), `${who}: shouting capitals on the results screen`);
        const rows = await page.locator('section', { has: page.getByRole('heading', { name: 'Winners' }) }).locator('li').allInnerTexts();
        equal(rows.map((r) => r.replace(/\s*\n\s*/g, ' — ')), [`Top Line — Meera${who === 'winner' ? ' (you)' : ''} · ₹${amount}`, 'Full House — Open'], `${who}: winners`);
        equal(await page.getByRole('link', { name: 'Host my own game' }).getAttribute('href'), '/host', `${who}: host-my-own`);
        equal(await page.getByRole('button', { name: 'Play again with same people' }).count(), who === 'host' ? 1 : 0, `${who}: play again button`);
        equal(await page.getByText('Stay on this page — if Priya starts another round, you’ll get a fresh ticket.').count(), who === 'host' ? 0 : 1, `${who}: stay note`);
        check((await page.getByText(/^Code/).first().innerText()).includes(code), `${who}: code pill`);
        equal(await page.locator('[role="group"] button').count(), 0, `${who}: ticket still tappable on results`);
      }
      const h = await host.page.getByRole('button', { name: 'Play again with same people' }).evaluate((e) => e.getBoundingClientRect().height);
      check(h >= 60, `Play again is ${h}px tall`);
      await t.shot(host.page, 'results-host-360', { fullPage: true });
      await t.shot(p.page, 'results-winner-390', { fullPage: true });
    },
  },
  {
    id: 'RES-02', area: 'Results', priority: 'P0', type: 'functional',
    title: 'Results with fewer than 90 numbers: the count is the real one, in plain words',
    steps: 'One prize; it is won after N numbers; read the results line', expected: '"N of 90 numbers called." with the real N (e.g. 23), singular/plural reads naturally',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { input: { prizes: ['top'] }, players: ['Meera'], start: true, prepare: callUntilComplete(0, 'top') });
      const top = needFor((await view(code, p.token)).body.game.you.ticket, 'top').nums;
      const called = (await view(code, host.token)).body.game.called;
      for (const n of top) await act(code, p.token, { type: 'mark', n, on: true });
      await act(code, p.token, { type: 'claim', prizeId: 'top' });
      await host.page.getByText(`${called.length} of 90 numbers called.`).waitFor({ timeout: 6000 });
      t.note(`line read: "${called.length} of 90 numbers called."`);
    },
  },
  {
    id: 'RES-03', area: 'Results', priority: 'P0', type: 'functional',
    title: 'Play again: everyone returns to the lobby with a fresh ticket; nothing from the last round is replayed',
    steps: 'On results the host taps "Play again with same people"; players keep their page open; host starts; a number is called', expected: 'All devices show the lobby without a reload: same people, same code and link; each ticket differs from round 1 and has no dabs; winners cleared. After Start: live screen with 0 called, no old banner, the voice does not repeat old numbers or the old win; the round counter on the server is 2',
    run: async (t) => {
      const { code, host, players: [p, q] } = await finishedTable(t);
      await p.page.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 6000 });
      const r1 = {};
      for (const s of [p, q]) r1[s.name] = JSON.stringify((await view(code, s.token)).body.game.you.ticket);
      await sleep(2000); // a page opened within 3 s of the last call reads that number once: let it finish
      const saidAtResults = await spoken(p.page);
      const saidBefore = saidAtResults.length;
      await host.page.getByRole('button', { name: 'Play again with same people' }).click();
      await host.page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor();
      for (const s of [p, q]) {
        await s.page.getByText('Waiting for Priya to start the game.').waitFor({ timeout: 6000 });
        const shown = await ticketOnPage(s.page);
        const server = (await view(code, s.token)).body.game;
        equal(shown, server.you.ticket.flat(), `${s.name}: ticket on screen = server ticket`);
        check(JSON.stringify(server.you.ticket) !== r1[s.name], `${s.name}: same ticket as last round`);
        equal(server.you.marks, [], `${s.name}: dabs cleared`);
      }
      const g = (await view(code, host.token)).body.game;
      equal([g.round, g.status, g.called.length, g.players.length, g.prizes.filter((x) => x.winnerPid).length], [2, 'lobby', 0, 3, 0], 'server after Play again');
      await host.page.getByRole('heading', { name: 'Who’s here · 3' }).waitFor();
      await host.page.getByRole('button', { name: 'Start the game' }).click();
      for (const s of [p, q]) {
        await s.page.getByText(`${s.name}’s ticket`).waitFor({ timeout: 6000 });
        await s.page.getByText('0 OF 90 CALLED').first().waitFor();
        equal(await s.page.locator('[role="group"] button[aria-pressed="true"]').count(), 0, `${s.name}: dabs on the new ticket`);
        equal(await banner(s.page).innerText(), '', `${s.name}: old banner`);
        check((await s.page.locator('li', { hasText: 'All 5 numbers of the top line' }).innerText()).includes('Open'), `${s.name}: Top Line open again`);
      }
      await sleep(1600);
      equal(await spoken(p.page), saidAtResults, 'the voice said something new before any number of round 2 was called');
      await host.page.getByRole('button', { name: 'Call next number' }).click();
      await p.page.getByText('1 OF 90 CALLED').first().waitFor({ timeout: 6000 });
      equal((await spoken(p.page)).length, saidBefore + 1, 'the first number of round 2 is spoken once');
      await t.shot(p.page, 'round2-live-player', { fullPage: true });
    },
  },
  {
    id: 'RES-04', area: 'Results', priority: 'P0', type: 'edge',
    title: 'Play again tapped many times (or on a slow line) starts ONE new round',
    steps: 'Delay the request 1.5 s; tap "Play again with same people" 5 times', expected: 'One request; round goes from 1 to 2 (not 3+); the lobby opens once',
    run: async (t) => {
      const { code, host } = await finishedTable(t, { players: ['Meera'] });
      await host.page.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 6000 });
      let posts = 0;
      await host.page.route('**/act', async (route) => { posts++; await sleep(1500); await route.continue(); });
      const btn = host.page.getByRole('button', { name: 'Play again with same people' });
      await btn.evaluate((e) => { for (let i = 0; i < 3; i++) e.click(); });
      await btn.click({ force: true }).catch(() => undefined);
      await btn.click({ force: true }).catch(() => undefined);
      await host.page.getByRole('heading', { name: 'Share this link with everyone' }).waitFor({ timeout: 6000 });
      await sleep(1800);
      equal([posts, (await view(code, host.token)).body.game.round], [1, 2], 'requests / round');
    },
  },
  {
    id: 'RES-05', area: 'Results', priority: 'P1', type: 'functional',
    title: 'Results survive a refresh; "Host my own game" starts a separate new game and the old one is still there',
    steps: 'A player refreshes on results; taps "Host my own game"; creates a game; opens the old link again', expected: 'Refresh → same results (no banner replay). /host shows a clean form with the remembered name; the new game has a different code and this device is its host; the old link still shows the old results to this device as a player',
    run: async (t) => {
      const { code, players: [p] } = await finishedTable(t, { players: ['Meera'] });
      await p.page.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 6000 });
      await sleep(5200);
      await p.page.reload();
      await p.page.getByRole('heading', { name: 'That’s the game!' }).waitFor();
      await sleep(700);
      equal(await banner(p.page).innerText(), '', 'banner replayed after refresh');
      equal(await spoken(p.page), [], 'voice replayed after refresh');
      await p.page.getByRole('link', { name: 'Host my own game' }).click();
      await p.page.waitForURL('**/host');
      await hydrated(p.page);
      await until(async () => (await p.page.locator('input[name="gameName"]').inputValue()) === 'Tambola Night', 'clean form');
      await p.page.locator('input[name="hostName"]').fill('Meera');
      await p.page.getByRole('button', { name: 'Create game & get link' }).click();
      await p.page.waitForURL(/\/g\/[A-Z0-9]{5}$/);
      const code2 = p.page.url().split('/g/')[1];
      check(code2 !== code, 'a new code');
      await p.page.getByText('You’re hosting').waitFor();
      equal((await view(code2, await tokenOf(p.page))).body.game.you.role, 'host', 'role in the new game');
      await go(p.page, `/g/${code}`);
      await p.page.getByRole('heading', { name: 'That’s the game!' }).waitFor();
      await p.page.getByText('Priya’s game').waitFor();
      equal((await view(code, await tokenOf(p.page))).body.game.you.role, 'player', 'role in the old game');
    },
  },
];
export default cases;
