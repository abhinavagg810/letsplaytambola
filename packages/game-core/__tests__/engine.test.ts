import { applyAction, createGameDoc, newCode, project, roundsOf, validateTicket } from '../src/index.ts';
import type { GameAction, GameDoc, Prize, Tickets } from '../src/index.ts';
import { CLASSIC, HOST, MEERA, NANI, RAHUL, Table, actor, mulberry32 } from '../test-utils.ts';

const HOUSES: Prize[] = [
  { id: 'full', label: 'Full House', rule: 'full', amt: 300 },
  { id: 'full2', label: 'Second House', rule: 'full', amt: 100 },
];

describe('newCode', () => {
  it('makes 5-character codes without look-alike characters', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) expect(newCode(rng)).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(newCode(() => 0)).toBe('AAAAA');
    expect(newCode(() => 0.9999999999)).toBe('99999');
  });
});

describe('createGameDoc', () => {
  const ctx = () => ({ now: 5, rng: mulberry32(1) });
  const base = { name: ' Diwali Night ', maxSeats: 6, price: 100, hostPlays: true, prizes: CLASSIC, invited: [], contacts: [] };

  it('creates a lobby and deals the host in', () => {
    const { doc, tickets, error } = createGameDoc(base, HOST, 'AB2CD', ctx());
    expect(error).toBeUndefined();
    expect(doc).toMatchObject({
      id: 'AB2CD', name: 'Diwali Night', hostUid: 'h', hostName: 'Priya Sharma', status: 'lobby', round: 1,
      maxSeats: 6, price: 100, called: [], claims: {}, auto: 0, seq: 0, feed: [], history: [], createdAt: 5, endedAt: null, version: 1,
    });
    expect(doc.prizes).toEqual(CLASSIC);
    expect(doc.players.map((p) => p.uid)).toEqual(['h']);
    expect(validateTicket(tickets.h.ticket)).toBeNull();
    expect(tickets.h.dabs).toEqual([]);
  });

  it('does not deal the host a ticket when the host only calls', () => {
    const { doc, tickets } = createGameDoc({ ...base, hostPlays: false }, HOST, 'AB2CD', ctx());
    expect(doc.players).toEqual([]);
    expect(tickets).toEqual({});
  });

  it('clamps seats and price, defaults the name', () => {
    expect(createGameDoc({ ...base, maxSeats: 1 }, HOST, 'X', ctx()).doc.maxSeats).toBe(2);
    expect(createGameDoc({ ...base, maxSeats: 99 }, HOST, 'X', ctx()).doc.maxSeats).toBe(30);
    expect(createGameDoc({ ...base, price: -50 }, HOST, 'X', ctx()).doc.price).toBe(0);
    expect(createGameDoc({ ...base, name: '   ' }, HOST, 'X', ctx()).doc.name).toBe('Tambola night');
  });

  it('forces prize amounts to 0 in a free game', () => {
    const { doc, error } = createGameDoc({ ...base, price: 0 }, HOST, 'X', ctx());
    expect(error).toBeUndefined();
    expect(doc.prizes.map((p) => p.amt)).toEqual([0, 0, 0, 0]);
  });

  it('rejects prizes that add up to more than the pot', () => {
    // pot = 100 x 3 = 300, prizes = 400
    expect(createGameDoc({ ...base, maxSeats: 3 }, HOST, 'X', ctx()).error).toBe('Prizes add up to more than the pot');
    // exactly the pot is fine
    expect(createGameDoc({ ...base, maxSeats: 4 }, HOST, 'X', ctx()).error).toBeUndefined();
  });

  it('keeps invited users (deduped, never the host) and contacts', () => {
    const inv = { uid: 'm', name: 'Meera Iyer', username: 'meera', color: '#FFB831' };
    const { doc } = createGameDoc({
      ...base, invited: [inv, inv, { uid: 'h', name: 'Me', username: null, color: '' }],
      contacts: [{ id: 'c1', name: 'Lata Aunty', phone: '919810011007', sent: true }],
    }, HOST, 'X', ctx());
    expect(doc.invited).toEqual([inv]);
    expect(doc.contacts).toEqual([{ id: 'c1', name: 'Lata Aunty', phone: '919810011007', sent: false }]);
  });
});

