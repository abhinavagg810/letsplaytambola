#!/usr/bin/env node
// Plays a whole game through the HTTP API with separate device tokens and checks the rules that matter:
// host-only actions, private tickets, server-checked claims, first-claim-wins, the 90-number ending, new round.
//
//   npm run build && PORT=8200 npm start        (or: npm run dev -- -p 8200)
//   BASE_URL=http://localhost:8200 npm run smoke
//
// Works against the in-memory store and against Supabase alike. Exits non-zero on the first failure.
import { randomUUID } from 'node:crypto';

const BASE = (process.env.BASE_URL || 'http://localhost:8200').replace(/\/+$/, '');
const tokens = { host: randomUUID(), meera: randomUUID(), nani: randomUUID(), late: randomUUID(), visitor: randomUUID(), tooLate: randomUUID() };
let checks = 0;

function ok(cond, msg) {
  if (!cond) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  checks++;
  console.log(`ok   ${msg}`);
}

async function call(method, path, who, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(who ? { 'x-device-token': tokens[who] ?? who } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, cache: res.headers.get('cache-control') ?? '' };
}
const get = (code, who) => call('GET', `/api/games/${code}`, who);
const act = (code, who, action) => call('POST', `/api/games/${code}/act`, who, action);
async function must(promise, what) {
  const r = await promise;
  if (!r.json?.ok) {
    console.error(`FAILED: ${what} — ${r.status} ${r.text}`);
    process.exit(1);
  }
  return r.json;
}
const nums = (ticket) => ticket.flat().filter(Boolean);
const row = (ticket, r) => ticket[r].filter(Boolean);
/** No token may ever appear in a response. */
function noSecrets(text, where) {
  for (const t of Object.values(tokens)) if (text.includes(t)) ok(false, `${where} leaks a device token`);
}

console.log(`Smoke test against ${BASE}\n`);

// ---------------------------------------------------------------- create
let r = await call('POST', '/api/games', null, { hostName: 'Priya', prizes: ['full'] });
ok(r.status === 401 && r.json?.ok === false && typeof r.json.error === 'string', 'creating without a device token is refused (401)');
r = await call('POST', '/api/games', 'not-a-uuid', { hostName: 'Priya', prizes: ['full'] });
ok(r.status === 401, 'a token that is not a UUID is refused (401)');
r = await call('POST', '/api/games', 'host', { hostName: '  ', prizes: ['full'] });
ok(r.status === 400 && r.json.error === 'Type your name first', 'create: empty host name → "Type your name first"');
r = await call('POST', '/api/games', 'host', { hostName: 'Priya', prizes: [] });
ok(r.status === 400 && r.json.error === 'Pick at least one way to win', 'create: no prizes → "Pick at least one way to win"');
r = await call('POST', '/api/games', 'host', { hostName: 'Priya', prizes: ['full', 'nope'] });
ok(r.status === 400 && r.json.ok === false, 'create: unknown pattern refused');

r = await call('POST', '/api/games', 'host', { hostName: ' Priya ', name: 'Diwali Night', price: 100, hostPlays: true, prizes: ['top', 'full'] });
ok(r.status === 201 && r.json.ok === true && /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(r.json.code), `create → code ${r.json?.code}`);
ok(/no-store/.test(r.cache), 'create response is Cache-Control: no-store');
const code = r.json.code;

r = await get('ZZZZZ', 'host');
ok(r.status === 404 && r.json.ok === false && r.json.notFound === true && r.json.error.includes('ZZZZZ'), 'unknown code → 404 { ok:false, notFound:true }');
r = await act('ZZZZZ', 'host', { type: 'start' });
ok(r.status === 404 && r.json.notFound === true, 'acting on an unknown code → 404');

// ---------------------------------------------------------------- views before joining
r = await get(code, 'host');
ok(r.status === 200 && r.json.game.you.role === 'host' && Array.isArray(r.json.game.you.ticket) && r.json.game.status === 'lobby', 'host view: role host, with a ticket (host plays), lobby');
ok(/no-store/.test(r.cache), 'GET response is Cache-Control: no-store');
ok(r.json.game.hostName === 'Priya' && r.json.game.name === 'Diwali Night' && r.json.game.price === 100, 'host name trimmed, game name and price kept');
r = await get(code.toLowerCase(), 'host');
ok(r.status === 200 && r.json.game.code === code, 'codes are case-insensitive in the URL');

