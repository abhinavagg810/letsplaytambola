import { describe, expect, it } from 'vitest';
import {
  AVATAR_COLORS, COPY, EVENT_LIMIT, MAX_PLAYERS, RULES, applyAction, checkPattern, cleanName, createGame, latestWin,
  projectView, uniqueDisplayName, validateTicket,
} from '../index';
import type { Actor, GameAction, GameState, MemberView, RuleId, VisitorView } from '../index';
import { CLASSIC, Table, VISITOR, mulberry32 } from './helpers';

const ctx = () => ({ now: 5000, rng: mulberry32(11) });
const err = (r: ReturnType<typeof applyAction>) => {
  if (r.ok) throw new Error('expected an error');
  return r;
};

describe('createGame', () => {
  it('builds a lobby with the host playing by default', () => {
    const r = createGame({ hostName: '  Priya  ', prizes: CLASSIC }, 'K7RQ2', ctx());
    if (!r.ok) throw new Error(r.error);
    const { doc, players } = r.state;
    expect(doc).toMatchObject({
      code: 'K7RQ2', name: 'Tambola Night', hostName: 'Priya', price: 0, status: 'lobby', called: [], auto: 0, round: 1,
      seq: 0, events: [], version: 1, createdAt: 5000, updatedAt: 5000,
    });
    expect(doc.prizes).toEqual(CLASSIC.map((rule) => ({
      id: rule, rule, label: RULES.find((x) => x.id === rule)!.name, winnerPid: null, winnerName: null, wonAt: null, amount: 0,
    })));
    expect(doc.players).toHaveLength(1);
    expect(doc.players[0]).toMatchObject({ name: 'Priya', color: AVATAR_COLORS[0], joinedAt: 5000 });
    expect(doc.hostPid).toBe(doc.players[0].pid);
    expect(r.pid).toBe(doc.hostPid);
    expect(r.touched).toEqual([doc.hostPid]);
    expect(validateTicket(players[doc.hostPid!].ticket)).toBeNull();
    expect(players[doc.hostPid!].marks).toEqual([]);
  });

  it('can leave the host without a ticket', () => {
    const r = createGame({ hostName: 'Priya', name: ' Kitty   Party ', price: 100, hostPlays: false, prizes: ['full'] }, 'K7RQ2', ctx());
    if (!r.ok) throw new Error(r.error);
    expect(r.state.doc.name).toBe('Kitty Party');
    expect(r.state.doc.price).toBe(100);
    expect(r.state.doc.hostPid).toBeNull();
    expect(r.state.doc.players).toEqual([]);
    expect(r.state.players).toEqual({});
    expect(r.pid).toBeUndefined();
  });

  it('validates the host name', () => {
    expect(createGame({ hostName: '   ', prizes: ['full'] }, 'K7RQ2', ctx())).toMatchObject({ ok: false, error: 'Type your name first' });
    expect(createGame({ hostName: 'x'.repeat(25), prizes: ['full'] }, 'K7RQ2', ctx())).toMatchObject({ ok: false, code: 'invalid' });
    expect(createGame({ hostName: 'x'.repeat(24), prizes: ['full'] }, 'K7RQ2', ctx()).ok).toBe(true);
    expect(createGame({ prizes: ['full'] } as never, 'K7RQ2', ctx())).toMatchObject({ ok: false, error: 'Type your name first' });
    expect(createGame(null as never, 'K7RQ2', ctx())).toMatchObject({ ok: false });
  });

  it('validates the game name and price', () => {
    expect(createGame({ hostName: 'P', name: 'x'.repeat(33), prizes: ['full'] }, 'K7RQ2', ctx()).ok).toBe(false);
    expect(createGame({ hostName: 'P', name: 'x'.repeat(32), prizes: ['full'] }, 'K7RQ2', ctx()).ok).toBe(true);
    for (const price of [-1, 1.5, 100000, Number.NaN, '50' as never]) {
      expect(createGame({ hostName: 'P', price, prizes: ['full'] }, 'K7RQ2', ctx())).toMatchObject({ ok: false, code: 'invalid' });
    }
    for (const price of [0, 1, 99999]) expect(createGame({ hostName: 'P', price, prizes: ['full'] }, 'K7RQ2', ctx()).ok).toBe(true);
  });

  it('needs at least one known way to win, each picked once', () => {
    expect(createGame({ hostName: 'P', prizes: [] }, 'K7RQ2', ctx())).toMatchObject({ ok: false, error: 'Pick at least one way to win' });
    expect(createGame({ hostName: 'P' } as never, 'K7RQ2', ctx())).toMatchObject({ ok: false, error: 'Pick at least one way to win' });
    expect(createGame({ hostName: 'P', prizes: ['nope' as RuleId] }, 'K7RQ2', ctx()).ok).toBe(false);
    expect(createGame({ hostName: 'P', prizes: ['full', 'full'] }, 'K7RQ2', ctx()).ok).toBe(false);
    const all = createGame({ hostName: 'P', prizes: RULES.map((r) => r.id) }, 'K7RQ2', ctx());
    expect(all.ok && all.state.doc.prizes).toHaveLength(26);
  });
});

