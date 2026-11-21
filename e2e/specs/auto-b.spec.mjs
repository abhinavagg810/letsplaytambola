// Auto-call when the host's phone misbehaves: offline, reload, closed tab, hidden tab, end of the round.
import { act, check, drawUntil, equal, sleep, table, ticketNumbers, until, view } from '../lib.mjs';
import { watchCalls } from './auto-a.spec.mjs';

const calledCount = async (code, token) => (await view(code, token)).body.game.called.length;

export default [
  {
    id: 'AUTO-04', area: 'Auto-call', priority: 'P0', type: 'resilience',
    title: 'Host goes offline with auto-call on: calling pauses; it resumes by itself when the connection returns',
    steps: 'Auto on; after the first number cut the host’s network for 15 s; restore it; watch', expected: 'No numbers while offline (players see the game simply waiting); within ~3 s of reconnecting calling resumes with ONE number, then the normal 6 s rhythm (no burst to catch up)',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await host.page.getByRole('button', { name: 'Auto call' }).click();
      await until(async () => (await calledCount(code, p.token)) === 1, 'first automatic number', 9000);
      await host.page.context().setOffline(true);
      const during = await watchCalls(code, p.token, 15000);
      equal(during, [], 'numbers called while the host was offline');
      await host.page.context().setOffline(false);
      const after = await watchCalls(code, p.token, 16000);
      check(after.length >= 2 && after.length <= 3, `numbers in the 16 s after reconnecting: ${after}`);
      check(after[0] <= 3500, `first number ${after[0]} ms after reconnecting`);
      check(after[1] - after[0] >= 5000, `burst after reconnecting: ${after}`);
      await p.page.getByText(new RegExp(`^${1 + after.length} OF 90 CALLED`)).first().waitFor({ timeout: 5000 });
      t.note(`offline 15 s: 0 numbers; after reconnecting numbers at ${after.join(', ')} ms`);
    },
  },
  {
    id: 'AUTO-05', area: 'Auto-call', priority: 'P0', type: 'resilience',
    title: 'Host reloads or closes the page with auto-call on: calling pauses while they are away and carries on when they return',
    steps: 'Auto on; reload the host page; time the next number. Then close the host tab for 12 s; reopen the link', expected: 'After a reload the button still reads "Auto on · Stop" and numbers continue (first one a full interval after the page is back). With the tab closed no numbers are called; after reopening calling resumes within ~8 s',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await host.page.getByRole('button', { name: 'Auto call' }).click();
      await until(async () => (await calledCount(code, p.token)) === 1, 'first automatic number', 9000);
      await host.page.reload();
      await host.page.getByRole('button', { name: 'Auto on · Stop' }).waitFor();
      const afterReload = await watchCalls(code, p.token, 9000);
      check(afterReload.length >= 1 && afterReload[0] >= 4500 && afterReload[0] <= 7500, `first number after a reload: ${afterReload}`);
      const url = host.page.url();
      const ctx = host.page.context();
      await host.page.close();
      await sleep(600);
      const away = await watchCalls(code, p.token, 12000);
      equal(away, [], 'numbers called while the host tab was closed');
      equal((await view(code, p.token)).body.game.auto, 6, 'auto stays switched on for when the host returns');
      const again = await ctx.newPage();
      await again.goto(url);
      await again.getByRole('button', { name: 'Auto on · Stop' }).waitFor();
      const back = await watchCalls(code, p.token, 9000);
      check(back.length >= 1 && back[0] <= 8000, `after reopening: ${back}`);
      t.note(`reload → next number after ${afterReload[0]} ms; tab closed 12 s → 0 numbers; reopened → next after ${back[0]} ms`);
    },
  },
  {
    id: 'AUTO-06', area: 'Auto-call', priority: 'P1', type: 'resilience',
    title: 'Host tab in the background (visibility "hidden") with auto-call on',
    steps: 'Auto on; mark the host page as hidden (visibilitychange); watch 14 s; show it again', expected: 'Recorded behaviour: the code keeps calling as long as the browser lets timers run; players keep receiving numbers; when shown again the host screen is up to date at once. (Real phones suspend background tabs — then calling pauses and resumes, as in AUTO-05; this cannot be reproduced in a headless browser.)',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await host.page.getByRole('button', { name: 'Auto call' }).click();
      await until(async () => (await calledCount(code, p.token)) === 1, 'first automatic number', 9000);
      const vis = (state) => host.page.evaluate((s) => { Object.defineProperty(document, 'visibilityState', { value: s, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, state);
      await vis('hidden');
      const hidden = await watchCalls(code, p.token, 14000);
      check(hidden.length >= 2 && hidden.length <= 3, `numbers while the host tab was hidden: ${hidden}`);
      await vis('visible');
      const n = await calledCount(code, p.token);
      await host.page.getByText(new RegExp(`^${n} OF 90 CALLED|^${n + 1} OF 90 CALLED`)).first().waitFor({ timeout: 3000 });
      t.note(`hidden for 14 s: ${hidden.length} numbers at ${hidden.join(', ')} ms — calling continues while the browser keeps the page running`);
    },
  },
  {
    id: 'AUTO-07', area: 'Auto-call', priority: 'P0', type: 'functional',
    title: 'Auto-call stops by itself when the round ends (last prize won)',
    steps: 'One prize; auto on; a player wins it; watch 9 s; host plays again and starts round 2', expected: 'No number after the win; results screen; no error toast on the host; in round 2 auto-call is OFF until switched on again',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { input: { prizes: ['early5'] }, players: ['Meera'], start: true });
      const called = await drawUntil(code, host.token, (c) => c.length >= 60);
      await host.page.getByText('60 OF 90 CALLED').first().waitFor({ timeout: 5000 });
      await host.page.getByRole('button', { name: 'Auto call' }).click();
      await host.page.getByRole('button', { name: 'Auto on · Stop' }).waitFor();
      const g = (await view(code, p.token)).body.game;
      for (const n of ticketNumbers(g.you.ticket).filter((x) => called.includes(x)).slice(0, 5)) await act(code, p.token, { type: 'mark', n, on: true });
      const won = await act(code, p.token, { type: 'claim', prizeId: 'early5' });
      equal([won.body.ok, won.body.game.status, won.body.game.auto], [true, 'done', 0], 'claim ends the round and switches auto off');
      const n0 = won.body.game.called.length;
      const toasts = [];
      await host.page.exposeFunction('__toast', (x) => toasts.push(x));
      await host.page.evaluate(() => new MutationObserver(() => { const el = document.querySelector('[role="status"][aria-live="polite"][aria-atomic="true"]'); if (el?.textContent) window.__toast(el.textContent); }).observe(document.body, { childList: true, subtree: true, characterData: true }));
      await host.page.getByRole('heading', { name: 'That’s the game!' }).waitFor({ timeout: 5000 });
      await sleep(9000);
      equal((await view(code, host.token)).body.game.called.length, n0, 'numbers after the round ended');
      equal([...new Set(toasts)], [], 'toasts on the host after the round ended');
      await host.page.getByRole('button', { name: 'Play again with same people' }).click();
      await host.page.getByRole('button', { name: 'Start the game' }).click();
      await host.page.getByRole('button', { name: 'Auto call' }).waitFor();
      equal(await watchCalls(code, host.token, 8000), [], 'numbers in round 2 before auto is switched on');
    },
  },
];