r = await get(code, 'visitor');
const visitorKeys = Object.keys(r.json.game).sort().join(',');
ok(r.json.game.you.role === 'visitor' && visitorKeys === 'code,hostName,name,now,playerCount,price,prizes,round,status,version,you', `visitor view has only the invite card (${visitorKeys})`);
ok(!/ticket|marks|called|"players"|"pid"/.test(r.text), 'visitor view has no ticket, marks, called numbers or player list');
r = await get(code, null);
ok(r.status === 200 && r.json.game.you.role === 'visitor', 'no token at all → visitor view');

// ---------------------------------------------------------------- join
r = await act(code, 'meera', { type: 'join', name: '   ' });
ok(r.status === 400 && r.json.error === 'Type your name to join', 'join: empty name → "Type your name to join"');
r = await act(code, 'meera', { type: 'join', name: 'x'.repeat(25) });
ok(r.status === 400, 'join: a 25-letter name is refused');
let meera = (await must(act(code, 'meera', { type: 'join', name: ' Meera ' }), 'meera joins')).game;
ok(meera.you.role === 'player' && meera.you.name === 'Meera' && nums(meera.you.ticket).length === 15 && meera.you.marks.length === 0, 'Meera joins and is dealt a 15-number ticket at once');
let nani = (await must(act(code, 'nani', { type: 'join', name: 'Meera' }), 'second Meera joins')).game;
ok(nani.you.name === 'Meera (2)' && nani.players.map((p) => p.name).join('|') === 'Priya|Meera|Meera (2)', 'a second "Meera" is shown as "Meera (2)"');
ok(new Set(nani.players.map((p) => p.color)).size === 3 && nani.players[0].color === 'oklch(0.68 0.22 358)', 'avatar colours follow join order');
const again = (await must(act(code, 'meera', { type: 'join', name: 'Someone else' }), 'meera joins again')).game;
ok(again.players.length === 3 && again.you.pid === meera.you.pid && JSON.stringify(again.you.ticket) === JSON.stringify(meera.you.ticket), 'joining again from the same device gives the same seat and ticket');

// ---------------------------------------------------------------- host-only
for (const action of [{ type: 'start' }, { type: 'draw' }, { type: 'setAuto', auto: 6 }, { type: 'newRound' }]) {
  for (const who of ['meera', 'visitor']) {
    r = await act(code, who, action);
    ok(r.status === 403 && r.json.ok === false && r.json.error === 'Only the host can do that', `${who} cannot ${action.type} (403)`);
  }
}
r = await act(code, 'host', { type: 'draw' });
ok(r.status === 409 && r.json.ok === false, 'the host cannot draw before starting (409)');
r = await act(code, 'host', { type: 'dance' });
ok(r.status === 400, 'an unknown action is refused (400)');
r = await call('POST', `/api/games/${code}/act`, 'host', undefined);
ok(r.status === 400, 'an empty body is refused (400)');
r = await get(code, 'host');
ok(r.json.game.status === 'lobby' && r.json.game.called.length === 0, 'none of that changed the game');

// ---------------------------------------------------------------- start, draw, mark
let host = (await must(act(code, 'host', { type: 'start' }), 'host starts')).game;
ok(host.status === 'live', 'the host starts the game');
for (const who of ['meera', 'visitor']) {
  r = await act(code, who, { type: 'draw' });
  ok(r.status === 403, `${who} still cannot draw once live (403)`);
}
host = (await must(act(code, 'host', { type: 'draw' }), 'first draw')).game;
ok(host.called.length === 1 && host.called[0] >= 1 && host.called[0] <= 90, `the host draws a number (${host.called[0]})`);
const lateJoin = (await must(act(code, 'late', { type: 'join', name: 'Latecomer' }), 'late join')).game;
ok(lateJoin.status === 'live' && lateJoin.you.role === 'player' && nums(lateJoin.you.ticket).length === 15, 'joining while the game is live works and deals a ticket');

const uncalled = nums(meera.you.ticket).find((n) => !host.called.includes(n));
r = await act(code, 'meera', { type: 'mark', n: uncalled });
ok(r.status === 400 && r.json.ok === false && r.json.error === `${uncalled} hasn’t been called yet`, `marking an uncalled number is refused: "${r.json.error}"`);
const notMine = Array.from({ length: 90 }, (_, i) => i + 1).find((n) => !nums(meera.you.ticket).includes(n));
r = await act(code, 'meera', { type: 'mark', n: notMine });
ok(r.status === 400 && r.json.ok === false, 'marking a number that is not on your ticket is refused');
r = await act(code, 'visitor', { type: 'mark', n: host.called[0] });
ok(r.status === 403, 'a visitor cannot mark anything (403)');