describe('joining', () => {
  it('deals a ticket, announces it and clears the invite', () => {
    const t = new Table();
    t.ok(HOST, { type: 'invite', users: [{ uid: 'm', name: 'Meera Iyer', username: 'meera', color: '#FFB831' }] });
    expect(t.doc.invited.map((u) => u.uid)).toEqual(['m']);
    const r = t.ok(MEERA, { type: 'join' });
    expect(r.docChanged).toBe(true);
    expect(r.touched).toEqual(['m']);
    expect(t.doc.players.map((p) => p.uid)).toEqual(['h', 'm']);
    expect(t.doc.invited).toEqual([]);
    expect(validateTicket(t.tickets.m.ticket)).toBeNull();
    expect(t.lastFeed()).toMatchObject({ kind: 'join', text: 'Meera Iyer grabbed a ticket' });
  });

  it('is a no-op for someone already in', () => {
    const t = new Table();
    t.ok(MEERA, { type: 'join' });
    const v = t.doc.version;
    const r = t.ok(MEERA, { type: 'join' });
    expect(r.docChanged).toBe(false);
    expect(r.touched).toEqual([]);
    expect(t.doc.version).toBe(v);
    expect(t.doc.players).toHaveLength(2);
  });

  it('turns people away when the game is full', () => {
    const t = new Table({ maxSeats: 2, prizes: [] });
    t.ok(MEERA, { type: 'join' });
    const r = t.act(NANI, { type: 'join' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Sorry — this game is full');
    expect(t.doc.players).toHaveLength(2);
    expect(t.tickets.n).toBeUndefined();
  });

  it('lets late joiners in while the game is live', () => {
    const t = new Table();
    t.ok(HOST, { type: 'start' });
    t.ok(HOST, { type: 'draw' });
    t.ok(MEERA, { type: 'join' });
    expect(t.tickets.m.dabs).toEqual([]);
    expect(t.doc.players).toHaveLength(2);
  });

  it('lets people view an ended game without joining it', () => {
    const t = new Table();
    t.ok(HOST, { type: 'start' });
    t.ok(HOST, { type: 'end' });
    const r = t.ok(MEERA, { type: 'join' });
    expect(r.docChanged).toBe(false);
    expect(t.doc.players).toHaveLength(1);
    expect(project(t.doc, t.tickets, 'm').me).toBeNull();
  });

  it('does not deal in a host who chose not to play', () => {
    const t = new Table({ hostPlays: false });
    const r = t.ok(HOST, { type: 'join' });
    expect(r.docChanged).toBe(false);
    expect(t.doc.players).toEqual([]);
  });
});

describe('host-only actions', () => {
  const hostOnly: GameAction[] = [
    { type: 'start' }, { type: 'draw' }, { type: 'setAuto', auto: 5 }, { type: 'restart', fresh: true },
    { type: 'end' }, { type: 'nextRound' }, { type: 'invite', users: [] },
    { type: 'addContacts', contacts: [] }, { type: 'markContactSent', contactId: 'c1' },
  ];
  it.each(hostOnly)('$type is refused for players', (action) => {
    const t = new Table();
    t.ok(MEERA, { type: 'join' });
    const before = JSON.stringify([t.doc, t.tickets]);
    const r = t.act(MEERA, action);
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Only the host can do that');
    expect(r.docChanged).toBe(false);
    expect(JSON.stringify([r.doc, r.tickets])).toBe(before);
  });

  it('only the host draws', () => {
    const t = new Table();
    t.ok(MEERA, { type: 'join' });
    t.ok(HOST, { type: 'start' });
    expect(t.act(MEERA, { type: 'draw' }).error).toBe('Only the host can do that');
    expect(t.act(actor('x', 'Stranger'), { type: 'draw' }).error).toBe('Only the host can do that');
    expect(t.doc.called).toEqual([]);
    t.ok(HOST, { type: 'draw' });
    expect(t.doc.called).toHaveLength(1);
  });
});

describe('start / draw / auto', () => {
  it('starts the game once', () => {
    const t = new Table();
    t.ok(HOST, { type: 'start' });
    expect(t.doc.status).toBe('live');
    expect(t.lastFeed()).toMatchObject({ kind: 'start', text: 'Priya started the game' });
    expect(t.act(HOST, { type: 'start' }).ok).toBe(false);
  });

  it('cannot draw before the game starts', () => {
    const t = new Table();
    expect(t.act(HOST, { type: 'draw' }).ok).toBe(false);
    expect(t.doc.called).toEqual([]);
  });

  it('draws all 90 numbers exactly once, then says so', () => {
    const t = new Table({ prizes: [] });
    t.ok(HOST, { type: 'start' });
    t.ok(HOST, { type: 'setAuto', auto: 8 });
    expect(t.doc.auto).toBe(8);
    for (let i = 0; i < 89; i++) t.ok(HOST, { type: 'draw' });
    expect(t.doc.auto).toBe(8);
    t.ok(HOST, { type: 'draw' });
    expect(t.doc.called).toHaveLength(90);
    expect(new Set(t.doc.called).size).toBe(90);
    expect(t.doc.called.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: 90 }, (_, i) => i + 1));
    expect(t.doc.auto).toBe(0); // auto-call switches off with the last number
    const r = t.act(HOST, { type: 'draw' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('All 90 numbers called');
    expect(t.doc.called).toHaveLength(90);
  });

  it('draws uniformly from what is left, using the injected rng', () => {
    const t = new Table({ prizes: [] });
    t.ok(HOST, { type: 'start' });
    t.ctx.rng = () => 0;
    t.ok(HOST, { type: 'draw' });
    t.ctx.rng = () => 0.999999;
    t.ok(HOST, { type: 'draw' });
    t.ctx.rng = () => 0;
    t.ok(HOST, { type: 'draw' });
    expect(t.doc.called).toEqual([1, 90, 2]);
  });

  it('sets the auto-call speed and rejects odd values', () => {
    const t = new Table();
    t.ok(HOST, { type: 'setAuto', auto: 12 });
    expect(t.doc.auto).toBe(12);
    expect(t.act(HOST, { type: 'setAuto', auto: 3 as 5 }).ok).toBe(false);
    expect(t.doc.auto).toBe(12);
  });

  it('bumps the version on every doc change and never mutates its inputs', () => {
    const t = new Table();
    const doc0 = t.doc, tk0 = t.tickets;
    const snap = JSON.stringify([doc0, tk0]);
    const r = applyAction(doc0, tk0, { type: 'start' }, HOST, t.ctx);
    expect(r.doc.version).toBe(doc0.version + 1);
    expect(r.doc).not.toBe(doc0);
    expect(r.tickets).not.toBe(tk0);
    expect(JSON.stringify([doc0, tk0])).toBe(snap);
    const j = applyAction(doc0, tk0, { type: 'join' }, MEERA, t.ctx);
    expect(j.doc.players).toHaveLength(2);
    expect(JSON.stringify([doc0, tk0])).toBe(snap);
  });
});

describe('dabbing', () => {
  const live = () => {
    const t = new Table();
    t.ok(MEERA, { type: 'join' });
    t.ok(HOST, { type: 'start' });
    return t;
  };

  it('rejects a number that has not been called', () => {
    const t = live();
    const n = t.nums(MEERA)[0];
    const r = t.act(MEERA, { type: 'dab', n });
    expect(r.ok).toBe(false);
    expect(r.error).toBe(`Not yet! ${n} hasn’t been called`);
    expect(t.tickets.m.dabs).toEqual([]);
  });

  it('toggles a called number and only touches that player’s ticket', () => {
    const t = live();
    const n = t.nums(MEERA)[3];
    t.drawUntil([n]);
    const v = t.doc.version;
    const r = t.ok(MEERA, { type: 'dab', n });
    expect(r.docChanged).toBe(false);
    expect(r.touched).toEqual(['m']);
    expect(t.doc.version).toBe(v);
    expect(t.tickets.m.dabs).toEqual([n]);
    expect(t.tickets.h.dabs).toEqual([]);
    t.ok(MEERA, { type: 'dab', n });
    expect(t.tickets.m.dabs).toEqual([]);
  });

  it('rejects numbers that are not on the ticket, non-players and games that are not live', () => {
    const t = live();
    const off = Array.from({ length: 90 }, (_, i) => i + 1).find((n) => !t.nums(MEERA).includes(n))!;
    t.drawUntil([off, t.nums(MEERA)[0]]);
    expect(t.act(MEERA, { type: 'dab', n: off }).ok).toBe(false);
    expect(t.act(MEERA, { type: 'dab', n: 0 }).ok).toBe(false);
    expect(t.act(NANI, { type: 'dab', n: off }).ok).toBe(false);
    t.ok(HOST, { type: 'end' });
    expect(t.act(MEERA, { type: 'dab', n: t.nums(MEERA)[0] }).ok).toBe(false);
    expect(t.tickets.m.dabs).toEqual([]);
  });
});

describe('claims', () => {
  const live = (prizes: Prize[] = CLASSIC) => {
    const t = new Table({ prizes, maxSeats: 6 });
    t.ok(MEERA, { type: 'join' });
    t.ok(NANI, { type: 'join' });
    t.ok(HOST, { type: 'start' });
    return t;
  };

  it('locks a valid claim to the player and broadcasts the win', () => {
    const t = live();
    const top = t.row(MEERA, 0);
    t.drawUntil(top);
    t.dabAll(MEERA, top);
    const r = t.ok(MEERA, { type: 'claim', prizeId: 'top' });
    expect(r.docChanged).toBe(true);
    expect(t.doc.claims.top).toEqual({ uid: 'm', name: 'Meera Iyer', at: t.ctx.now });
    expect(t.lastFeed()).toMatchObject({ kind: 'win', uid: 'm', name: 'Meera Iyer', label: 'Top Line', amount: 75, text: 'Top Line for Meera Iyer' });
    expect(t.doc.status).toBe('live');
  });

  it('calls a bogey on a claim that does not check out', () => {
    const t = live();
    const mid = t.row(NANI, 1);
    t.drawUntil(mid);
    t.dabAll(NANI, mid.slice(0, 4)); // one short
    const seq = t.doc.seq, v = t.doc.version;
    const r = t.act(NANI, { type: 'claim', prizeId: 'middle' });
    expect(r.ok).toBe(true);
    expect(r.docChanged).toBe(true);
    expect(t.doc.claims.middle).toBeUndefined();
    expect(t.doc.seq).toBe(seq + 1);
    expect(t.doc.version).toBe(v + 1);
    expect(t.lastFeed()).toMatchObject({ kind: 'bogey', uid: 'n', text: 'Bogey! Nani’s Middle Line didn’t check out' });
  });

  it('does not accept dabs the server never saw being called', () => {
    const t = live();
    const top = t.row(MEERA, 0);
    // Forge both sides a client could lie about: all five dabbed, but only four were really called.
    const doc: GameDoc = { ...t.doc, called: top.slice(0, 4) };
    const forged: Tickets = { ...t.tickets, m: { ...t.tickets.m, dabs: top } };
    const r = applyAction(doc, forged, { type: 'claim', prizeId: 'top' }, MEERA, t.ctx);
    expect(r.ok).toBe(true);
    expect(r.doc.claims.top).toBeUndefined();
    expect(r.doc.feed[r.doc.feed.length - 1].kind).toBe('bogey');
    // ...and it is a win once the fifth number is out
    const fair = applyAction({ ...doc, called: top }, forged, { type: 'claim', prizeId: 'top' }, MEERA, t.ctx);
    expect(fair.doc.claims.top.uid).toBe('m');
  });

  it('tells the second claimant the prize already went to someone', () => {
    const t = live();
    const top = t.row(MEERA, 0);
    t.drawAll();
    t.dabAll(MEERA, top);
    t.dabAll(NANI, t.row(NANI, 0));
    t.ok(MEERA, { type: 'claim', prizeId: 'top' });
    const v = t.doc.version;
    const r = t.act(NANI, { type: 'claim', prizeId: 'top' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('Top Line already went to Meera Iyer');
    expect(r.docChanged).toBe(false);
    expect(t.doc.version).toBe(v);
    expect(t.doc.claims.top.uid).toBe('m');
  });

  it('claims Full House and Second House in order, and not twice by the same player', () => {
    const t = live(HOUSES);
    t.drawAll();
    t.dabAll(MEERA, t.nums(MEERA));
    t.dabAll(NANI, t.nums(NANI));

    const early = t.act(MEERA, { type: 'claim', prizeId: 'full2' });
    expect(early.ok).toBe(false);
    expect(early.error).toBe('Claim Full House first');

    t.ok(MEERA, { type: 'claim', prizeId: 'full' });
    expect(t.doc.claims.full.uid).toBe('m');
    expect(t.doc.status).toBe('live');

    const again = t.act(MEERA, { type: 'claim', prizeId: 'full2' });
    expect(again.ok).toBe(false);
    expect(again.error).toBe('You already won with that pattern');
    expect(t.doc.claims.full2).toBeUndefined();

    t.ok(NANI, { type: 'claim', prizeId: 'full2' });
    expect(t.doc.claims.full2.uid).toBe('n');
    expect(t.doc.status).toBe('ended');
    expect(t.doc.auto).toBe(0);
    expect(t.doc.endedAt).toBe(t.ctx.now);
    expect(t.doc.feed.slice(-2).map((f) => f.kind)).toEqual(['win', 'end']);
    expect(t.lastFeed().text).toBe('All prizes claimed');
  });

  it('refuses claims from non-players, for unknown prizes and when the game is not live', () => {
    const t = live();
    expect(t.act(RAHUL, { type: 'claim', prizeId: 'top' }).ok).toBe(false);
    expect(t.act(MEERA, { type: 'claim', prizeId: 'nope' }).ok).toBe(false);
    t.ok(HOST, { type: 'end' });
    expect(t.act(MEERA, { type: 'claim', prizeId: 'top' }).ok).toBe(false);
    expect(t.doc.feed.some((f) => f.kind === 'bogey')).toBe(false);
  });
});

describe('a full game', () => {
  it('plays from lobby to results', () => {
    const t = new Table({ maxSeats: 4 });
    expect(t.doc.status).toBe('lobby');
    t.ok(MEERA, { type: 'join' });
    t.ok(NANI, { type: 'join' });
    t.ok(HOST, { type: 'start' });
    t.ok(HOST, { type: 'setAuto', auto: 5 });
    t.ok(MEERA, { type: 'react', text: 'Waah!' });
    expect(t.lastFeed()).toMatchObject({ kind: 'react', who: 'Meera', text: 'Waah!' });

    // Early Five to Nani
    const five = t.nums(NANI).slice(0, 5);
    t.drawUntil(five);
    t.dabAll(NANI, five);
    t.ok(NANI, { type: 'claim', prizeId: 'early5' });

    // Top Line to Meera, Middle Line to the host
    t.drawUntil(t.row(MEERA, 0));
    t.dabAll(MEERA, t.row(MEERA, 0));
    t.ok(MEERA, { type: 'claim', prizeId: 'top' });
    t.drawUntil(t.row(HOST, 1));
    t.dabAll(HOST, t.row(HOST, 1));
    t.ok(HOST, { type: 'claim', prizeId: 'middle' });
    expect(t.doc.status).toBe('live');

    // Full House to Meera ends the round
    t.drawUntil(t.nums(MEERA));
    t.dabAll(MEERA, t.nums(MEERA));
    t.ok(MEERA, { type: 'claim', prizeId: 'full' });

    expect(t.doc.status).toBe('ended');
    expect(t.doc.auto).toBe(0);
    expect(Object.fromEntries(Object.entries(t.doc.claims).map(([k, c]) => [k, c.uid])))
      .toEqual({ early5: 'n', top: 'm', middle: 'h', full: 'm' });
    expect(t.act(HOST, { type: 'draw' }).ok).toBe(false);
    expect(roundsOf(t.doc)).toHaveLength(1);
    // seq is strictly increasing through the feed
    const seqs = t.doc.feed.map((f) => f.seq);
    expect(seqs).toEqual(seqs.slice().sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);
  });

  it('keeps only the last 40 feed items', () => {
    const t = new Table();
    for (let i = 0; i < 55; i++) t.ok(HOST, { type: 'react', text: 'Jaldi!' });
    expect(t.doc.feed).toHaveLength(40);
    expect(t.doc.seq).toBe(55);
    expect(t.doc.feed[0].seq).toBe(16);
    expect(t.lastFeed().seq).toBe(55);
  });

  it('only sends known reactions from people at the table', () => {
    const t = new Table();
    expect(t.act(HOST, { type: 'react', text: '<script>' }).ok).toBe(false);
    expect(t.act(RAHUL, { type: 'react', text: 'Waah!' }).ok).toBe(false);
    expect(t.doc.feed).toEqual([]);
  });
});

describe('restart / end / next round', () => {
  const played = () => {
    const t = new Table();
    t.ok(MEERA, { type: 'join' });
    t.ok(HOST, { type: 'start' });
    const top = t.row(MEERA, 0);
    t.drawUntil(top);
    t.dabAll(MEERA, top);
    t.ok(MEERA, { type: 'claim', prizeId: 'top' });
    t.ok(HOST, { type: 'setAuto', auto: 5 });
    return t;
  };

  it('restart with the same tickets clears the board and the dabs', () => {
    const t = played();
    const before = JSON.stringify([t.tickets.h.ticket, t.tickets.m.ticket]);
    const r = t.ok(HOST, { type: 'restart', fresh: false });
    expect(t.doc).toMatchObject({ called: [], claims: {}, auto: 0, status: 'live' });
    expect(JSON.stringify([t.tickets.h.ticket, t.tickets.m.ticket])).toBe(before);
    expect(t.tickets.m.dabs).toEqual([]);
    expect(r.touched.sort()).toEqual(['h', 'm']);
    expect(t.lastFeed()).toMatchObject({ kind: 'reset', text: 'Board reset' });
  });

  it('restart with fresh tickets deals everyone a new one', () => {
    const t = played();
    const before = JSON.stringify([t.tickets.h.ticket, t.tickets.m.ticket]);
    t.ok(HOST, { type: 'restart', fresh: true });
    expect(t.doc).toMatchObject({ called: [], claims: {}, auto: 0, status: 'live' });
    expect(JSON.stringify([t.tickets.h.ticket, t.tickets.m.ticket])).not.toBe(before);
    expect(validateTicket(t.tickets.h.ticket)).toBeNull();
    expect(validateTicket(t.tickets.m.ticket)).toBeNull();
    expect(t.tickets.m.dabs).toEqual([]);
    expect(t.lastFeed()).toMatchObject({ kind: 'reset', text: 'Board reset — fresh tickets' });
  });

  it('restart revives an ended round', () => {
    const t = played();
    t.ok(HOST, { type: 'end' });
    t.ok(HOST, { type: 'restart', fresh: false });
    expect(t.doc.status).toBe('live');
    expect(t.doc.endedAt).toBeNull();
  });

  it('end stops the round', () => {
    const t = played();
    t.ok(HOST, { type: 'end' });
    expect(t.doc).toMatchObject({ status: 'ended', auto: 0, endedAt: t.ctx.now });
    expect(t.lastFeed()).toMatchObject({ kind: 'end', text: 'Round over' });
    expect(t.doc.claims.top.uid).toBe('m'); // results stay
  });

  it('next round is only for a finished round', () => {
    const t = played();
    expect(t.act(HOST, { type: 'nextRound' }).ok).toBe(false);
    expect(t.doc.round).toBe(1);
  });

  it('next round files the old one in history and deals fresh tickets', () => {
    const t = played();
    const calledCount = t.doc.called.length;
    t.ok(HOST, { type: 'end' });
    const endedAt = t.doc.endedAt;
    const before = JSON.stringify([t.tickets.h.ticket, t.tickets.m.ticket]);
    const r = t.ok(HOST, { type: 'nextRound' });

    expect(t.doc).toMatchObject({ round: 2, called: [], claims: {}, auto: 0, status: 'lobby', endedAt: null });
    expect(t.doc.history).toHaveLength(1);
    expect(t.doc.history[0]).toMatchObject({ round: 1, price: 100, uids: ['h', 'm'], calledCount, endedAt });
    expect(t.doc.history[0].claims.top.uid).toBe('m');
    expect(t.doc.history[0].prizes).toEqual(CLASSIC);
    expect(t.doc.feed).toHaveLength(1);
    expect(t.doc.feed[0]).toMatchObject({ kind: 'info', text: 'Round 2 — fresh tickets dealt' });
    expect(JSON.stringify([t.tickets.h.ticket, t.tickets.m.ticket])).not.toBe(before);
    expect(t.tickets.m.dabs).toEqual([]);
    expect(r.touched.sort()).toEqual(['h', 'm']);

    // rounds: history only while round 2 is open, history + current once it ends
    expect(roundsOf(t.doc).map((x) => x.round)).toEqual([1]);
    t.ok(HOST, { type: 'start' });
    t.ok(HOST, { type: 'draw' });
    t.ok(HOST, { type: 'end' });
    expect(roundsOf(t.doc).map((x) => x.round)).toEqual([1, 2]);
    expect(roundsOf(t.doc)[1]).toMatchObject({ calledCount: 1, claims: {}, endedAt: t.doc.endedAt });
  });
});

describe('invites and contacts', () => {
  const c = (id: string, name: string) => ({ id, name, phone: '9198100' + id, sent: false });

  it('invites users once and never people already playing', () => {
    const t = new Table();
    t.ok(MEERA, { type: 'join' });
    const u = (a: { uid: string; name: string }) => ({ uid: a.uid, name: a.name, username: null, color: '#78AEFF' });
    t.ok(HOST, { type: 'invite', users: [u(NANI), u(NANI), u(MEERA), u(HOST), u(RAHUL)] });
    expect(t.doc.invited.map((x) => x.uid)).toEqual(['n', 'r']);
    const r = t.ok(HOST, { type: 'invite', users: [u(NANI)] });
    expect(r.docChanged).toBe(false);
  });

  it('adds contacts (deduped) and grows the table to fit them, up to 30', () => {
    const t = new Table({ maxSeats: 2, prizes: [] });
    t.ok(HOST, { type: 'addContacts', contacts: [c('1', 'Lata Aunty'), c('2', 'Geeta Bua'), c('3', 'Usha Pillai')] });
    expect(t.doc.contacts.map((x) => x.id)).toEqual(['1', '2', '3']);
    expect(t.doc.maxSeats).toBe(4); // host + 3 contacts
    t.ok(HOST, { type: 'addContacts', contacts: [c('3', 'Usha Pillai'), c('4', 'Padma Rao')] });
    expect(t.doc.contacts.map((x) => x.id)).toEqual(['1', '2', '3', '4']);
    expect(t.doc.maxSeats).toBe(5);
    t.ok(HOST, { type: 'addContacts', contacts: Array.from({ length: 40 }, (_, i) => c('x' + i, 'Guest ' + i)) });
    expect(t.doc.maxSeats).toBe(30);
  });

  it('marks a contact as sent', () => {
    const t = new Table();
    t.ok(HOST, { type: 'addContacts', contacts: [c('1', 'Lata Aunty')] });
    t.ok(HOST, { type: 'markContactSent', contactId: '1' });
    expect(t.doc.contacts[0].sent).toBe(true);
    expect(t.act(HOST, { type: 'markContactSent', contactId: 'zz' }).ok).toBe(false);
  });
});

describe('project', () => {
  const table = () => {
    const t = new Table();
    t.ok(MEERA, { type: 'join' });
    t.ok(NANI, { type: 'join' });
    t.ok(HOST, { type: 'addContacts', contacts: [{ id: 'c1', name: 'Lata Aunty', phone: '919810011007', sent: false }] });
    t.ok(HOST, { type: 'start' });
    t.drawAll();
    // Different dab sets per player so a leak would be visible.
    t.dabAll(HOST, t.nums(HOST).slice(0, 6));
    t.dabAll(MEERA, t.nums(MEERA).slice(0, 9));
    t.dabAll(NANI, t.nums(NANI));
    return t;
  };
  const strip = (v: GameDoc & { me?: unknown }) => { const { me: _me, ...rest } = v; return rest; };

  it('gives each viewer only their own ticket', () => {
    const t = table();
    for (const who of [HOST, MEERA, NANI]) {
      const view = project(t.doc, t.tickets, who.uid);
      expect(view.me).toEqual(t.tickets[who.uid]);
      const json = JSON.stringify(view);
      for (const other of [HOST, MEERA, NANI]) {
        if (other.uid === who.uid) continue;
        expect(json).not.toContain(JSON.stringify(t.tickets[other.uid].ticket));
        expect(json).not.toContain(JSON.stringify(t.tickets[other.uid].dabs));
        for (const row of t.tickets[other.uid].ticket) expect(json).not.toContain(JSON.stringify(row));
      }
      // nothing ticket-shaped anywhere except `me`
      const rest = JSON.stringify(strip(view));
      expect(rest).not.toContain('"ticket"');
      expect(rest).not.toContain('"dabs"');
      expect(Object.keys(view).filter((k) => k === 'me' || k === 'tickets')).toEqual(['me']);
    }
  });

  it('gives spectators and strangers no ticket at all', () => {
    const t = table();
    for (const uid of [null, 'stranger', 'toString', '__proto__']) {
      const view = project(t.doc, t.tickets, uid);
      expect(view.me).toBeNull();
      const json = JSON.stringify(view);
      expect(json).not.toContain('"ticket"');
      expect(json).not.toContain('"dabs"');
    }
  });

  it('hides the host’s contacts from everyone else', () => {
    const t = table();
    expect(project(t.doc, t.tickets, 'h').contacts).toHaveLength(1);
    for (const uid of ['m', 'n', null, 'stranger']) {
      const view = project(t.doc, t.tickets, uid);
      expect(view.contacts).toEqual([]);
      expect(JSON.stringify(view)).not.toContain('919810011007');
      expect(JSON.stringify(view)).not.toContain('Lata');
    }
  });

  it('returns a copy, not live references', () => {
    const t = table();
    const view = project(t.doc, t.tickets, 'm');
    view.me!.dabs.push(999);
    view.called.push(999);
    expect(t.tickets.m.dabs).not.toContain(999);
    expect(t.doc.called).not.toContain(999);
    expect(strip(view)).toMatchObject({ id: t.doc.id, version: t.doc.version, players: t.doc.players });
  });
});
