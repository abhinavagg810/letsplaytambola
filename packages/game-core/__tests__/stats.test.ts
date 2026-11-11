import {
  formatINR, gameNet, profileStats, roundResults, settleSummary, shareResultsText, unclaimedNote,
} from '../src/index.ts';
import type { Prize } from '../src/index.ts';
import { HOST, MEERA, NANI, Table } from '../test-utils.ts';

const PRIZES: Prize[] = [
  { id: 'top', label: 'Top Line', rule: 'top', amt: 50 },
  { id: 'middle', label: 'Middle Line', rule: 'middle', amt: 50 },
  { id: 'full', label: 'Full House', rule: 'full', amt: 150 },
];

/** Host wins Top Line (50), Meera wins Full House (150), Middle Line unclaimed, Nani wins nothing. Pot = 300. */
function finished(price = 100): Table {
  const t = new Table({ prizes: PRIZES, price, maxSeats: 3 });
  t.ok(MEERA, { type: 'join' });
  t.ok(NANI, { type: 'join' });
  t.ok(HOST, { type: 'start' });
  t.drawAll();
  t.dabAll(HOST, t.row(HOST, 0));
  t.ok(HOST, { type: 'claim', prizeId: 'top' });
  t.dabAll(MEERA, t.nums(MEERA));
  t.ok(MEERA, { type: 'claim', prizeId: 'full' });
  t.ok(HOST, { type: 'end' });
  return t;
}

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(75)).toBe('₹75');
    expect(formatINR(999)).toBe('₹999');
    expect(formatINR(1250)).toBe('₹1,250');
    expect(formatINR(12345)).toBe('₹12,345');
    expect(formatINR(123456)).toBe('₹1,23,456');
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatINR(123456789)).toBe('₹12,34,56,789');
    expect(formatINR(1249.6)).toBe('₹1,250');
    expect(formatINR(-1500)).toBe('−₹1,500');
    expect(formatINR(1250, '$')).toBe('$1,250');
  });

  it('agrees with Intl where Intl has en-IN', () => {
    const viaIntl = (1234567).toLocaleString('en-IN');
    if (viaIntl === '12,34,567') {
      for (const n of [0, 5, 100, 1000, 99999, 100000, 98765432]) expect(formatINR(n)).toBe('₹' + n.toLocaleString('en-IN'));
    }
  });
});

describe('roundResults', () => {
  it('does not count the host’s own ticket as a cost', () => {
    const { pot, results, ranked } = roundResults(finished().doc);
    expect(pot).toBe(300);
    const by = Object.fromEntries(results.map((r) => [r.player.uid, r]));
    expect(by.h).toMatchObject({ w: 50, net: 50 });   // host: +50, no ticket cost
    expect(by.m).toMatchObject({ w: 150, net: 50 });  // 150 − 100
    expect(by.n).toMatchObject({ w: 0, net: -100 });  // 0 − 100
    expect(by.m.won.map((z) => z.id)).toEqual(['full']);
    expect(ranked.map((r) => r.player.uid)).toEqual(['m', 'h']);
  });

  it('ranks by winnings, then by number of prizes', () => {
    const t = finished(0); // free game: every amount is 0, so prize count decides
    t.ok(HOST, { type: 'restart', fresh: false });
    t.drawAll();
    t.dabAll(NANI, t.nums(NANI));
    t.ok(NANI, { type: 'claim', prizeId: 'top' });
    t.ok(NANI, { type: 'claim', prizeId: 'middle' });
    t.dabAll(MEERA, t.nums(MEERA));
    t.ok(MEERA, { type: 'claim', prizeId: 'full' });
    const { ranked, results } = roundResults(t.doc);
    expect(ranked.map((r) => r.player.uid)).toEqual(['n', 'm']);
    expect(results.map((r) => r.net)).toEqual([0, 0, 0]);
  });
});