describe('names', () => {
  it('cleans names', () => {
    expect(cleanName('  Meera   Iyer \n')).toBe('Meera Iyer');
    expect(cleanName(42)).toBe('');
  });

  it('numbers duplicate display names', () => {
    expect(uniqueDisplayName('Meera', [])).toBe('Meera');
    expect(uniqueDisplayName('Meera', ['Meera'])).toBe('Meera (2)');
    expect(uniqueDisplayName('meera', ['Meera', 'Meera (2)'])).toBe('meera (3)');
    expect(uniqueDisplayName('Meera (2)', ['Meera', 'Meera (2)'])).toBe('Meera (2) (2)');
  });
});

describe('join', () => {
  it('deals a ticket at once, in the lobby and while live', () => {
    const t = new Table();
    const v0 = t.doc.version;
    const r = t.ok(VISITOR, { type: 'join', name: '  Meera ' });
    expect(r.changed).toBe(true);
    expect(r.touched).toEqual([r.pid]);
    expect(t.doc.version).toBe(v0 + 1);
    expect(t.doc.players[1]).toMatchObject({ pid: r.pid, name: 'Meera', color: AVATAR_COLORS[1] });
    expect(validateTicket(t.state.players[r.pid!].ticket)).toBeNull();
    expect(t.doc.events.at(-1)).toMatchObject({ kind: 'join', pid: r.pid, name: 'Meera', seq: 1 });

    t.ok(t.host, { type: 'start' });
    const late = t.join('Nani');
    expect(t.doc.status).toBe('live');
    expect(validateTicket(t.state.players[late.pid!].ticket)).toBeNull();
    expect(t.doc.players).toHaveLength(3);
  });

  it('shows duplicate names as "Meera (2)", "Meera (3)"', () => {
    const t = new Table();
    t.join('Meera');
    t.join('Meera');
    t.join('MEERA');
    t.join('Priya'); // same as the host, who is playing
    expect(t.doc.players.map((p) => p.name)).toEqual(['Priya', 'Meera', 'Meera (2)', 'MEERA (3)', 'Priya (2)']);
  });

  it('gives avatar colours by join order, wrapping after six', () => {
    const t = new Table({ hostPlays: false });
    for (let i = 0; i < 8; i++) t.join(`P${i}`);
    expect(t.doc.players.map((p) => p.color)).toEqual([...AVATAR_COLORS, AVATAR_COLORS[0], AVATAR_COLORS[1]]);
    expect(new Set(t.doc.players.map((p) => p.pid)).size).toBe(8);
  });

  it('validates the name', () => {
    const t = new Table();
    expect(err(t.act(VISITOR, { type: 'join', name: '  ' })).error).toBe('Type your name to join');
    expect(err(t.act(VISITOR, { type: 'join', name: 'x'.repeat(25) })).code).toBe('invalid');
    expect(err(t.act(VISITOR, { type: 'join' } as never)).error).toBe('Type your name to join');
    expect(t.act(VISITOR, { type: 'join', name: 'x'.repeat(24) }).ok).toBe(true);
  });

  it('is refused once the game is done, and open again after a new round', () => {
    const t = new Table({ prizes: ['full'] });
    t.join('Meera');
    t.ok(t.host, { type: 'start' });
    t.drawAll();
    expect(t.doc.status).toBe('done');
    const before = JSON.stringify(t.state);
    const r = err(t.act(VISITOR, { type: 'join', name: 'Latecomer' }));
    expect(r.code).toBe('state');
    expect(r.error).toBe('This game has finished — ask Priya to start another round');
    expect(JSON.stringify(t.state)).toBe(before);
    t.ok(t.host, { type: 'newRound' });
    expect(t.act(VISITOR, { type: 'join', name: 'Latecomer' }).ok).toBe(true);
  });

  it('is idempotent for a device that is already in', () => {
    const t = new Table();
    const meera = t.join('Meera');
    const before = t.state;
    const again = t.ok(meera, { type: 'join', name: 'Someone else' });
    expect(again).toMatchObject({ changed: false, touched: [], pid: meera.pid });
    expect(t.state).toBe(before);
    expect(t.ok(t.host, { type: 'join', name: 'Priya' }).changed).toBe(false);
  });

  it('a host who chose not to play cannot take a ticket later', () => {
    const t = new Table({ hostPlays: false });
    expect(err(t.act(t.host, { type: 'join', name: 'Priya' })).code).toBe('state');
  });

  it('has a safety cap on seats', () => {
    const t = new Table({ hostPlays: false });
    for (let i = 0; i < MAX_PLAYERS; i++) t.join(`P${i}`);
    expect(err(t.act(VISITOR, { type: 'join', name: 'One more' })).code).toBe('full');
  });
});

