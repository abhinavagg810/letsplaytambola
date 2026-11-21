// The public API: validation, roles, privacy, concurrency, rate limits. No browser needed.
import { createHash } from 'node:crypto';
import { ALL_RULES, BASE, act, api, check, createGame, drawUntil, equal, needFor, newToken, view, wins } from '../lib.mjs';

const CLASSIC = ['early5', 'top', 'middle', 'bottom', 'corners', 'full'];
const sha = (t) => createHash('sha256').update(t.toLowerCase()).digest('hex');
const nums = (ticket) => ticket.flat().filter(Boolean);
const randomIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;

/** A started game: host (playing) + `n` players. Returns tokens and code. */
async function liveGame(n = 1, input = {}) {
  const host = newToken();
  const code = await createGame(host, input);
  const players = [];
  for (let i = 0; i < n; i++) {
    const tok = newToken();
    const r = await act(code, tok, { type: 'join', name: `Player ${i + 1}` });
    check(r.status === 200, `join ${i} → ${r.status} ${r.text}`);
    players.push(tok);
  }
  const s = await act(code, host, { type: 'start' });
  check(s.status === 200 && s.body.game.status === 'live', `start → ${s.status} ${s.text}`);
  return { code, host, players };
}
/** Dab every called number on this device's ticket. Returns the fresh view. */
async function dabAll(code, token) {
  let g = (await view(code, token)).body.game;
  for (const n of nums(g.you.ticket)) {
    if (g.called.includes(n) && !g.you.marks.includes(n)) g = (await act(code, token, { type: 'mark', n, on: true })).body.game;
  }
  return g;
}