// ---------------------------------------------------------------- invalid claim: gentle, and nothing changes
const beforeClaim = (await must(get(code, 'meera'), 'view')).game;
r = await act(code, 'meera', { type: 'claim', prizeId: 'top' });
ok(r.json.ok === false && r.json.error === 'Not yet for Top Line — keep playing!', `an early claim gets the gentle "${r.json.error}"`);
const afterClaim = (await must(get(code, 'meera'), 'view')).game;
ok(afterClaim.version === beforeClaim.version && afterClaim.prizes.every((p) => p.winnerPid === null) && JSON.stringify(afterClaim.events) === JSON.stringify(beforeClaim.events),
  'the invalid claim changed nothing: same version, no winner, no event');
r = await act(code, 'visitor', { type: 'claim', prizeId: 'top' });
ok(r.status === 403, 'a visitor cannot claim (403)');
r = await act(code, 'meera', { type: 'claim', prizeId: 'star' });
ok(r.status === 400, 'claiming a prize that is not in this game is refused');

// ---------------------------------------------------------------- draw until both top lines are complete
const topMeera = row(meera.you.ticket, 0);
const topNani = row(nani.you.ticket, 0);
while (![...topMeera, ...topNani].every((n) => host.called.includes(n))) {
  host = (await must(act(code, 'host', { type: 'draw' }), 'draw')).game;
}
ok(host.status === 'live' && new Set(host.called).size === host.called.length, `drew ${host.called.length} numbers, no repeats, until both top lines were out`);
const versionBeforeMarks = host.version;
for (const n of topMeera) meera = (await must(act(code, 'meera', { type: 'mark', n }), 'meera marks')).game;
for (const n of topNani) nani = (await must(act(code, 'nani', { type: 'mark', n, on: true }), 'nani marks')).game;
ok(topMeera.every((n) => meera.you.marks.includes(n)) && meera.you.marks.length === 5, 'Meera dabbed her top line');
meera = (await must(act(code, 'meera', { type: 'mark', n: topMeera[0] }), 'toggle off')).game;
ok(!meera.you.marks.includes(topMeera[0]), 'tapping a dab again removes it');
r = await act(code, 'meera', { type: 'claim', prizeId: 'top' });
ok(r.json.ok === false && r.json.error === 'Not yet for Top Line — keep playing!', 'called but not dabbed does not count');
meera = (await must(act(code, 'meera', { type: 'mark', n: topMeera[0] }), 'toggle on')).game;
ok(meera.version === versionBeforeMarks, 'dabbing does not change the public game version');

// ---------------------------------------------------------------- privacy
const views = {};
for (const who of ['host', 'meera', 'nani', 'late', 'visitor']) {
  const res = await get(code, who);
  views[who] = res;
  noSecrets(res.text, `${who}'s view`);
}
const tickets = Object.fromEntries(['host', 'meera', 'nani', 'late'].map((who) => [who, views[who].json.game.you.ticket]));
for (const viewer of ['host', 'meera', 'nani', 'late', 'visitor']) {
  for (const owner of ['host', 'meera', 'nani', 'late']) {
    if (viewer === owner) continue;
    const leaked = views[viewer].text.includes(JSON.stringify(tickets[owner])) || tickets[owner].some((rw) => views[viewer].text.includes(JSON.stringify(rw)));
    ok(!leaked, `${viewer}'s view does not contain ${owner}'s ticket`);
  }
}
ok(JSON.stringify(views.meera.json.game.you.marks.slice().sort()) === JSON.stringify(topMeera.slice().sort()), 'Meera sees her own marks');
ok(!views.meera.text.includes(JSON.stringify(views.nani.json.game.you.marks)) && !views.host.text.includes(JSON.stringify(views.meera.json.game.you.marks)), 'nobody else’s marks are in another view');
ok((views.meera.text.match(/"ticket"/g) ?? []).length === 1 && (views.meera.text.match(/"marks"/g) ?? []).length === 1, 'a player view holds exactly one ticket and one marks list');
ok(!/ticket|marks/.test(views.visitor.text), 'the visitor view holds no ticket or marks');