describe('host-only actions', () => {
  const HOST_ONLY: GameAction[] = [{ type: 'start' }, { type: 'draw' }, { type: 'setAuto', auto: 6 }, { type: 'newRound' }];

  it('a player or a visitor cannot start, draw, set auto-call or start a new round — in any status', () => {
    const t = new Table({ prizes: ['full'] });
    const meera = t.join('Meera');
    const tryAll = () => {
      for (const who of [meera, VISITOR, { isHost: false, pid: 'made-up' } as Actor]) {
        for (const action of HOST_ONLY) {
          const before = JSON.stringify(t.state);
          const r = err(t.act(who, action));
          expect(r.code).toBe('forbidden');
          expect(r.error).toBe('Only the host can do that');
          expect(JSON.stringify(t.state)).toBe(before);
        }
      }
    };
    tryAll(); // lobby
    t.ok(t.host, { type: 'start' });
    tryAll(); // live
    t.drawAll();
    tryAll(); // done
  });

  it('the host can', () => {
    const t = new Table({ prizes: ['full'] });
    t.join('Meera');
    expect(t.ok(t.host, { type: 'start' }).changed).toBe(true);
    expect(t.ok(t.host, { type: 'draw' }).changed).toBe(true);
    expect(t.ok(t.host, { type: 'setAuto', auto: 6 }).changed).toBe(true);
    t.drawAll();
    expect(t.ok(t.host, { type: 'newRound' }).changed).toBe(true);
  });

  it('a host without a ticket can run the game but cannot mark or claim', () => {
    const t = new Table({ hostPlays: false });
    t.join('Meera');
    t.ok(t.host, { type: 'start' });
    t.ok(t.host, { type: 'draw' });
    expect(err(t.act(t.host, { type: 'mark', n: t.doc.called[0] })).code).toBe('forbidden');
    expect(err(t.act(t.host, { type: 'claim', prizeId: 'top' })).code).toBe('forbidden');
  });
});

describe('start', () => {
  it('needs at least one player', () => {
    const t = new Table({ hostPlays: false });
    expect(err(t.act(t.host, { type: 'start' })).error).toBe('Share the link — no one has joined yet');
    t.join('Meera');
    t.ok(t.host, { type: 'start' });
    expect(t.doc.status).toBe('live');
    expect(t.doc.events.at(-1)).toMatchObject({ kind: 'start' });
  });

  it('a host who plays counts as a player', () => {
    const t = new Table();
    expect(t.act(t.host, { type: 'start' }).ok).toBe(true);
  });

  it('cannot start twice', () => {
    const t = new Table();
    t.ok(t.host, { type: 'start' });
    expect(err(t.act(t.host, { type: 'start' })).code).toBe('state');
  });
});