const cases = [
  {
    id: 'API-01', area: 'API', priority: 'P0', type: 'functional',
    title: 'Create a game: 201, a 5-character code from the allowed alphabet, never cached',
    steps: 'POST /api/games with a device token and a valid body', expected: '201 {ok:true, code}; code matches [A-HJKMNP-Z2-9]{5}; Cache-Control: no-store',
    run: async (t) => {
      const r = await api('POST', '/api/games', newToken(), { hostName: 'Priya', prizes: CLASSIC });
      equal(r.status, 201, 'status');
      check(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/.test(r.body.code), `code shape: ${r.body.code}`);
      check(/no-store/.test(r.headers.get('cache-control') || ''), `cache-control: ${r.headers.get('cache-control')}`);
      equal(Object.keys(r.body).sort(), ['code', 'ok'], 'body keys');
      t.note(`code ${r.body.code}, cache-control "${r.headers.get('cache-control')}"`);
    },
  },
  {
    id: 'API-02', area: 'API', priority: 'P0', type: 'security',
    title: 'Create and act need a device token that is a UUID',
    steps: 'POST create / act with no token, an empty token, a non-UUID, an over-long token', expected: '401 no_token each time; nothing created',
    run: async () => {
      for (const tok of [null, 'abc', '1234', 'x'.repeat(36), newToken() + 'a', "' OR 1=1 --"]) {
        const r = await api('POST', '/api/games', tok, { hostName: 'Priya', prizes: CLASSIC });
        check(r.status === 401 && r.body.code === 'no_token', `create with token ${JSON.stringify(tok)} → ${r.status} ${r.text}`);
      }
      const code = await createGame(newToken());
      for (const tok of [null, 'abc']) {
        const r = await act(code, tok, { type: 'join', name: 'X' });
        check(r.status === 401 && r.body.code === 'no_token', `act with token ${JSON.stringify(tok)} → ${r.status}`);
      }
      const g = (await view(code, null)).body.game;
      equal(g.playerCount, 1, 'nobody joined without a token');
    },
  },
  {
    id: 'API-03', area: 'API', priority: 'P0', type: 'negative',
    title: 'Create validates every field (name, game name, price, toggle, prizes, amounts)',
    steps: 'POST create with each bad value in turn; then the boundary values', expected: '400 invalid with friendly copy for bad values; 201 for 24-char name, 32-char game name, price 0 and 99999, amount 999999',
    run: async (t) => {
      const tok = newToken();
      const bad = [
        [{ hostName: '' }, 'Type your name first'],
        [{ hostName: '    ' }, 'Type your name first'],
        [{ hostName: 12345 }, 'Type your name first'],
        [{ hostName: 'a'.repeat(25) }, 'Names can be up to 24 letters'],
        [{ name: 'g'.repeat(33) }, 'Game names can be up to 32 letters'],
        [{ price: -1 }, 'Ticket price'], [{ price: 1.5 }, 'Ticket price'], [{ price: 100000 }, 'Ticket price'], [{ price: '50' }, 'Ticket price'],
        [{ hostPlays: 'yes' }, 'Something went wrong'],
        [{ prizes: [] }, 'Pick at least one way to win'], [{ prizes: 'full' }, 'Pick at least one way to win'],
        [{ prizes: ['full', 'full'] }, 'isn’t on our list'], [{ prizes: ['second-house'] }, 'isn’t on our list'], [{ prizes: [null] }, 'isn’t on our list'],
        [{ amounts: { full: -5 } }, 'Prize amounts'], [{ amounts: { full: 1000000 } }, 'Prize amounts'], [{ amounts: { full: '100' } }, 'Prize amounts'], [{ amounts: [100] }, 'Prize amounts'], [{ amounts: { full: 10.5 } }, 'Prize amounts'],
      ];
      for (const [patch, copy] of bad) {
        const r = await api('POST', '/api/games', newToken(), { hostName: 'Priya', prizes: CLASSIC, ...patch });
        check(r.status === 400 && r.body.ok === false && r.body.code === 'invalid' && r.body.error.includes(copy), `${JSON.stringify(patch)} → ${r.status} ${r.text}`);
      }
      const good = [{ hostName: 'a'.repeat(24) }, { name: 'g'.repeat(32) }, { price: 0 }, { price: 99999 }, { amounts: { full: 999999 } }, { hostPlays: false }, { prizes: ALL_RULES }];
      for (const patch of good) {
        const r = await api('POST', '/api/games', tok, { hostName: 'Priya', prizes: CLASSIC, ...patch });
        check(r.status === 201, `${JSON.stringify(patch).slice(0, 60)} → ${r.status} ${r.text}`);
      }
      // Empty game name falls back to the default; names are trimmed and inner spaces collapsed.
      const code = await createGame(newToken(), { hostName: '  Priya   Sharma ', name: '   ' });
      const g = (await view(code, null)).body.game;
      equal([g.hostName, g.name], ['Priya Sharma', 'Tambola Night'], 'trimmed host name and default game name');
      t.note(`${bad.length} bad bodies refused with 400 + copy; ${good.length} boundary bodies accepted`);
    },
  },
  {
    id: 'API-04', area: 'API', priority: 'P1', type: 'negative',
    title: 'Malformed, non-object and oversized bodies are refused without a server error',
    steps: 'POST create/act/notify with: not JSON, a JSON array, a JSON string, an empty body, a 9 KB body, a 2 MB body', expected: '400 bad_request every time (never 500); the game is unchanged',
    run: async (t) => {
      const tok = newToken();
      const code = await createGame(tok);
      const big = JSON.stringify({ hostName: 'Priya', prizes: CLASSIC, pad: 'x'.repeat(9000) });
      const huge = JSON.stringify({ type: 'join', name: 'x'.repeat(2_000_000) });
      for (const [path, body] of [
        ['/api/games', '{not json'], ['/api/games', '[1,2]'], ['/api/games', '"hello"'], ['/api/games', ''], ['/api/games', 'null'], ['/api/games', big],
        [`/api/games/${code}/act`, '{'], [`/api/games/${code}/act`, '[]'], [`/api/games/${code}/act`, huge], [`/api/games/${code}/act`, '{"name":"no type"}'], [`/api/games/${code}/act`, '{"type":5}'],
        ['/api/notify', 'phone=9810011001'], ['/api/notify', '[]'],
      ]) {
        const r = await api('POST', path, newToken(), body, { 'Content-Type': 'application/json' });
        check(r.status === 400 && r.body && r.body.code === 'bad_request', `${path} ${body.slice(0, 20)}… → ${r.status} ${r.text.slice(0, 80)}`);
      }
      equal((await view(code, tok)).body.game.playerCount, 1, 'player count unchanged');
      t.note('13 bad bodies, all answered 400 bad_request, including a 2 MB body');
    },
  },
  {
    id: 'API-05', area: 'API', priority: 'P0', type: 'security',
    title: 'A visitor (not joined, or no token) gets the invite card only',
    steps: 'GET the game with no token and with a stranger token, in lobby, live and done', expected: 'Only: code, name, hostName, price, status, round, playerCount, prizes{id,rule,label}, version, now, you{role:visitor}. No players, called numbers, events, winners or amounts',
    run: async (t) => {
      const { code, host } = await liveGame(2, { price: 50 });
      await act(code, host, { type: 'draw' });
      const allowed = ['code', 'hostName', 'name', 'now', 'playerCount', 'price', 'prizes', 'round', 'status', 'version', 'you'];
      for (const tok of [null, newToken()]) {
        const r = await view(code, tok);
        equal(r.status, 200, 'status');
        equal(Object.keys(r.body.game).sort(), allowed, `visitor view keys (token ${tok ? 'stranger' : 'none'})`);
        equal(r.body.game.you, { role: 'visitor' }, 'you');
        for (const p of r.body.game.prizes) equal(Object.keys(p).sort(), ['id', 'label', 'rule'], 'prize keys');
        check(/no-store/.test(r.headers.get('cache-control') || ''), 'no-store');
      }
      t.note(`visitor view keys: ${allowed.join(', ')}`);
    },
  },
  {
    id: 'API-06', area: 'API', priority: 'P1', type: 'negative',
    title: 'Game codes: case-insensitive; unknown, malformed and hostile codes answer 404 not_found',
    steps: 'GET with lower case; GET/POST with unknown code, too short, too long, forbidden letters (O, 0, I, 1, L), path tricks, script tags', expected: 'Lower case works. Everything else: 404 {ok:false, code:not_found, notFound:true}, the echoed code is at most 12 characters',
    run: async () => {
      const tok = newToken();
      const code = await createGame(tok);
      equal((await view(code.toLowerCase(), tok)).body.game.code, code, 'lower-case code');
      equal((await act(code.toLowerCase(), newToken(), { type: 'join', name: 'Meera' })).status, 200, 'join with lower-case code');
      for (const bad of ['ZZZZZ', 'ABC', 'ABCDEFG', 'O0I1L', '%3Cscript%3E', '..%2F..%2Fetc', 'A'.repeat(300), '%00%00%00%00%00', '__proto__', 'constructor']) {
        const r = await view(bad, tok);
        check(r.status === 404 && r.body && r.body.code === 'not_found' && r.body.notFound === true, `GET ${bad.slice(0, 20)} → ${r.status} ${r.text.slice(0, 80)}`);
        check(r.body.error.length <= 40, `error text is short: ${r.body.error}`);
        const a = await act(bad, tok, { type: 'join', name: 'X' });
        check(a.status === 404, `POST act ${bad.slice(0, 20)} → ${a.status}`);
      }
    },
  },
  {
    id: 'API-07', area: 'API', priority: 'P1', type: 'negative',
    title: 'Unknown actions and wrong HTTP methods are refused',
    steps: 'POST act with type "delete", "__proto__", "kick", "end"; GET/PUT/DELETE on the POST routes; POST on the GET route', expected: '400 for unknown actions; 405 for wrong methods; never 500',
    run: async () => {
      const tok = newToken();
      const code = await createGame(tok);
      for (const type of ['delete', '__proto__', 'kick', 'end', 'setHost', 'JOIN', '']) {
        const r = await act(code, tok, { type });
        check(r.status === 400, `type ${JSON.stringify(type)} → ${r.status} ${r.text.slice(0, 80)}`);
      }
      for (const [m, p] of [['GET', '/api/games'], ['PUT', '/api/games'], ['DELETE', `/api/games/${code}`], ['POST', `/api/games/${code}`], ['GET', `/api/games/${code}/act`], ['GET', '/api/notify'], ['PATCH', `/api/games/${code}/act`]]) {
        const r = await api(m, p, tok, m === 'GET' || m === 'DELETE' ? undefined : {});
        check(r.status === 405, `${m} ${p} → ${r.status}`);
      }
      equal((await view(code, tok)).body.game.status, 'lobby', 'game untouched');
    },
  },
  {
    id: 'API-08', area: 'API', priority: 'P0', type: 'security',
    title: 'Only the host can start, call numbers, switch auto-call and start a new round',
    steps: 'A player and a stranger try start, draw, setAuto and newRound in lobby, live and done', expected: '403 forbidden "Only the host can do that" each time; nothing changes',
    run: async (t) => {
      const host = newToken();
      const code = await createGame(host, { prizes: ['early5'] });
      const meera = newToken();
      await act(code, meera, { type: 'join', name: 'Meera' });
      const stranger = newToken();
      const tryAll = async (stage) => {
        const before = (await view(code, host)).body.game.version;
        for (const who of [meera, stranger]) {
          for (const a of [{ type: 'start' }, { type: 'draw' }, { type: 'draw', after: 0 }, { type: 'setAuto', auto: 4 }, { type: 'newRound' }]) {
            const r = await act(code, who, a);
            check(r.status === 403 && r.body.error === 'Only the host can do that', `${stage}: ${a.type} by ${who === meera ? 'player' : 'stranger'} → ${r.status} ${r.text}`);
          }
        }
        equal((await view(code, host)).body.game.version, before, `${stage}: version unchanged`);
      };
      await tryAll('lobby');
      await act(code, host, { type: 'start' });
      await tryAll('live');
      await drawUntil(code, host, (c) => c.length >= 60);
      const g = await dabAll(code, host);
      check(g.you.marks.length >= 5, 'host has 5 dabs after 60 numbers');
      equal((await act(code, host, { type: 'claim', prizeId: 'early5' })).body.game.status, 'done', 'game done');
      await tryAll('done');
      t.note('4 host-only actions × 2 non-hosts × 3 stages: all 403, version never moved');
    },
  },
  {
    id: 'API-09', area: 'API', priority: 'P1', type: 'negative',
    title: 'Actions at the wrong time are refused with 409 and friendly copy',
    steps: 'Draw / setAuto / mark / claim in the lobby; start twice; newRound while live; join when done; host tries to join', expected: '409 state with the copy from the rules table; no change',
    run: async () => {
      const host = newToken();
      const code = await createGame(host, { prizes: ['early5'] });
      const exp = async (tok, a, status, copy) => {
        const r = await act(code, tok, a);
        check(r.status === status && (r.body.error ?? '').includes(copy), `${JSON.stringify(a)} → ${r.status} ${r.text} (wanted ${status} "${copy}")`);
      };
      await exp(host, { type: 'draw' }, 409, 'hasn’t started yet');
      await exp(host, { type: 'setAuto', auto: 6 }, 409, 'hasn’t started yet');
      await exp(host, { type: 'mark', n: 5 }, 409, 'hasn’t started yet');
      await exp(host, { type: 'claim', prizeId: 'early5' }, 409, 'hasn’t started yet');
      await exp(host, { type: 'newRound' }, 409, 'Finish this round first');
      await exp(host, { type: 'join', name: 'Me again' }, 200, ''); // host who plays: same seat back
      await act(code, host, { type: 'start' });
      await exp(host, { type: 'start' }, 409, 'already started');
      await exp(host, { type: 'newRound' }, 409, 'Finish this round first');
      await exp(host, { type: 'setAuto', auto: 5 }, 400, 'Auto call can be 4, 6, 8 or 10 seconds');
      await exp(host, { type: 'setAuto', auto: '6' }, 400, 'Auto call');
      await exp(host, { type: 'claim', prizeId: 'full' }, 400, 'isn’t part of this game');
      await exp(host, { type: 'claim', prizeId: 42 }, 400, 'isn’t part of this game');
      await drawUntil(code, host, (c) => c.length >= 60);
      await dabAll(code, host);
      await act(code, host, { type: 'claim', prizeId: 'early5' });
      await exp(host, { type: 'draw' }, 409, 'This game has finished');
      await exp(host, { type: 'start' }, 409, 'This game has finished');
      await exp(newToken(), { type: 'join', name: 'Late' }, 409, 'This game has finished — ask Priya to start another round');
      await exp(host, { type: 'claim', prizeId: 'early5' }, 409, 'This game has finished');
      // A host who only calls cannot take a seat.
      const h2 = newToken();
      const code2 = await createGame(h2, { hostPlays: false });
      const r = await act(code2, h2, { type: 'join', name: 'Priya' });
      check(r.status === 409 && r.body.error === 'You’re hosting this game', `non-playing host join → ${r.status} ${r.text}`);
    },
  },
  {
    id: 'API-10', area: 'API', priority: 'P0', type: 'functional',
    title: 'Dabbing: only called numbers on your own ticket; undo; safe to repeat; private',
    steps: 'Mark an uncalled number, a number not on the ticket, 0, 91, "5"; mark a called number twice with on:true; toggle; check another player’s view and the version', expected: 'Refusals with copy "N hasn’t been called yet" / "N isn’t on your ticket"; on:true twice = one dab; toggle removes; version unchanged; other views contain nothing of it',
    run: async (t) => {
      const { code, host, players: [meera] } = await liveGame(1);
      let g = (await view(code, meera)).body.game;
      const mine = nums(g.you.ticket);
      const notMine = Array.from({ length: 90 }, (_, i) => i + 1).find((n) => !mine.includes(n));
      let r = await act(code, meera, { type: 'mark', n: mine[0] });
      check(r.status === 400 && r.body.error === `${mine[0]} hasn’t been called yet`, `uncalled → ${r.status} ${r.text}`);
      r = await act(code, meera, { type: 'mark', n: notMine });
      check(r.status === 400 && r.body.error === `${notMine} isn’t on your ticket`, `not on ticket → ${r.status} ${r.text}`);
      for (const n of [0, 91, -3, 2.5, '5', null]) check((await act(code, meera, { type: 'mark', n })).status === 400, `mark n=${JSON.stringify(n)} refused`);
      check((await act(code, meera, { type: 'mark', n: mine[0], on: 'yes' })).status === 400, 'on must be a boolean');
      const called = await drawUntil(code, host, (c) => mine.some((n) => c.includes(n)));
      const n = mine.find((x) => called.includes(x));
      const v0 = (await view(code, host)).body.game.version;
      await act(code, meera, { type: 'mark', n, on: true });
      g = (await act(code, meera, { type: 'mark', n, on: true })).body.game;
      equal(g.you.marks, [n], 'one dab after on:true twice');
      g = (await act(code, meera, { type: 'mark', n })).body.game;
      equal(g.you.marks, [], 'toggle removes the dab');
      g = (await act(code, meera, { type: 'mark', n })).body.game;
      equal(g.you.marks, [n], 'toggle dabs again');
      const hostView = (await view(code, host)).body;
      equal(hostView.game.version, v0, 'dabbing does not change the public version');
      check(!JSON.stringify({ ...hostView.game, you: null }).includes('"marks"'), 'no marks outside "you" in the host view');
      t.note(`number ${n}: dab/undo/dab ok; version stayed ${v0}`);
    },
  },
  {
    id: 'API-11', area: 'API', priority: 'P0', type: 'security',
    title: 'No response ever contains another player’s ticket or dabs, a device token, a token hash or the round history',
    steps: 'Play a full two-round game with a host, three players and a stranger; capture EVERY response each device receives; scan them', expected: 'Each device sees only its own ticket/marks (under "you"); no token, no SHA-256 of any token, no "history", no "tokenHash"/"rev" keys anywhere',
    run: async (t) => {
      const toks = { host: newToken(), a: newToken(), b: newToken(), c: newToken(), stranger: newToken() };
      const seen = Object.fromEntries(Object.keys(toks).map((k) => [k, []]));
      const call = async (who, method, path, body) => {
        const r = await api(method, path, toks[who], body);
        seen[who].push(r.text);
        return r;
      };
      const code = (await call('host', 'POST', '/api/games', { hostName: 'Priya', price: 20, prizes: ['early5', 'top', 'full'] })).body.code;
      const P = `/api/games/${code}`;
      for (const who of ['a', 'b', 'c']) await call(who, 'POST', `${P}/act`, { type: 'join', name: `P-${who}` });
      await call('host', 'POST', `${P}/act`, { type: 'start' });
      const tickets = {};
      for (let round = 1; round <= 2; round++) {
        for (;;) {
          const g = (await call('host', 'POST', `${P}/act`, { type: 'draw' })).body.game;
          for (const who of ['host', 'a', 'b', 'c', 'stranger']) {
            const v = (await call(who, 'GET', P)).body.game;
            if (v.you.ticket) {
              tickets[`${who}${round}`] = JSON.stringify(v.you.ticket);
              for (const n of nums(v.you.ticket)) if (v.called.includes(n) && !v.you.marks.includes(n)) await call(who, 'POST', `${P}/act`, { type: 'mark', n, on: true });
            }
          }
          if (g.called.length % 10 === 0) for (const who of ['a', 'b', 'c', 'stranger']) for (const prizeId of ['early5', 'top', 'full']) await call(who, 'POST', `${P}/act`, { type: 'claim', prizeId });
          if (g.status !== 'live') break;
          if (g.called.length % 10 === 0 && (await call('host', 'GET', P)).body.game.status !== 'live') break;
        }
        if (round === 1) {
          await call('host', 'POST', `${P}/act`, { type: 'newRound' });
          await call('host', 'POST', `${P}/act`, { type: 'start' });
        }
      }
      let responses = 0;
      for (const who of Object.keys(toks)) {
        const text = seen[who].join('\n');
        responses += seen[who].length;
        for (const [other, tok] of Object.entries(toks)) {
          check(!text.includes(tok), `${who}'s responses contain ${other}'s device token`);
          check(!text.includes(sha(tok)), `${who}'s responses contain ${other}'s token hash`);
          check(!text.includes(sha(tok).slice(0, 16)), `${who}'s responses contain part of ${other}'s token hash`);
        }
        for (const key of ['"history"', '"tokenHash"', '"hostTokenHash"', '"rev"', '"token"', '"device']) check(!text.includes(key), `${who}'s responses contain the key ${key}`);
        for (const [owner, ticket] of Object.entries(tickets)) {
          if (!owner.startsWith(who === 'stranger' ? '#' : who)) check(!text.includes(ticket), `${who}'s responses contain ${owner}'s ticket`);
        }
        // "ticket" and "marks" only ever appear inside "you".
        for (const raw of seen[who]) {
          const body = JSON.parse(raw);
          if (body.game) check(!/"ticket"|"marks"/.test(JSON.stringify({ ...body.game, you: null })), `${who}: ticket/marks outside "you"`);
        }
      }
      check(!seen.stranger.join('').includes('"ticket"'), 'the stranger never receives any ticket');
      check(Object.keys(tickets).length === 8, `captured 8 tickets (4 holders × 2 rounds), got ${Object.keys(tickets).length}`);
      t.note(`${responses} responses scanned across 5 devices and 2 rounds; 8 tickets, 5 tokens and their hashes never leaked`);
    },
  },
  {
    id: 'API-12', area: 'API', priority: 'P0', type: 'functional',
    title: 'Claims are checked on the server: not yet → gentle refusal; valid → winner; already won → refusal',
    steps: 'Claim Top Line with nothing dabbed; draw until the top line is called but do NOT dab → claim; dab → claim; claim again from both devices', expected: '200 ok:false not_yet "Not yet for Top Line — keep playing!" with no version change; then a win event + winner; then 200 ok:false taken "<name> already won Top Line"',
    run: async (t) => {
      let code, host, meera, g, top, r;
      for (let attempt = 0; ; attempt++) {
        ({ code, host, players: [meera] } = await liveGame(1, { prizes: ['top', 'full'] }));
        g = (await view(code, meera)).body.game;
        top = g.you.ticket[0].filter(Boolean);
        const v0 = g.version;
        r = await act(code, meera, { type: 'claim', prizeId: 'top' });
        check(r.status === 200 && r.body.ok === false && r.body.code === 'not_yet' && r.body.error === 'Not yet for Top Line — keep playing!', `claim with nothing → ${r.status} ${r.text}`);
        equal((await view(code, meera)).body.game.version, v0, 'a refused claim changes nothing');
        await drawUntil(code, host, (c) => top.every((n) => c.includes(n)));
        if ((await view(code, host)).body.game.status === 'live') break; // else the line needed the 90th number: deal again
        check(attempt < 5, 'could not get a live game with the top line out');
      }
      r = await act(code, meera, { type: 'claim', prizeId: 'top' });
      check(r.body.code === 'not_yet', `all called but not dabbed must still be "not yet" → ${r.text}`);
      for (const n of top.slice(0, 4)) await act(code, meera, { type: 'mark', n, on: true });
      check((await act(code, meera, { type: 'claim', prizeId: 'top' })).body.code === 'not_yet', '4 of 5 dabbed is not yet');
      await act(code, meera, { type: 'mark', n: top[4], on: true });
      r = await act(code, meera, { type: 'claim', prizeId: 'top' });
      check(r.status === 200 && r.body.ok === true, `valid claim → ${r.status} ${r.text}`);
      g = r.body.game;
      const prize = g.prizes.find((p) => p.id === 'top');
      equal([prize.winnerName, prize.winnerPid], ['Player 1', g.you.pid], 'winner');
      const ev = g.events[g.events.length - 1];
      equal([ev.kind, ev.name, ev.label], ['win', 'Player 1', 'Top Line'], 'win event');
      equal(g.status, 'live', 'game continues (Full House still open)');
      for (const who of [meera, host]) {
        r = await act(code, who, { type: 'claim', prizeId: 'top' });
        check(r.status === 200 && r.body.ok === false && r.body.code === 'taken' && r.body.error === 'Player 1 already won Top Line', `second claim → ${r.text}`);
      }
      t.note(`top line ${top.join(',')}: refused at 0/5 and 4/5 dabs and when called-but-undabbed; accepted at 5/5; repeat claims "already won"`);
    },
  },
  {
    id: 'API-13', area: 'API', priority: 'P0', type: 'concurrency',
    title: 'Two devices claiming the same prize at the same instant: exactly one wins',
    steps: '8 games: two players both complete Early Five; fire both claims together (Promise.all)', expected: 'In every game exactly one ok:true and one "already won"; one win event; never a 5xx',
    run: async (t) => {
      let firstWins = 0;
      for (let i = 0; i < 8; i++) {
        const { code, host, players: [a, b] } = await liveGame(2, { hostPlays: false, prizes: ['early5', 'full'] });
        await drawUntil(code, host, (c) => c.length >= 70);
        await Promise.all([dabAll(code, a), dabAll(code, b)]);
        const [ra, rb] = await Promise.all([act(code, a, { type: 'claim', prizeId: 'early5' }), act(code, b, { type: 'claim', prizeId: 'early5' })]);
        check(ra.status === 200 && rb.status === 200, `statuses ${ra.status}/${rb.status}`);
        const oks = [ra, rb].filter((r) => r.body.ok === true);
        const taken = [ra, rb].filter((r) => r.body.code === 'taken');
        check(oks.length === 1 && taken.length === 1, `game ${i}: ${ra.text.slice(0, 60)} | ${rb.text.slice(0, 60)}`);
        const g = (await view(code, host)).body.game;
        equal(g.events.filter((e) => e.kind === 'win').length, 1, 'one win event');
        if (ra.body.ok) firstWins++;
      }
      t.note(`8 simultaneous pairs: always one winner (first request won ${firstWins}×, second ${8 - firstWins}×)`);
    },
  },
  {
    id: 'API-14', area: 'API', priority: 'P1', type: 'resilience',
    title: 'Replaying requests is harmless (join twice, draw with the same "after", start twice)',
    steps: 'Send the same join 5× at once from one device; send draw {after:n} 6× at once; replay it later', expected: 'One seat, same pid; exactly one number called per value of "after"',
    run: async (t) => {
      const host = newToken();
      const code = await createGame(host);
      const meera = newToken();
      const joins = await Promise.all(Array.from({ length: 5 }, () => act(code, meera, { type: 'join', name: 'Meera' })));
      const okJoins = joins.filter((r) => r.status === 200);
      check(okJoins.length >= 1, `at least one join succeeded: ${joins.map((r) => r.status)}`);
      check(joins.every((r) => r.status === 200 || r.status === 503), `join statuses ${joins.map((r) => r.status)}`);
      const g = (await view(code, meera)).body.game;
      equal(g.players.filter((p) => p.name.startsWith('Meera')).length, 1, 'one Meera');
      equal(new Set(okJoins.map((r) => r.body.game.you.pid)).size, 1, 'same pid every time');
      await act(code, host, { type: 'start' });
      for (let n = 0; n < 5; n++) {
        const rs = await Promise.all(Array.from({ length: 6 }, () => act(code, host, { type: 'draw', after: n })));
        check(rs.every((r) => r.status === 200), `draw statuses ${rs.map((r) => r.status)}`);
        equal((await view(code, host)).body.game.called.length, n + 1, `after ${n}: numbers called`);
      }
      await act(code, host, { type: 'draw', after: 2 }); // an old request arriving late
      equal((await view(code, host)).body.game.called.length, 5, 'a stale draw does nothing');
      t.note(`join statuses ${joins.map((r) => r.status).join('/')}; 30 concurrent draws produced exactly 5 numbers`);
    },
  },
  {
    id: 'API-15', area: 'API', priority: 'P1', type: 'security',
    title: 'Rate limits answer 429 with friendly copy (create, join, notify, view) and recover per device',
    steps: 'One device: 13 creates; 31 joins; 6 notifies; 241 views. Then another device does one of each', expected: 'The request over each limit gets 429 rate_limited "Too many tries — please wait a minute and try again"; the other device is not affected',
    run: async (t) => {
      const probe = await api('POST', '/api/notify', newToken(), { phone: '98' });
      const tok = newToken();
      const many = async (n, fn) => { let last; for (let i = 0; i < n; i++) last = await fn(i); return last; };
      let r = await many(13, () => api('POST', '/api/games', tok, { hostName: 'Priya', prizes: CLASSIC }));
      if (r.status === 201) { t.note('SKIPPED: this server runs with RATE_LIMIT_DISABLED=1'); check(process.env.E2E_ALLOW_NO_LIMITS === '1', 'rate limits are switched off on this server (set E2E_ALLOW_NO_LIMITS=1 to accept)'); return; }
      check(r.status === 429 && r.body.code === 'rate_limited' && r.body.error === 'Too many tries — please wait a minute and try again', `13th create → ${r.status} ${r.text}`);
      const code = await createGame(newToken());
      r = await many(31, () => act(code, tok, { type: 'join', name: 'Meera' }));
      check(r.status === 429, `31st join → ${r.status}`);
      r = await many(6, () => api('POST', '/api/notify', tok, { phone: '9810011001' }));
      check(r.status === 429, `6th notify → ${r.status}`);
      const viewer = newToken();
      r = await many(241, () => view(code, viewer));
      check(r.status === 429, `241st view in a minute → ${r.status}`);
      const other = newToken();
      equal((await api('POST', '/api/games', other, { hostName: 'Priya', prizes: CLASSIC })).status, 201, 'another device can still create');
      equal((await view(code, other)).status, 200, 'another device can still view');
      // Per address: 20 notifies an hour whatever the device.
      const ip = randomIp();
      r = await many(21, () => api('POST', '/api/notify', newToken(), { phone: '9810011001' }, { 'x-forwarded-for': ip }));
      check(r.status === 429, `21st notify from one address → ${r.status}`);
      t.note(`limits hit at create 13, join 31, notify 6 (device) and 21 (address), view 241; probe status ${probe.status}`);
    },
  },
  {
    id: 'API-16', area: 'API', priority: 'P1', type: 'edge',
    title: 'A game holds 100 players; the 101st is told it is full',
    steps: 'Host plays; 99 devices join; one more tries; then the 100 existing devices re-open', expected: '100 seats with unique pids and valid tickets; 101st → 409 full "This game is full"; existing players still get their seat',
    run: async (t) => {
      const host = newToken();
      const code = await createGame(host);
      const toks = Array.from({ length: 99 }, newToken);
      for (let i = 0; i < toks.length; i += 11) {
        const rs = await Promise.all(toks.slice(i, i + 11).map((tok, k) => act(code, tok, { type: 'join', name: `Guest ${i + k}` })));
        for (const r of rs) check(r.status === 200, `join → ${r.status} ${r.text.slice(0, 80)}`);
      }
      const g = (await view(code, host)).body.game;
      equal([g.players.length, new Set(g.players.map((p) => p.pid)).size, g.playerCount], [100, 100, 100], 'players / unique pids / count');
      const r = await act(code, newToken(), { type: 'join', name: 'One too many' });
      check(r.status === 409 && r.body.code === 'full' && r.body.error === 'This game is full', `101st → ${r.status} ${r.text}`);
      equal((await act(code, toks[98], { type: 'join', name: 'Guest again' })).status, 200, 'an existing player re-joining still works');
      const size = JSON.stringify(g).length;
      t.note(`100 players; member view is ${(size / 1024).toFixed(1)} KB`);
      check(size < 60_000, `view stays small (${size} bytes)`);
    },
  },
  {
    id: 'API-17', area: 'API', priority: 'P1', type: 'edge',
    title: 'Duplicate names get "(2)", "(3)" — ignoring case, counting the host; unusual names are kept as typed',
    steps: 'Host "Meera" plays; join as "meera", "MEERA ", "Meera (2)"; join with Hindi, emoji, RTL, 24 chars, HTML', expected: '"meera (2)", "MEERA (3)", "Meera (2) (2)"; other names stored verbatim (trimmed); a 25-char name and a blank or invisible name are refused',
    run: async (t) => {
      const host = newToken();
      const code = await createGame(host, { hostName: 'Meera' });
      const join = async (name) => (await act(code, newToken(), { type: 'join', name }));
      equal((await join('meera')).body.game.you.name, 'meera (2)', 'second Meera');
      equal((await join('  MEERA  ')).body.game.you.name, 'MEERA (3)', 'third Meera');
      equal((await join('Meera (2)')).body.game.you.name, 'Meera (2) (2)', 'someone typing "Meera (2)"');
      for (const name of ['मीरा देवी', 'Nani 👵🏽', 'مريم', '<img src=x onerror=a()>', '"><svg onload=alert(1)>', '</script><script>x()', 'a'.repeat(24), "O'Brien & Sons", 'Robert\'); DROP TABLE players;--'.slice(0, 24)]) {
        const r = await join(name);
        check(r.status === 200 && r.body.game.you.name === name, `name ${JSON.stringify(name)} → ${r.status} ${r.body?.game?.you?.name ?? r.text}`);
      }
      for (const [name, copy] of [['a'.repeat(25), 'Names can be up to 24 letters'], ['', 'Type your name to join'], ['   ', 'Type your name to join'], ['​​', 'Type your name to join'], ['‮', 'Type your name to join'], [null, 'Type your name to join'], [{ a: 1 }, 'Type your name to join']]) {
        const r = await join(name);
        check(r.status === 400 && r.body.error === copy, `name ${JSON.stringify(name)} → ${r.status} ${r.text}`);
      }
      equal((await join('‮areeM')).body.game.you.name, 'areeM', 'text-flipping character removed');
      t.note('duplicates numbered; Hindi, emoji, Arabic, HTML and SQL-looking names stored as plain text; blank/invisible names refused');
    },
  },
  {
    id: 'API-18', area: 'API', priority: 'P0', type: 'functional',
    title: 'Prize amounts: ticket money is split at start; a late joiner raises only open prizes; typed amounts never change',
    steps: 'A) price ₹100, classic prizes, host+2 start → check sum; one prize won; a 4th joins live. B) host types amounts for two prizes, price ₹100 → start, late joiner, new round. C) no price, no amounts', expected: 'A) amounts add up to price × players, lobby shows 0, won prize keeps its amount, open ones add up to the rest, new round resets to 0 in the lobby. B) exactly as typed always. C) all 0',
    run: async (t) => {
      const sum = (g, f = () => true) => g.prizes.filter(f).reduce((a, p) => a + p.amount, 0);
      // A — automatic split
      const host = newToken();
      const code = await createGame(host, { price: 100 });
      const [a, b] = [newToken(), newToken()];
      await act(code, a, { type: 'join', name: 'A' });
      let g = (await act(code, b, { type: 'join', name: 'B' })).body.game;
      equal(sum(g), 0, 'A: no amounts in the lobby');
      g = (await act(code, host, { type: 'start' })).body.game;
      equal(sum(g), 300, 'A: amounts add up to 3 × ₹100');
      check(g.prizes.every((p) => p.amount > 0 && p.amount % 10 === 0), `A: round amounts ${g.prizes.map((p) => p.amount)}`);
      const full = g.prizes.find((p) => p.id === 'full').amount;
      check(g.prizes.every((p) => p.amount <= full), 'A: Full House is the biggest prize');
      await drawUntil(code, host, (c) => c.length >= 60);
      await dabAll(code, a);
      g = (await act(code, a, { type: 'claim', prizeId: 'early5' })).body.game;
      const wonAmount = g.prizes.find((p) => p.id === 'early5').amount;
      g = (await act(code, newToken(), { type: 'join', name: 'Late' })).body.game;
      equal(g.prizes.find((p) => p.id === 'early5').amount, wonAmount, 'A: the prize already won keeps its amount');
      equal(sum(g), 400, 'A: total is now 4 × ₹100');
      equal(sum(g, (p) => !p.winnerPid), 400 - wonAmount, 'A: the late ticket went to the open prizes');
      t.note(`A: start ${JSON.stringify(Object.fromEntries(g.prizes.map((p) => [p.id, p.amount])))} after late joiner; early5 stayed ₹${wonAmount}`);
      await drawUntil(code, host, () => false);
      g = (await act(code, host, { type: 'newRound' })).body.game;
      equal(sum(g), 0, 'A: new round is back to 0 until it starts');
      g = (await act(code, host, { type: 'start' })).body.game;
      equal(sum(g), 400, 'A: round 2 splits 4 × ₹100 afresh');
      // B — typed by the host
      const h2 = newToken();
      const code2 = await createGame(h2, { price: 100, prizes: ['top', 'middle', 'full'], amounts: { top: 51, full: 500, early5: 999 } });
      const typed = (x) => x.prizes.map((p) => p.amount);
      g = (await view(code2, h2)).body.game;
      equal(typed(g), [51, 0, 500], 'B: typed amounts show in the lobby; unpicked pattern ignored');
      equal((await view(code2, null)).body.game.prizes[0].amount, undefined, 'B: visitors do not see amounts');
      await act(code2, newToken(), { type: 'join', name: 'A' });
      g = (await act(code2, h2, { type: 'start' })).body.game;
      equal(typed(g), [51, 0, 500], 'B: start does not split');
      g = (await act(code2, newToken(), { type: 'join', name: 'Late' })).body.game;
      equal(typed(g), [51, 0, 500], 'B: late joiner changes nothing');
      await drawUntil(code2, h2, () => false);
      g = (await act(code2, h2, { type: 'newRound' })).body.game;
      equal(typed(g), [51, 0, 500], 'B: kept for the next round');
      // C — no money at all
      const h3 = newToken();
      const code3 = await createGame(h3, { amounts: { full: 0 } });
      g = (await act(code3, h3, { type: 'start' })).body.game;
      equal(sum(g), 0, 'C: no price, no amounts → all 0');
    },
  },
  {
    id: 'API-19', area: 'API', priority: 'P0', type: 'functional',
    title: 'The round ends when every prize is won, or when the 90th number is called (auto-call switches off)',
    steps: 'Game 1: one prize, claim it. Game 2: auto on, draw 90 numbers with nobody claiming', expected: 'Game 1: status done at the win, auto 0. Game 2: 90 distinct numbers 1–90, status done on the 90th, auto 0, a 91st draw is refused',
    run: async (t) => {
      const g1 = await liveGame(1, { prizes: ['early5'] });
      await act(g1.code, g1.host, { type: 'setAuto', auto: 4 });
      await drawUntil(g1.code, g1.host, (c) => c.length >= 50);
      await dabAll(g1.code, g1.players[0]);
      let g = (await act(g1.code, g1.players[0], { type: 'claim', prizeId: 'early5' })).body.game;
      equal([g.status, g.auto], ['done', 0], 'game 1 after the last prize');
      const g2 = await liveGame(1);
      await act(g2.code, g2.host, { type: 'setAuto', auto: 10 });
      const called = await drawUntil(g2.code, g2.host, () => false);
      g = (await view(g2.code, g2.host)).body.game;
      equal([called.length, new Set(called).size, Math.min(...called), Math.max(...called)], [90, 90, 1, 90], 'all 90 numbers once each');
      equal([g.status, g.auto], ['done', 0], 'game 2 after the 90th number');
      equal((await act(g2.code, g2.host, { type: 'draw' })).status, 409, 'no 91st number');
      t.note(`first ten numbers of the 90: ${called.slice(0, 10).join(', ')}`);
    },
  },
  {
    id: 'API-20', area: 'API', priority: 'P0', type: 'functional',
    title: 'Play again: same code and people, round +1, fresh tickets, dabs and winners cleared, joining open again',
    steps: 'Finish a round with dabs and a winner; host sends newRound; compare views; a newcomer joins', expected: 'status lobby, round 2, called [], winners null, every ticket different from round 1 and valid, marks [], same pids; newcomer gets a seat',
    run: async (t) => {
      const { code, host, players: [meera] } = await liveGame(1, { prizes: ['early5', 'full'] });
      await drawUntil(code, host, (c) => c.length >= 60);
      const before = { host: await dabAll(code, host), meera: await dabAll(code, meera) };
      await act(code, meera, { type: 'claim', prizeId: 'early5' });
      await drawUntil(code, host, () => false);
      let g = (await act(code, host, { type: 'newRound' })).body.game;
      equal([g.status, g.round, g.called, g.auto, g.code], ['lobby', 2, [], 0, code], 'lobby of round 2');
      check(g.prizes.every((p) => p.winnerPid === null && p.winnerName === null && p.wonAt === null), 'winners cleared');
      equal(g.players.map((p) => p.pid), before.host.players.map((p) => p.pid), 'same people');
      for (const [who, tok] of [['host', host], ['meera', meera]]) {
        const v = (await view(code, tok)).body.game;
        check(JSON.stringify(v.you.ticket) !== JSON.stringify(before[who].you.ticket), `${who} has a fresh ticket`);
        equal(v.you.marks, [], `${who}: dabs cleared`);
        const rows = v.you.ticket.map((r) => r.filter(Boolean));
        check(rows.length === 3 && rows.every((r) => r.length === 5) && new Set(rows.flat()).size === 15, `${who}: valid ticket shape`);
      }
      equal(g.events[g.events.length - 1].kind, 'round', 'round event');
      equal((await act(code, newToken(), { type: 'join', name: 'Newcomer' })).status, 200, 'joining is open again');
      t.note('round 2: fresh valid tickets for both, winners and dabs cleared, same pids');
    },
  },
  {
    id: 'API-21', area: 'API', priority: 'P0', type: 'functional',
    title: 'All 26 ways to win: refused until the pattern is complete, accepted the moment it is (independent check)',
    steps: 'One game with all 26 patterns. After every number: dab it if on the ticket; for each open prize compare the server’s answer to an independent reading of the rule', expected: 'Server and the independent check agree on every claim (several hundred); each prize is won at the first number that completes it',
    run: async (t) => {
      const host = newToken();
      const code = await createGame(host, { prizes: ALL_RULES });
      let g = (await act(code, host, { type: 'start' })).body.game;
      const ticket = g.you.ticket;
      const mine = nums(ticket);
      let claims = 0;
      const wonAt = {};
      // Before anything is called every claim is "not yet".
      for (const rule of ALL_RULES) check((await act(code, host, { type: 'claim', prizeId: rule })).body.code === 'not_yet', `${rule} with nothing called`);
      while (g.status === 'live') {
        g = (await act(code, host, { type: 'draw' })).body.game;
        const n = g.called[g.called.length - 1];
        if (g.status !== 'live') break;
        if (!mine.includes(n)) continue;
        g = (await act(code, host, { type: 'mark', n, on: true })).body.game;
        for (const p of g.prizes.filter((x) => !x.winnerPid)) {
          const should = wins(ticket, p.rule, g.you.marks, g.called);
          const need = needFor(ticket, p.rule, g.called);
          // Ask the server whenever the rule should now be won, and (as a negative probe) when this number belongs to the pattern.
          if (!should && need.nums && !need.nums.includes(n)) continue;
          const r = await act(code, host, { type: 'claim', prizeId: p.id });
          claims++;
          const said = r.body.ok === true ? 'won' : r.body.code;
          check(said === (should ? 'won' : 'not_yet'), `${p.rule} after ${g.called.length} numbers (dabs ${g.you.marks}): server says ${said}, the rule says ${should ? 'won' : 'not yet'}`);
          if (should) { wonAt[p.rule] = g.called.length; g = r.body.game; if (g.status !== 'live') break; }
        }
      }
      g = (await view(code, host)).body.game;
      const open = g.prizes.filter((p) => !p.winnerPid).map((p) => p.rule);
      // Two honest reasons for a prize to stay open on a single ticket: Lucky Three needs 3 of the FIRST five numbers,
      // and a pattern whose last number was the 90th call cannot be claimed (the round ends the moment it is called —
      // see "needs decision" D-1 in the QA report).
      const last = g.called[89];
      const neededLast = (rule) => g.called.length === 90 && (needFor(ticket, rule, g.called).nums ?? mine).includes(last);
      check(open.every((r) => r === 'lucky3' || neededLast(r)), `prizes left open without a reason: ${open.filter((r) => r !== 'lucky3' && !neededLast(r))}`);
      check(Object.keys(wonAt).length + open.length === 26 && Object.keys(wonAt).length >= 12, `patterns won: ${Object.keys(wonAt).length}, open: ${open.length}`);
      if (open.some((r) => r !== 'lucky3')) t.note(`the 90th number (${last}) completed ${open.filter((r) => r !== 'lucky3').join(', ')} — they could not be claimed because the round ended on that call`);
      t.note(`${claims} claims compared with the independent rule check; won after N numbers: ${JSON.stringify(wonAt)}; left open: ${open.join(',') || 'none'}`);
    },
  },
  {
    id: 'API-22', area: 'API', priority: 'P1', type: 'functional',
    title: 'Lucky Three (3 of the first 5 numbers called) with 100 tickets in play',
    steps: '100 players; call 5 numbers; every player dabs; a player holding 3+ of the first five claims; a player holding fewer claims; later numbers must not count', expected: 'Holder of 3 wins; others "not yet" even after dabbing later numbers',
    run: async (t) => {
      for (let attempt = 1; attempt <= 4; attempt++) {
        const host = newToken();
        const code = await createGame(host, { prizes: ['lucky3', 'full'] });
        const toks = [host, ...Array.from({ length: 99 }, newToken)];
        for (let i = 1; i < toks.length; i += 11) await Promise.all(toks.slice(i, i + 11).map((tok, k) => act(code, tok, { type: 'join', name: `G${i + k}` })));
        await act(code, host, { type: 'start' });
        const first5 = await drawUntil(code, host, (c) => c.length >= 5);
        const views = [];
        for (const tok of toks) views.push((await view(code, tok)).body.game);
        const hits = views.map((v) => nums(v.you.ticket).filter((n) => first5.includes(n)).length);
        const lucky = hits.findIndex((h) => h >= 3);
        const unlucky = hits.findIndex((h) => h === 2);
        if (lucky < 0) { t.note(`attempt ${attempt}: nobody among 100 tickets held 3 of ${first5} — trying another game`); continue; }
        // The unlucky player dabs later numbers too: they must not count.
        if (unlucky >= 0) {
          await drawUntil(code, host, (c) => c.length >= 40);
          await dabAll(code, toks[unlucky]);
          const r = await act(code, toks[unlucky], { type: 'claim', prizeId: 'lucky3' });
          check(r.body.code === 'not_yet', `player with 2 of the first five and many later dabs → ${r.text.slice(0, 100)}`);
        }
        await dabAll(code, toks[lucky]);
        const r = await act(code, toks[lucky], { type: 'claim', prizeId: 'lucky3' });
        check(r.body.ok === true && r.body.game.prizes[0].winnerPid === views[lucky].you.pid, `lucky player → ${r.text.slice(0, 120)}`);
        t.note(`first five ${first5}; player #${lucky} held ${hits[lucky]} of them and won; ${hits.filter((h) => h >= 3).length} of 100 tickets qualified`);
        return;
      }
      check(false, 'no ticket qualified for Lucky Three in 4 games of 100 players (expected about 1 game in 30 to fail)');
    },
  },
  {
    id: 'API-23', area: 'API', priority: 'P1', type: 'negative',
    title: 'A host without a ticket can run the game but cannot dab or claim',
    steps: 'Create with hostPlays:false; start with no players; one joins; start; host marks and claims', expected: 'Start refused with "Share the link — no one has joined yet" until someone joins; host view has no ticket/pid; mark and claim → 403 "Join the game to get a ticket"',
    run: async () => {
      const host = newToken();
      const code = await createGame(host, { hostPlays: false });
      let r = await act(code, host, { type: 'start' });
      check(r.status === 409 && r.body.error === 'Share the link — no one has joined yet', `start with nobody → ${r.status} ${r.text}`);
      await act(code, newToken(), { type: 'join', name: 'Meera' });
      const g = (await act(code, host, { type: 'start' })).body.game;
      equal([g.you.role, g.you.ticket, g.you.pid, g.hostPid, g.players.length], ['host', undefined, undefined, null, 1], 'host view');
      await act(code, host, { type: 'draw' });
      for (const a of [{ type: 'mark', n: 5 }, { type: 'claim', prizeId: 'early5' }]) {
        r = await act(code, host, a);
        check(r.status === 403 && r.body.error === 'Join the game to get a ticket', `${a.type} → ${r.status} ${r.text}`);
      }
      // A stranger cannot dab or claim either.
      r = await act(code, newToken(), { type: 'claim', prizeId: 'early5' });
      check(r.status === 403, `stranger claim → ${r.status}`);
    },
  },
  {
    id: 'API-24', area: 'API', priority: 'P1', type: 'negative',
    title: 'Notify me accepts Indian mobile numbers only',
    steps: 'POST /api/notify with valid numbers (plain, spaced, +91, leading 0), then invalid ones (short, long, starts 1–5, letters, script, number types)', expected: '200 ok for valid; 400 invalid with "Please type a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)" for the rest; saving the same number twice is fine',
    run: async (t) => {
      const ip = randomIp();
      const post = (phone) => api('POST', '/api/notify', newToken(), { phone }, { 'x-forwarded-for': ip });
      for (const ok of ['9810011001', '98100 11001', '+91 98100-11001', '09810011001', '9810011001', '6000000001']) {
        const r = await post(ok);
        check(r.status === 200 && r.body.ok === true, `${ok} → ${r.status} ${r.text}`);
      }
      for (const bad of ['981001100', '98100110011', '1234567890', '5810011001', '0000000000', 'abcdefghij', '', '9810011001<script>', 9810011001, null, ['9810011001'], '９８１００１１００１']) {
        const r = await post(bad);
        check(r.status === 400 && r.body.code === 'invalid' && /10-digit Indian mobile number/.test(r.body.error), `${JSON.stringify(bad)} → ${r.status} ${r.text}`);
      }
      const r = await api('POST', '/api/notify', null, { phone: '9810011001' }, { 'x-forwarded-for': ip });
      equal(r.status, 200, 'no device token is fine here');
      t.note('6 valid forms saved; 12 invalid forms refused with the friendly message');
    },
  },
  {
    id: 'API-25', area: 'Security', priority: 'P1', type: 'security',
    title: 'Security headers on pages and API; no framework banner',
    steps: 'GET /, /host, /g/CODE, /api/games/CODE, a 404 page and a static asset; read the headers', expected: 'X-Frame-Options SAMEORIGIN + CSP frame-ancestors \'self\' (no clickjacking), X-Content-Type-Options nosniff, Referrer-Policy strict-origin-when-cross-origin, no X-Powered-By; API and /g/ carry X-Robots-Tag noindex; API is no-store',
    run: async (t) => {
      const code = await createGame(newToken());
      for (const p of ['/', '/host', '/host/prizes', '/join', '/privacy', '/terms', `/g/${code}`, `/api/games/${code}`, '/nope-not-here', '/robots.txt']) {
        const r = await fetch(BASE + p);
        const h = (k) => r.headers.get(k) || '';
        check(h('x-frame-options') === 'SAMEORIGIN', `${p}: X-Frame-Options "${h('x-frame-options')}"`);
        check(/frame-ancestors 'self'/.test(h('content-security-policy')), `${p}: CSP "${h('content-security-policy')}"`);
        check(h('x-content-type-options') === 'nosniff', `${p}: nosniff "${h('x-content-type-options')}"`);
        check(h('referrer-policy') === 'strict-origin-when-cross-origin', `${p}: Referrer-Policy "${h('referrer-policy')}"`);
        check(!r.headers.has('x-powered-by'), `${p}: X-Powered-By is sent`);
        if (p.startsWith('/api/') || p.startsWith('/g/')) check(/noindex/.test(h('x-robots-tag')), `${p}: X-Robots-Tag "${h('x-robots-tag')}"`);
        if (p.startsWith('/api/')) check(/no-store/.test(h('cache-control')) && /application\/json/.test(h('content-type')), `${p}: cache/content-type`);
        await r.arrayBuffer();
      }
      t.note('10 addresses checked: frame, nosniff, referrer headers present; no X-Powered-By');
    },
  },
  {
    id: 'API-26', area: 'Security', priority: 'P1', type: 'security',
    title: 'No open redirect and no Host-header poisoning',
    steps: 'GET //evil.example, /%2F%2Fevil.example, /g//evil.example, /join?next=https://evil.example; GET / and /g/CODE with Host and X-Forwarded-Host set to evil.example', expected: 'No redirect to another site; "evil.example" never appears in the HTML (share links are built in the browser from the real address)',
    run: async (t) => {
      const code = await createGame(newToken());
      for (const p of ['//evil.example', '/%2F%2Fevil.example', '/g//evil.example', '/join?next=https://evil.example', '/host?redirect=//evil.example', '/%5Cevil.example']) {
        const r = await fetch(BASE + p, { redirect: 'manual' });
        const loc = r.headers.get('location') || '';
        check(!/evil\.example/.test(loc) || new URL(loc, BASE).host === new URL(BASE).host, `${p} → ${r.status} Location: ${loc}`);
        await r.arrayBuffer();
      }
      for (const p of ['/', `/g/${code}`, '/host', '/join', '/sitemap.xml', '/robots.txt']) {
        const r = await fetch(BASE + p, { headers: { 'X-Forwarded-Host': 'forged-host.example', 'X-Forwarded-Proto': 'https', Forwarded: 'host=forged-host.example' } });
        const html = await r.text();
        check(!html.includes('forged-host.example'), `${p}: the forged host appears in the page`);
      }
      t.note('6 redirect probes and 5 forged-host probes: nothing reflected');
    },
  },
  {
    id: 'API-27', area: 'API', priority: 'P1', type: 'concurrency',
    title: '30 people tapping the invite link in the same second all get a seat',
    steps: '30 devices POST join at the same instant; then all 30 fetch their view', expected: 'All 30 succeed (the server retries behind the scenes); 30 unique seats; duplicate names numbered correctly; no 5xx',
    run: async (t) => {
      const host = newToken();
      const code = await createGame(host, { hostPlays: false });
      const toks = Array.from({ length: 30 }, newToken);
      const t0 = Date.now();
      const rs = await Promise.all(toks.map((tok, i) => act(code, tok, { type: 'join', name: i % 2 ? 'Meera' : `Guest ${i}` })));
      const statuses = rs.map((r) => r.status);
      const bad = statuses.filter((s) => s !== 200);
      t.note(`30 simultaneous joins in ${Date.now() - t0} ms; statuses: ${[...new Set(statuses)].map((s) => `${s}×${statuses.filter((x) => x === s).length}`).join(', ')}`);
      check(bad.length === 0, `some joins failed: ${statuses}`);
      const g = (await view(code, host)).body.game;
      equal([g.players.length, new Set(g.players.map((p) => p.pid)).size, new Set(g.players.map((p) => p.name.toLowerCase())).size], [30, 30, 30], 'seats / pids / unique display names');
    },
  },
  {
    id: 'API-28', area: 'API', priority: 'P1', type: 'edge',
    title: 'What happens to a prize that only the 90th number completes (and to slow claimers)',
    steps: 'Full House only, one ticket; call all 90 numbers while dabbing; after the 90th try to dab it and claim', expected: 'Recorded behaviour (as specified: "the game ends when all 90 numbers are called"): the round ends the instant the 90th number is called, so the last number cannot be dabbed and Full House can no longer be claimed — it stays "Open". Reported for the owner’s decision (D-1)',
    run: async (t) => {
      const host = newToken();
      const code = await createGame(host, { prizes: ['full'] });
      let g = (await act(code, host, { type: 'start' })).body.game;
      const mine = nums(g.you.ticket);
      for (;;) {
        g = (await act(code, host, { type: 'draw' })).body.game;
        const n = g.called[g.called.length - 1];
        if (g.status !== 'live') break;
        if (mine.includes(n)) await act(code, host, { type: 'mark', n, on: true });
      }
      equal([g.status, g.called.length], ['done', 90], 'round over at 90');
      const last = g.called[89];
      const mark = await act(code, host, { type: 'mark', n: mine.includes(last) ? last : mine[0], on: true });
      const claim = await act(code, host, { type: 'claim', prizeId: 'full' });
      equal([mark.status, claim.status, claim.body.error], [409, 409, 'This game has finished'], 'dab and claim after the 90th number');
      equal((await view(code, host)).body.game.prizes[0].winnerPid, null, 'Full House stays open');
      t.note(`ticket had ${mine.includes(last) ? 'the last number ' + last + ' on it' : 'all 15 numbers dabbed before the end'}; claim after the 90th call → 409 "This game has finished"`);
      t.open('D-1: once the 90th number is called the round ends at once — a prize completed by that number, or one a slow player has not claimed yet, can never be claimed. Matches the written spec; needs a product decision (e.g. keep claims open until the host taps "Finish")');
    },
  },
];
export default cases;