describe('settle-up copy', () => {
  it('summarises for the host', () => {
    const t = finished();
    // collected 300, pays Meera 150 (the host's own 50 is not a pay-out)
    expect(settleSummary(t.doc, 'h', formatINR)).toBe('You collected ₹300 · pay out ₹150 · ₹150 stays with you');
  });

  it('summarises for a winner, a non-winner and a spectator', () => {
    const t = finished();
    expect(settleSummary(t.doc, 'm', formatINR)).toBe('Priya owes you ₹150');
    expect(settleSummary(t.doc, 'n', formatINR)).toBe('Pot ₹300 · better luck next round');
    expect(settleSummary(t.doc, null, formatINR)).toBe('Pot ₹300 · better luck next round');
  });

  it('is just for fun in a free game', () => {
    const t = finished(0);
    expect(settleSummary(t.doc, 'h', formatINR)).toBe('Just for fun — bragging rights only.');
    expect(settleSummary(t.doc, 'm', formatINR)).toBe('Just for fun — bragging rights only.');
  });

  it('notes unclaimed prizes and unassigned pot', () => {
    const t = finished();
    // prizes total 250 of a 300 pot; Middle Line (50) unclaimed
    expect(unclaimedNote(t.doc, formatINR)).toBe('Middle Line unclaimed (₹50) · ₹50 of the pot unassigned — roll it into the next round?');
    expect(unclaimedNote(finished(0).doc, formatINR)).toBe('Middle Line unclaimed — roll it into the next round?');
  });

  it('says nothing when everything was claimed and assigned', () => {
    const t = new Table({ prizes: [{ id: 'top', label: 'Top Line', rule: 'top', amt: 200 }], price: 100, maxSeats: 2 });
    t.ok(MEERA, { type: 'join' });
    t.ok(HOST, { type: 'start' });
    t.drawAll();
    t.dabAll(MEERA, t.row(MEERA, 0));
    t.ok(MEERA, { type: 'claim', prizeId: 'top' });
    expect(t.doc.status).toBe('ended');
    expect(unclaimedNote(t.doc, formatINR)).toBe('');
  });

  it('builds the share text', () => {
    expect(shareResultsText(finished().doc, formatINR)).toBe(
      'Diwali Night — Round 1 results\nTop Line: Priya Sharma (₹50)\nMiddle Line: Unclaimed (₹50)\nFull House: Meera Iyer (₹150)',
    );
    expect(shareResultsText(finished(0).doc, formatINR)).toBe(
      'Diwali Night — Round 1 results\nTop Line: Priya Sharma\nMiddle Line: Unclaimed\nFull House: Meera Iyer',
    );
  });

  it('uses the formatter it is given', () => {
    expect(settleSummary(finished().doc, 'm', (n) => `$${n}`)).toBe('Priya owes you $150');
  });
});

describe('gameNet / profileStats', () => {
  it('counts nothing until a round has finished', () => {
    const t = new Table({ prizes: PRIZES });
    t.ok(MEERA, { type: 'join' });
    t.ok(HOST, { type: 'start' });
    expect(gameNet(t.doc, 'm')).toEqual({ net: 0, wonLabels: [], money: false });
  });

  it('adds up every finished round, with the host’s ticket free', () => {
    const t = finished();
    expect(gameNet(t.doc, 'h')).toEqual({ net: 50, wonLabels: ['Top Line'], money: true });
    expect(gameNet(t.doc, 'm')).toEqual({ net: 50, wonLabels: ['Full House'], money: true });
    expect(gameNet(t.doc, 'n')).toEqual({ net: -100, wonLabels: [], money: true });
    expect(gameNet(t.doc, 'stranger')).toEqual({ net: 0, wonLabels: [], money: true });

    // round 2: Nani takes the Top Line, nobody else wins
    t.ok(HOST, { type: 'nextRound' });
    t.ok(HOST, { type: 'start' });
    t.drawAll();
    t.dabAll(NANI, t.row(NANI, 0));
    t.ok(NANI, { type: 'claim', prizeId: 'top' });
    // still counted from history while round 2 is open...
    expect(gameNet(t.doc, 'm').net).toBe(50);
    t.ok(HOST, { type: 'end' });
    // ...and round 2 is added once it ends
    expect(gameNet(t.doc, 'h')).toEqual({ net: 50, wonLabels: ['Top Line'], money: true });
    expect(gameNet(t.doc, 'm')).toEqual({ net: -50, wonLabels: ['Full House'], money: true });
    expect(gameNet(t.doc, 'n')).toEqual({ net: -150, wonLabels: ['Top Line'], money: true });
  });

  it('rolls games up into profile stats', () => {
    const a = finished().doc;
    const free = finished(0).doc;
    const other = new Table({ prizes: [], hostPlays: false }).doc; // Meera is not in this one
    expect(profileStats([a, free, other], 'm')).toEqual({ games: 2, wins: 2, net: 50, money: true });
    expect(profileStats([a, free, other], 'h')).toEqual({ games: 3, wins: 2, net: 50, money: true });
    expect(profileStats([free], 'n')).toEqual({ games: 1, wins: 0, net: 0, money: false });
    expect(profileStats([], 'n')).toEqual({ games: 0, wins: 0, net: 0, money: false });
  });
});
