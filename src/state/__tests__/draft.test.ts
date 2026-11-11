/// <reference types="jest" />
import {
  MAX_SEATS, MIN_SEATS, addInvited, addPrize, applyPreset, draft, draftPot, effectivePrizes, libraryState, prizeSummary,
  removeInvited, removePrize, resetAutoSplit, setContacts, setDraft, setInvited, setPrizeAmt, startDraft, stepPrizeAmt, togglePrize,
} from '../draft';

const person = (n: number) => ({ uid: 'u' + n, name: 'Person ' + n, username: 'p' + n, color: '#fff' });
const contact = (n: number) => ({ id: 'c' + n, name: 'Contact ' + n, phone: '9198100110' + String(n).padStart(2, '0') });
const amt = (id: string) => effectivePrizes(draft.get()).find((p) => p.id === id)!.amt;
const sumOn = () => effectivePrizes(draft.get()).filter((p) => p.on).reduce((a, p) => a + p.amt, 0);

beforeEach(() => startDraft());

describe('seats, price and invitees', () => {
  test('defaults: 6 seats, ₹100, host plays, six prizes on auto-split', () => {
    const d = draft.get();
    expect([d.seats, d.price, d.hostPlays, d.prizesTouched]).toEqual([6, 100, true, false]);
    expect(d.prizeCfg.filter((p) => p.on)).toHaveLength(6);
  });

  test('seats stay within 2–30 and price is never negative or fractional', () => {
    setDraft({ seats: 0 }); expect(draft.get().seats).toBe(MIN_SEATS);
    setDraft({ seats: 99 }); expect(draft.get().seats).toBe(MAX_SEATS);
    setDraft({ price: -50 }); expect(draft.get().price).toBe(0);
    setDraft({ price: 49.9 }); expect(draft.get().price).toBe(49);
  });

  test('inviting people grows seats to fit invitees + host, and never shrinks them', () => {
    addInvited([1, 2, 3, 4, 5, 6, 7].map(person));
    expect(draft.get().seats).toBe(8);
    removeInvited('u1');
    expect(draft.get().invited).toHaveLength(6);
    expect(draft.get().seats).toBe(8);
    setInvited([person(1)]);
    expect(draft.get().seats).toBe(8);
  });

  test('duplicates are ignored and contacts count towards seats', () => {
    addInvited([person(1), person(1)]);
    addInvited([person(1)]);
    expect(draft.get().invited).toHaveLength(1);
    setContacts([1, 2, 3, 4, 5, 6].map(contact));
    expect(draft.get().seats).toBe(8);   // 1 invited + 6 contacts + host
  });

  test('a host who is not playing does not take a seat', () => {
    setDraft({ hostPlays: false });
    addInvited([1, 2, 3, 4, 5, 6, 7].map(person));
    expect(draft.get().seats).toBe(7);
  });

  test('startDraft pre-fills a group: name, people, seats = people + host (at least 2)', () => {
    startDraft({ name: 'Kitty party', invited: [person(1), person(2), person(3)] });
    expect(draft.get()).toMatchObject({ name: 'Kitty party', seats: 4 });
    startDraft({ invited: [] });
    expect(draft.get().seats).toBe(6);
  });
});

describe('prizes: auto-split until the host types an amount', () => {
  test('auto-split always uses the whole pot and follows seats and price', () => {
    expect(sumOn()).toBe(600);
    setDraft({ seats: 10, price: 50 });
    expect(draftPot(draft.get())).toBe(500);
    expect(sumOn()).toBe(500);
  });

  test('switching a prize off is not a manual edit: the rest re-split the pot', () => {
    togglePrize('early5');
    expect(draft.get().prizesTouched).toBe(false);
    expect(effectivePrizes(draft.get()).filter((p) => p.on)).toHaveLength(5);
    expect(sumOn()).toBe(600);
  });

  test('typing an amount freezes the other prizes at what was on screen', () => {
    const before = effectivePrizes(draft.get()).map((p) => [p.id, p.amt]);
    setPrizeAmt('full', 300);
    expect(draft.get().prizesTouched).toBe(true);
    expect(amt('full')).toBe(300);
    for (const [id, a] of before) if (id !== 'full') expect(amt(id as string)).toBe(a);
    // …and they no longer follow the pot.
    setDraft({ seats: 20 });
    expect(amt('full')).toBe(300);
  });

  test('− / + steps by the given amount and never go below zero', () => {
    const start = amt('top');
    stepPrizeAmt('top', 10);
    expect(amt('top')).toBe(start + 10);
    stepPrizeAmt('top', -100000);
    expect(amt('top')).toBe(0);
    setPrizeAmt('top', -5);
    expect(amt('top')).toBe(0);
  });

  test('the Auto-split pill and presets go back to auto-split', () => {
    setPrizeAmt('full', 10);
    resetAutoSplit();
    expect(draft.get().prizesTouched).toBe(false);
    expect(sumOn()).toBe(600);
    setPrizeAmt('full', 10);
    applyPreset(['full']);
    expect(draft.get().prizesTouched).toBe(false);
    expect(effectivePrizes(draft.get()).filter((p) => p.on).map((p) => p.id)).toEqual(['full']);
    expect(amt('full')).toBe(600);
  });

  test('a free game has no amounts', () => {
    setDraft({ price: 0 });
    expect(sumOn()).toBe(0);
    expect(prizeSummary(draft.get())).toBe('Early Five, Top Line, Middle Line +3 more');
  });

  test('summary says who set the amounts', () => {
    expect(prizeSummary(draft.get())).toBe('Early Five, Top Line, Middle Line +3 more · auto-split');
    setPrizeAmt('full', 100);
    expect(prizeSummary(draft.get())).toMatch(/· your amounts$/);
    applyPreset([]);
    expect(prizeSummary(draft.get())).toBe('None — just for fun');
  });
});

describe('“More ways to win” library', () => {
  test('Full House can repeat as Second / Third House; other patterns only once', () => {
    expect(addPrize('full')).toBe('Second House');
    expect(addPrize('full')).toBe('Third House');
    expect(libraryState(draft.get().prizeCfg, 'full')).toMatchObject({ have: 3, multi: true, nextName: 'Fourth House' });
    expect(addPrize('top')).toBeNull();
    const name = addPrize('star');
    expect(name).toBeTruthy();
    expect(addPrize('star')).toBeNull();
    expect(draft.get().prizesTouched).toBe(false);
    expect(sumOn()).toBe(600);
  });

  test('adding a built-in prize that was switched off switches it back on', () => {
    togglePrize('corners');
    expect(addPrize('corners')).toBe('Four Corners');
    expect(draft.get().prizeCfg.filter((p) => p.rule === 'corners')).toHaveLength(1);
    expect(draft.get().prizeCfg.find((p) => p.id === 'corners')!.on).toBe(true);
  });

  test('only prizes the host added can be removed', () => {
    addPrize('full');
    const added = draft.get().prizeCfg.find((p) => p.custom)!;
    removePrize('full');
    expect(draft.get().prizeCfg.some((p) => p.id === 'full')).toBe(true);
    removePrize(added.id);
    expect(draft.get().prizeCfg.some((p) => p.id === added.id)).toBe(false);
  });
});
