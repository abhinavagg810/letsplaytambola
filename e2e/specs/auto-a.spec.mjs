// Auto-call (the timer runs in the host's browser). These cases wait in real time, so they are slow.
import { check, equal, sleep, table, until, view } from '../lib.mjs';

const calledCount = async (code, token) => (await view(code, token)).body.game.called.length;
/** Watch the server for `ms` and return the times (ms from now) at which each new number appeared. */
export async function watchCalls(code, token, ms) {
  const t0 = Date.now();
  let n = await calledCount(code, token);
  const at = [];
  while (Date.now() - t0 < ms) {
    const now = await calledCount(code, token);
    for (; n < now; n++) at.push(Date.now() - t0);
    await sleep(400); // gentle: this shares the device's 240-requests-a-minute allowance with the page itself
  }
  return at;
}
const gaps = (times) => times.slice(1).map((x, i) => x - times[i]);

const cases = [
  {
    id: 'AUTO-01', area: 'Auto-call', priority: 'P0', type: 'functional',
    title: 'Auto call: waits one full interval after being switched on, then a number every 6 seconds; Stop stops',
    steps: 'Call one number by hand; wait 8 s; tap "Auto call"; time the numbers for 21 s; tap "Auto on · Stop"; watch 9 s more', expected: 'Button reads "Auto on · Stop" (pressed). NO number in the first 5 s; the first comes 5.5–7.5 s after switching on; then one every 5.5–7 s. After Stop: the button reads "Auto call" and no number comes. Players have no auto button',
    run: async (t) => {
      const { code, host, players: [p] } = await table(t, { players: ['Meera'], start: true });
      await host.page.getByRole('button', { name: 'Call next number' }).click();
      await host.page.getByText('1 OF 90 CALLED').first().waitFor();
      await sleep(8000);
      const auto = host.page.getByRole('button', { name: 'Auto call' });
      equal(await auto.getAttribute('aria-pressed'), 'false', 'off at first');
      await auto.click();
      const times = await watchCalls(code, host.token, 21000);
      await host.page.getByRole('button', { name: 'Auto on · Stop' }).waitFor();
      equal(await host.page.getByRole('button', { name: 'Auto on · Stop' }).getAttribute('aria-pressed'), 'true', 'pressed while on');
      check(times.length >= 3 && times.length <= 4, `numbers in 21 s: ${times}`);
      check(times[0] >= 5500 && times[0] <= 7500, `first automatic number came ${times[0]} ms after switching on`);
      check(gaps(times).every((g) => g >= 5300 && g <= 7200), `gaps between numbers: ${gaps(times)}`);
      equal(await p.page.getByRole('button', { name: /Auto/ }).count(), 0, 'player has an auto button');
      await host.page.getByRole('button', { name: 'Auto on · Stop' }).click();
      await host.page.getByRole('button', { name: 'Auto call' }).waitFor();
      const after = await watchCalls(code, host.token, 9000);
      equal(after, [], 'numbers after Stop');
      equal((await view(code, host.token)).body.game.auto, 0, 'server: auto off');
      t.note(`switched on 8 s after the last number: numbers at ${times.join(', ')} ms; none in 9 s after Stop`);
    },
  },
  {
    id: 'AUTO-02', area: 'Auto-call', priority: 'P0', type: 'concurrency',
    title: 'Two (or three) host tabs with auto-call on still call at normal speed',
    steps: 'Host opens the game in three tabs of the same browser; switches auto on; time the numbers for 26 s; then tap "Call next number" in two tabs at the same instant', expected: 'A number every ~6 s (4 in 26 s, never two close together: every gap ≥ 5 s); all tabs show the same count. The simultaneous manual taps call exactly one number',
    run: async (t) => {
      const { code, host } = await table(t, { players: ['Meera'], start: true });
      const tabs = [host.page, await host.page.context().newPage(), await host.page.context().newPage()];
      for (const tab of tabs.slice(1)) await tab.goto(host.page.url());
      for (const tab of tabs) await tab.getByRole('button', { name: 'Call next number' }).waitFor();
      await tabs[0].getByRole('button', { name: 'Auto call' }).click();
      for (const tab of tabs) await tab.getByRole('button', { name: 'Auto on · Stop' }).waitFor({ timeout: 5000 });
      const times = await watchCalls(code, host.token, 26000);
      check(times.length >= 3 && times.length <= 5, `numbers in 26 s with three host tabs: ${times}`);
      check(gaps(times).every((g) => g >= 5000), `two numbers came close together: gaps ${gaps(times)}`);
      await tabs[1].getByRole('button', { name: 'Auto on · Stop' }).click();
      for (const tab of tabs) await tab.getByRole('button', { name: 'Auto call' }).waitFor({ timeout: 5000 });
      await sleep(1600);
      const before = await calledCount(code, host.token);
      for (const tab of tabs) await tab.getByText(`${before} OF 90 CALLED`).first().waitFor({ timeout: 5000 });
      await Promise.all(tabs.map((tab) => tab.getByRole('button', { name: 'Call next number' }).click()));
      await sleep(1500);
      equal(await calledCount(code, host.token), before + 1, 'three tabs tapping "Call next number" together');
      t.note(`three host tabs: numbers at ${times.join(', ')} ms (gaps ${gaps(times).join(', ')}); simultaneous manual taps → 1 number`);
    },
  },
  {
    id: 'AUTO-03', area: 'Auto-call', priority: 'P1', type: 'functional',
    title: 'A manual call while auto is on does not cause a double: the next automatic number waits a full interval',
    steps: 'Auto on; right after an automatic number, wait 3 s and tap "Call next number"; time the next automatic number', expected: 'The manual number is called at once; the next automatic one comes 5.3–7.2 s after it (not 3 s later)',
    run: async (t) => {
      const { code, host } = await table(t, { players: ['Meera'], start: true });
      await host.page.getByRole('button', { name: 'Auto call' }).click();
      await until(async () => (await calledCount(code, host.token)) === 1, 'first automatic number', 9000);
      await sleep(3000);
      await host.page.getByRole('button', { name: 'Call next number' }).click();
      await until(async () => (await calledCount(code, host.token)) === 2, 'manual number', 3000, 50);
      const times = await watchCalls(code, host.token, 9000);
      check(times.length === 1 && times[0] >= 5300 && times[0] <= 7200, `next automatic number after a manual one: ${times}`);
      t.note(`next automatic number ${times[0]} ms after the manual call`);
    },
  },
];
export default cases;