describe('draw', () => {
  it('only while live', () => {
    const t = new Table();
    expect(err(t.act(t.host, { type: 'draw' })).code).toBe('state');
  });

  it('calls each number exactly once and ends the game on the 90th', () => {
    const t = new Table({ prizes: ['full'] });
    t.ok(t.host, { type: 'start' });
    t.ok(t.host, { type: 'setAuto', auto: 4 });
    for (let i = 1; i <= 90; i++) {
      const v = t.doc.version;
      t.ok(t.host, { type: 'draw' });
      expect(t.doc.called).toHaveLength(i);
      expect(t.doc.version).toBe(v + 1);
      expect(t.doc.events.at(-1)).toMatchObject({ kind: 'call', n: t.doc.called.at(-1) });
      expect(t.doc.status).toBe(i < 90 ? 'live' : 'done');
    }
    expect([...t.doc.called].sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(t.doc.auto).toBe(0);
    expect(err(t.act(t.host, { type: 'draw' })).code).toBe('state');
    expect(t.doc.events.length).toBeLessThanOrEqual(EVENT_LIMIT);
    expect(t.doc.seq).toBeGreaterThan(90);
  });

  it('is uniform over the numbers that are left', () => {
    const count = new Map<number, number>();
    for (let seed = 1; seed <= 3000; seed++) {
      const t = new Table({ seed });
      t.ok(t.host, { type: 'start' });
      t.ok(t.host, { type: 'draw' });
      count.set(t.doc.called[0], (count.get(t.doc.called[0]) ?? 0) + 1);
    }
    expect(count.size).toBe(90);
    for (const c of count.values()) expect(c).toBeLessThan(80); // mean 33
  });

  it('survives an rng that returns values right at the edge', () => {
    const t = new Table();
    t.ok(t.host, { type: 'start' });
    t.ctx.rng = () => 0.9999999999999999;
    t.ok(t.host, { type: 'draw' });
    expect(t.doc.called).toEqual([90]);
  });
});

describe('setAuto', () => {
  it('accepts 0, 4, 6, 8, 10 while live', () => {
    const t = new Table();
    expect(err(t.act(t.host, { type: 'setAuto', auto: 6 })).code).toBe('state');
    t.ok(t.host, { type: 'start' });
    for (const auto of [4, 6, 8, 10, 0] as const) {
      t.ok(t.host, { type: 'setAuto', auto });
      expect(t.doc.auto).toBe(auto);
    }
    expect(t.ok(t.host, { type: 'setAuto', auto: 0 }).changed).toBe(false);
    for (const bad of [1, 5, 60, -4, '6', true, null]) {
      expect(err(t.act(t.host, { type: 'setAuto', auto: bad as never })).code).toBe('invalid');
    }
  });
});

describe('mark', () => {
  it('toggles a dab on a called number without touching the public document', () => {
    const t = new Table();
    const meera = t.join('Meera');
    t.ok(t.host, { type: 'start' });
    const n = t.nums(meera)[0];
    t.drawUntil([n]);
    const doc = JSON.stringify(t.doc);
    const r = t.ok(meera, { type: 'mark', n });
    expect(r).toMatchObject({ changed: false, touched: [meera.pid] });
    expect(t.marks(meera)).toEqual([n]);
    expect(JSON.stringify(t.doc)).toBe(doc);
    t.ok(meera, { type: 'mark', n });
    expect(t.marks(meera)).toEqual([]);
  });

  it('with `on` it sets instead of toggling', () => {
    const t = new Table();
    const meera = t.join('Meera');
    t.ok(t.host, { type: 'start' });
    const n = t.nums(meera)[0];
    t.drawUntil([n]);
    t.ok(meera, { type: 'mark', n, on: true });
    expect(t.ok(meera, { type: 'mark', n, on: true }).touched).toEqual([]);
    expect(t.marks(meera)).toEqual([n]);
    t.ok(meera, { type: 'mark', n, on: false });
    expect(t.ok(meera, { type: 'mark', n, on: false }).touched).toEqual([]);
    expect(t.marks(meera)).toEqual([]);
  });

  it('refuses numbers that have not been called', () => {
    const t = new Table();
    const meera = t.join('Meera');
    t.ok(t.host, { type: 'start' });
    t.ok(t.host, { type: 'draw' });
    const n = t.nums(meera).find((x) => !t.doc.called.includes(x))!;
    const r = err(t.act(meera, { type: 'mark', n }));
    expect(r.error).toBe(`${n} hasn’t been called yet`);
    expect(t.marks(meera)).toEqual([]);
  });

  it('only on your own ticket: the action can only ever reach the actor’s marks', () => {
    const t = new Table();
    const meera = t.join('Meera');
    const nani = t.join('Nani');
    t.ok(t.host, { type: 'start' });
    const onlyNani = t.nums(nani).find((n) => !t.nums(meera).includes(n))!;
    t.drawUntil([onlyNani]);
    expect(err(t.act(meera, { type: 'mark', n: onlyNani })).error).toBe(`${onlyNani} isn’t on your ticket`);
    // extra fields naming another player are ignored: there is no way to address someone else's ticket
    const naniBefore = JSON.stringify(t.state.players[nani.pid!]);
    const shared = t.nums(meera).find((n) => t.doc.called.includes(n));
    if (shared) t.ok(meera, { type: 'mark', n: shared, pid: nani.pid } as never);
    expect(JSON.stringify(t.state.players[nani.pid!])).toBe(naniBefore);
    expect(err(t.act(VISITOR, { type: 'mark', n: onlyNani })).code).toBe('forbidden');
    expect(err(t.act({ isHost: false, pid: 'made-up' }, { type: 'mark', n: onlyNani })).code).toBe('forbidden');
  });

  it('only while live, and only whole numbers 1–90', () => {
    const t = new Table();
    const meera = t.join('Meera');
    expect(err(t.act(meera, { type: 'mark', n: t.nums(meera)[0] })).code).toBe('state');
    t.ok(t.host, { type: 'start' });
    for (const bad of [0, 91, 1.5, '7', null]) expect(err(t.act(meera, { type: 'mark', n: bad as never })).code).toBe('invalid');
  });
});

describe('claim', () => {
  function liveTable() {
    const t = new Table();
    const meera = t.join('Meera');
    const nani = t.join('Nani');
    t.ok(t.host, { type: 'start' });
    return { t, meera, nani };
  }

  it('a valid claim sets the winner and tells everyone', () => {
    const { t, meera } = liveTable();
    const top = t.row(meera, 0);
    t.drawUntil(top);
    t.markAll(meera, top);
    const v = t.doc.version;
    const r = t.ok(meera, { type: 'claim', prizeId: 'top' });
    expect(r.changed).toBe(true);
    expect(t.doc.version).toBe(v + 1);
    expect(t.doc.prizes.find((p) => p.id === 'top')).toMatchObject({ winnerPid: meera.pid, winnerName: 'Meera', wonAt: t.ctx.now });
    expect(t.doc.events.at(-1)).toMatchObject({ kind: 'win', pid: meera.pid, name: 'Meera', prizeId: 'top', label: 'Top Line' });
    expect(latestWin(t.doc)).toMatchObject({ name: 'Meera', label: 'Top Line' });
    expect(t.doc.status).toBe('live');
  });

  it('an invalid claim is a gentle error and changes nothing', () => {
    const { t, meera } = liveTable();
    const top = t.row(meera, 0);
    t.drawUntil(top);
    t.markAll(meera, top.slice(0, 4)); // called, but one not dabbed
    const before = JSON.stringify(t.state);
    const r = err(t.act(meera, { type: 'claim', prizeId: 'top' }));
    expect(r.code).toBe('not_yet');
    expect(r.error).toBe('Not yet for Top Line — keep playing!');
    expect(JSON.stringify(t.state)).toBe(before);
    expect(latestWin(t.doc)).toBeNull();
  });

  it('checks the claimant’s own ticket and dabs, nobody else’s', () => {
    const { t, meera, nani } = liveTable();
    const top = t.row(meera, 0);
    t.drawUntil(top);
    t.markAll(meera, top);
    if (!checkPattern(t.state.players[nani.pid!].ticket, t.marks(nani), t.doc.called, 'top')) {
      expect(err(t.act(nani, { type: 'claim', prizeId: 'top' })).code).toBe('not_yet');
    }
    expect(t.act(meera, { type: 'claim', prizeId: 'top' }).ok).toBe(true);
  });

  it('first valid claim wins; the second gets "already won"', () => {
    const { t, meera, nani } = liveTable();
    t.drawUntil([...t.row(meera, 0), ...t.row(nani, 0)]);
    t.markAll(meera, t.row(meera, 0));
    t.markAll(nani, t.row(nani, 0));
    // both read the same state, as two simultaneous requests would
    const a = applyAction(t.state, { type: 'claim', prizeId: 'top' }, meera, t.ctx);
    const b = applyAction(t.state, { type: 'claim', prizeId: 'top' }, nani, t.ctx);
    expect(a.ok && b.ok).toBe(true); // each valid on its own: the store's compare-and-swap lets only one in
    t.ok(meera, { type: 'claim', prizeId: 'top' });
    const second = err(t.act(nani, { type: 'claim', prizeId: 'top' }));
    expect(second.code).toBe('taken');
    expect(second.error).toBe('Meera already won Top Line');
    expect(t.doc.prizes.find((p) => p.id === 'top')!.winnerPid).toBe(meera.pid);
  });

  it('one player may win several prizes (as in the prototype)', () => {
    const { t, meera } = liveTable();
    const nums = t.nums(meera);
    t.drawUntil(nums);
    if (t.doc.status !== 'live') return; // 90 numbers were needed; nothing left to claim
    t.markAll(meera, nums);
    for (const id of ['early5', 'top', 'middle', 'bottom', 'corners']) t.ok(meera, { type: 'claim', prizeId: id });
    expect(t.doc.status).toBe('live');
    t.ok(meera, { type: 'claim', prizeId: 'full' });
    expect(t.doc.prizes.every((p) => p.winnerPid === meera.pid)).toBe(true);
  });

  it('the game ends when every prize has a winner', () => {
    const t = new Table({ prizes: ['early5'] });
    const meera = t.join('Meera');
    t.ok(t.host, { type: 'start' });
    t.ok(t.host, { type: 'setAuto', auto: 6 });
    const five = t.nums(meera).slice(0, 5);
    t.drawUntil(five);
    t.markAll(meera, five);
    t.ok(meera, { type: 'claim', prizeId: 'early5' });
    expect(t.doc.status).toBe('done');
    expect(t.doc.auto).toBe(0);
    expect(err(t.act(t.host, { type: 'draw' })).code).toBe('state');
    expect(err(t.act(meera, { type: 'claim', prizeId: 'early5' })).code).toBe('state');
  });

  it('refuses unknown prizes, the lobby, and people without a ticket', () => {
    const t = new Table();
    const meera = t.join('Meera');
    expect(err(t.act(meera, { type: 'claim', prizeId: 'top' })).code).toBe('state');
    t.ok(t.host, { type: 'start' });
    expect(err(t.act(meera, { type: 'claim', prizeId: 'star' })).code).toBe('invalid');
    expect(err(t.act(meera, { type: 'claim' } as never)).code).toBe('invalid');
    expect(err(t.act(VISITOR, { type: 'claim', prizeId: 'top' })).code).toBe('forbidden');
  });

  it('dabs made before a number… cannot exist; and un-dabbing takes a win away', () => {
    const { t, meera } = liveTable();
    const top = t.row(meera, 0);
    t.drawUntil(top);
    t.markAll(meera, top);
    t.ok(meera, { type: 'mark', n: top[0], on: false });
    expect(err(t.act(meera, { type: 'claim', prizeId: 'top' })).code).toBe('not_yet');
  });
});

describe('newRound', () => {
  it('only from done', () => {
    const t = new Table();
    expect(err(t.act(t.host, { type: 'newRound' })).error).toBe('Finish this round first');
    t.ok(t.host, { type: 'start' });
    expect(err(t.act(t.host, { type: 'newRound' })).code).toBe('state');
  });

  it('back to the lobby: same code and people, fresh tickets, prizes and marks cleared', () => {
    const t = new Table({ prizes: ['early5', 'full'] });
    const meera = t.join('Meera');
    const nani = t.join('Nani');
    t.ok(t.host, { type: 'start' });
    const five = t.nums(meera).slice(0, 5);
    t.drawUntil(five);
    t.markAll(meera, five);
    t.ok(meera, { type: 'claim', prizeId: 'early5' });
    t.drawAll();
    expect(t.doc.status).toBe('done');

    const oldTickets = JSON.parse(JSON.stringify(t.state.players)) as GameState['players'];
    const oldPlayers = JSON.stringify(t.doc.players);
    const r = t.ok(t.host, { type: 'newRound' });
    expect(r.changed).toBe(true);
    expect([...r.touched].sort()).toEqual([t.host.pid, meera.pid, nani.pid].sort());
    expect(t.doc).toMatchObject({ code: 'K7RQ2', status: 'lobby', called: [], auto: 0, round: 2 });
    expect(JSON.stringify(t.doc.players)).toBe(oldPlayers);
    expect(t.doc.prizes.map((p) => [p.id, p.winnerPid, p.winnerName, p.wonAt])).toEqual([['early5', null, null, null], ['full', null, null, null]]);
    expect(t.doc.events.at(-1)).toMatchObject({ kind: 'round', round: 2 });
    for (const pid of Object.keys(oldTickets)) {
      expect(validateTicket(t.state.players[pid].ticket)).toBeNull();
      expect(t.state.players[pid].ticket).not.toEqual(oldTickets[pid].ticket);
      expect(t.state.players[pid].marks).toEqual([]);
    }
    // and the next round plays
    t.ok(t.host, { type: 'start' });
    t.ok(t.host, { type: 'draw' });
    expect(t.doc.called).toHaveLength(1);
  });
});

describe('applyAction', () => {
  it('never mutates the state it was given', () => {
    const t = new Table();
    const meera = t.join('Meera');
    t.ok(t.host, { type: 'start' });
    t.ok(t.host, { type: 'draw' });
    const frozen = JSON.stringify(t.state);
    const n = t.nums(meera)[0];
    const actions: [Actor, GameAction][] = [
      [VISITOR, { type: 'join', name: 'Nani' }], [t.host, { type: 'draw' }], [t.host, { type: 'setAuto', auto: 8 }],
      [meera, { type: 'mark', n }], [meera, { type: 'claim', prizeId: 'top' }], [t.host, { type: 'newRound' }],
    ];
    for (const [who, action] of actions) applyAction(t.state, action, who, t.ctx);
    expect(JSON.stringify(t.state)).toBe(frozen);
  });

  it('rejects junk', () => {
    const t = new Table();
    for (const junk of [null, undefined, 'draw', 7, {}, { type: 5 }, { type: 'reset' }, { type: 'constructor' }]) {
      expect(err(applyAction(t.state, junk as never, t.host, t.ctx)).code).toBe('invalid');
    }
  });
});

describe('projectView — what each device may see', () => {
  function played() {
    const t = new Table({ price: 100 });
    const meera = t.join('Meera');
    const nani = t.join('Nani');
    t.ok(t.host, { type: 'start' });
    for (const who of [t.host, meera, nani]) {
      const row = t.row(who, 1);
      t.drawUntil(row);
      t.markAll(who, row.filter((n) => t.doc.called.includes(n)));
    }
    return { t, meera, nani };
  }
  /** Fingerprints of a player's private state as they would appear in JSON. */
  const prints = (t: Table, who: Actor) => {
    const p = t.state.players[who.pid!];
    return [JSON.stringify(p.ticket), ...p.ticket.map((row) => JSON.stringify(row)), JSON.stringify(p.marks)];
  };

  it('a player gets the public game plus their own ticket and marks only', () => {
    const { t, meera, nani } = played();
    const view = projectView(t.state, meera, 9000) as MemberView;
    expect(view.you).toEqual({ role: 'player', name: 'Meera', pid: meera.pid, ticket: t.state.players[meera.pid!].ticket, marks: t.marks(meera) });
    expect(view.playerCount).toBe(3);
    expect(view.now).toBe(9000);
    expect(view.players).toEqual(t.doc.players);
    expect(view.called).toEqual(t.doc.called);
    const json = JSON.stringify(view);
    for (const other of [nani, t.host]) for (const print of prints(t, other)) expect(json).not.toContain(print);
    expect(json).not.toContain('"players":{');
    expect(Object.keys(view).sort()).toEqual([...Object.keys(t.doc), 'now', 'playerCount', 'you'].sort());
  });

  it('a host who plays has role "host" and a ticket; nobody else’s ticket', () => {
    const { t, meera, nani } = played();
    const view = projectView(t.state, t.host, 9000) as MemberView;
    expect(view.you.role).toBe('host');
    expect(view.you).toMatchObject({ name: 'Priya', pid: t.host.pid, ticket: t.state.players[t.host.pid!].ticket, marks: t.marks(t.host) });
    const json = JSON.stringify(view);
    for (const other of [meera, nani]) for (const print of prints(t, other)) expect(json).not.toContain(print);
  });

  it('a host who does not play has no ticket and sees none', () => {
    const t = new Table({ hostPlays: false });
    const meera = t.join('Meera');
    t.ok(t.host, { type: 'start' });
    const view = projectView(t.state, t.host, 9000) as MemberView;
    expect(view.you).toEqual({ role: 'host', name: 'Priya' });
    const json = JSON.stringify(view);
    for (const print of prints(t, meera).slice(0, 4)) expect(json).not.toContain(print);
    expect(json).not.toContain('ticket');
    expect(json).not.toContain('marks');
  });

  it('a visitor gets the invite card only', () => {
    const { t, meera, nani } = played();
    const view = projectView(t.state, VISITOR, 9000) as VisitorView;
    expect(view).toEqual({
      code: 'K7RQ2', name: 'Diwali Night', hostName: 'Priya', price: 100, status: 'live', round: 1, playerCount: 3,
      prizes: t.doc.prizes.map((p) => ({ id: p.id, rule: p.rule, label: p.label })),
      version: t.doc.version, now: 9000, you: { role: 'visitor' },
    });
    const json = JSON.stringify(view);
    for (const word of ['ticket', 'marks', 'called', 'players"', 'events', 'pid', 'winner']) expect(json).not.toContain(word);
    for (const who of [t.host, meera, nani]) for (const print of prints(t, who)) expect(json).not.toContain(print);
  });

  it('a made-up pid is a visitor', () => {
    const { t } = played();
    expect(projectView(t.state, { isHost: false, pid: 'made-up' }, 1).you).toEqual({ role: 'visitor' });
  });

  it('views are copies: changing one cannot change the game', () => {
    const { t, meera } = played();
    const view = projectView(t.state, meera, 1) as MemberView;
    const before = JSON.stringify(t.state);
    view.called.push(99);
    view.you.ticket![0][0] = 99;
    view.you.marks!.push(99);
    view.players[0].name = 'x';
    expect(JSON.stringify(t.state)).toBe(before);
  });

  it('after a new round each player still sees only their own fresh ticket', () => {
    const t = new Table({ prizes: ['full'] });
    const meera = t.join('Meera');
    t.ok(t.host, { type: 'start' });
    t.drawAll();
    t.ok(t.host, { type: 'newRound' });
    const json = JSON.stringify(projectView(t.state, meera, 1));
    expect(json).toContain(JSON.stringify(t.state.players[meera.pid!].ticket));
    expect(json).not.toContain(JSON.stringify(t.state.players[t.host.pid!].ticket));
  });
});

describe('copy', () => {
  it('matches the prototype toasts', () => {
    expect(COPY.nameFirst).toBe('Type your name first');
    expect(COPY.nameToJoin).toBe('Type your name to join');
    expect(COPY.pickOne).toBe('Pick at least one way to win');
    expect(COPY.noPlayers).toBe('Share the link — no one has joined yet');
    expect(COPY.notCalled(42)).toBe('42 hasn’t been called yet');
    expect(COPY.notYet('Full House')).toBe('Not yet for Full House — keep playing!');
    expect(COPY.alreadyWon('Meera', 'Top Line')).toBe('Meera already won Top Line');
  });
});