// ---------------------------------------------------------------- two simultaneous claims for the same prize
const [c1, c2] = await Promise.all([act(code, 'meera', { type: 'claim', prizeId: 'top' }), act(code, 'nani', { type: 'claim', prizeId: 'top' })]);
const winners = [c1, c2].filter((c) => c.json.ok === true);
ok(winners.length === 1, 'two simultaneous valid claims for Top Line: exactly one wins');
const winnerName = c1.json.ok ? 'Meera' : 'Meera (2)';
const loser = c1.json.ok ? c2 : c1;
ok(loser.json.ok === false && loser.json.error === `${winnerName} already won Top Line`, `the other gets "${loser.json.error}"`);
host = (await must(get(code, 'host'), 'view')).game;
const top = host.prizes.find((p) => p.id === 'top');
ok(top.winnerName === winnerName && typeof top.wonAt === 'number' && host.events.filter((e) => e.kind === 'win').length === 1, `the game records one win: ${winnerName} — Top Line`);
ok(host.status === 'live', 'the game goes on (Full House is still open)');

// ---------------------------------------------------------------- auto-call setting
host = (await must(act(code, 'host', { type: 'setAuto', auto: 6 }), 'auto on')).game;
ok(host.auto === 6, 'the host turns auto-call on (6s)');
r = await act(code, 'host', { type: 'setAuto', auto: 5 });
ok(r.status === 400, 'auto-call must be 4, 6, 8 or 10 seconds');

// ---------------------------------------------------------------- finish: all 90 numbers
while (host.status === 'live') host = (await must(act(code, 'host', { type: 'draw' }), 'draw')).game;
ok(host.status === 'done' && host.called.length === 90 && new Set(host.called).size === 90 && host.auto === 0, 'after the 90th number the game is done and auto-call is off');
r = await act(code, 'host', { type: 'draw' });
ok(r.status === 409, 'no more draws once the game is done');
r = await act(code, 'tooLate', { type: 'join', name: 'Too Late' });
ok(r.status === 409 && r.json.ok === false && r.json.error === 'This game has finished — ask Priya to start another round', `joining a finished game is refused: "${r.json.error}"`);
r = await get(code, 'tooLate');
ok(r.json.game.you.role === 'visitor' && r.json.game.status === 'done', 'they stay a visitor');

// ---------------------------------------------------------------- new round
r = await act(code, 'meera', { type: 'newRound' });
ok(r.status === 403, 'a player cannot start a new round (403)');
host = (await must(act(code, 'host', { type: 'newRound' }), 'new round')).game;
ok(host.status === 'lobby' && host.round === 2 && host.called.length === 0 && host.code === code, 'the host starts a new round: same code, back in the lobby, round 2');
ok(host.prizes.every((p) => p.winnerPid === null && p.winnerName === null) && host.players.length === 4, 'prizes cleared, same four people');
for (const who of ['host', 'meera', 'nani', 'late']) {
  const v = (await must(get(code, who), 'view')).game;
  ok(JSON.stringify(v.you.ticket) !== JSON.stringify(tickets[who]) && nums(v.you.ticket).length === 15 && v.you.marks.length === 0, `${who} has a fresh ticket and no marks`);
}
r = await get(code, 'visitor');
ok(r.json.game.you.role === 'visitor' && r.json.game.round === 2 && !/ticket|marks|called/.test(r.text), 'the visitor still sees no tickets');
const joinedNow = (await must(act(code, 'tooLate', { type: 'join', name: 'Too Late' }), 'join next round')).game;
ok(joinedNow.you.role === 'player' && joinedNow.players.length === 5, 'the latecomer can join the next round');
host = (await must(act(code, 'host', { type: 'start' }), 'start round 2')).game;
host = (await must(act(code, 'host', { type: 'draw' }), 'draw round 2')).game;
ok(host.status === 'live' && host.called.length === 1, 'round 2 starts and draws');

// ---------------------------------------------------------------- notify me
r = await call('POST', '/api/notify', 'visitor', { phone: '98100' });
ok(r.status === 400 && r.json.ok === false, 'notify: a short number is refused');
r = await call('POST', '/api/notify', 'visitor', { phone: '9810011001' });
ok(r.status === 200 && r.json.ok === true, 'notify: a 10-digit number is saved');

console.log(`\nAll ${checks} checks passed.`);
