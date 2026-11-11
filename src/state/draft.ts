import { DEFAULT_PRIZES, RULES } from '@core/data.ts';
import { autoSplit } from '@core/autosplit.ts';
import type { InvitedUser, PrizeCfg, RuleId } from '@core/types.ts';
import type { DeviceContact } from '@/backend/types';
import { createStore } from '@/lib/store';

/** The game being set up on /new and /prizes. Lives in memory only. */
export interface Draft {
  name: string; seats: number; price: number; hostPlays: boolean;
  invited: InvitedUser[];          // app users to invite
  contacts: DeviceContact[];       // phone contacts to message on WhatsApp after creating
  prizeCfg: PrizeCfg[];
  /** false = amounts follow auto-split; true = the host typed their own amounts. */
  prizesTouched: boolean;
}

export const MIN_SEATS = 2;
export const MAX_SEATS = 30;
const clampSeats = (n: number) => Math.min(MAX_SEATS, Math.max(MIN_SEATS, Math.floor(n) || MIN_SEATS));

const defaults = (): Draft => ({
  name: 'Diwali Night', seats: 6, price: 100, hostPlays: true, invited: [], contacts: [],
  prizeCfg: DEFAULT_PRIZES.map((p) => ({ ...p, on: true, custom: false })), prizesTouched: false,
});

export const draft = createStore<Draft>(defaults());

/** Seats needed for everyone picked so far (+ the host when they play). */
const needed = (s: Draft) => s.invited.length + s.contacts.length + (s.hostPlays ? 1 : 0);

/**
 * Reset the draft and optionally pre-fill it (Home "play again with a group", Friends "start a game").
 * Call before navigating to /new. With invitees, seats = max(2, invitees + host) like the prototype's `playGroup`.
 */
export function startDraft(opts?: { name?: string; invited?: InvitedUser[] }): void {
  const d = defaults();
  if (opts?.name) d.name = opts.name;
  if (opts?.invited?.length) {
    d.invited = uniq(opts.invited);
    d.seats = clampSeats(Math.max(MIN_SEATS, d.invited.length + (d.hostPlays ? 1 : 0)));
  }
  draft.set(d);
}

const uniq = (users: InvitedUser[]) => users.filter((u, i) => users.findIndex((x) => x.uid === u.uid) === i);

/** Name / seats / price / "deal me a ticket". Seats stay within 2–30, price never negative. */
export function setDraft(patch: Partial<Pick<Draft, 'name' | 'seats' | 'price' | 'hostPlays'>>): void {
  const p = { ...patch };
  if (p.seats != null) p.seats = clampSeats(p.seats);
  if (p.price != null) p.price = Math.max(0, Math.floor(Number(p.price) || 0));
  draft.set(p);
}

/** Add invitees; seats grow to fit (prototype `addInv`). */
export function addInvited(users: InvitedUser[]): void {
  draft.set((s) => {
    const invited = uniq([...s.invited, ...users]);
    return { invited, seats: clampSeats(Math.max(s.seats, needed({ ...s, invited }))) };
  });
}
export function removeInvited(uid: string): void {
  draft.set((s) => ({ invited: s.invited.filter((u) => u.uid !== uid) }));
}
/** Replace the invitee list (People picker). Seats only ever grow. */
export function setInvited(users: InvitedUser[]): void {
  draft.set((s) => {
    const invited = uniq(users);
    return { invited, seats: clampSeats(Math.max(s.seats, needed({ ...s, invited }))) };
  });
}
/** Replace the picked phone contacts; seats grow to fit contacts + invitees + host (prototype `contactsDone`). */
export function setContacts(list: DeviceContact[]): void {
  draft.set((s) => {
    const next = { ...s, contacts: list };
    return { contacts: list, seats: clampSeats(Math.max(s.seats, needed(next))) };
  });
}

// ---------------------------------------------------------------- prizes

export const draftPot = (s: Draft) => Math.max(0, Number(s.price) || 0) * s.seats;

/** What the host sees and what gets created: auto-split amounts until they type their own (prototype `eff`). */
export function effectivePrizes(s: Draft): PrizeCfg[] {
  return s.prizesTouched ? s.prizeCfg : autoSplit(s.prizeCfg, draftPot(s));
}

/**
 * Prototype `editCfg`: the first edit that "touches" amounts freezes the current auto-split amounts,
 * so the other prizes keep the numbers the host was looking at.
 */
function editCfg(fn: (cfg: PrizeCfg[]) => PrizeCfg[], touch: boolean): void {
  draft.set((s) => {
    const base = touch && !s.prizesTouched ? autoSplit(s.prizeCfg, draftPot(s)) : s.prizeCfg;
    return { prizeCfg: fn(base), prizesTouched: s.prizesTouched || touch };
  });
}

/** Type an amount (manual → switches auto-split off). */
export function setPrizeAmt(id: string, amt: number): void {
  const v = Math.max(0, Math.floor(Number(amt) || 0));
  editCfg((cfg) => cfg.map((p) => (p.id === id ? { ...p, amt: v } : p)), true);
}
/** −/+ buttons (₹10 steps). */
export function stepPrizeAmt(id: string, delta: number): void {
  editCfg((cfg) => cfg.map((p) => (p.id === id ? { ...p, amt: Math.max(0, (Number(p.amt) || 0) + delta) } : p)), true);
}
/** On/off switch. Does not count as a manual edit. */
export function togglePrize(id: string): void {
  editCfg((cfg) => cfg.map((p) => (p.id === id ? { ...p, on: !p.on } : p)), false);
}
/** × on a prize the host added. */
export function removePrize(id: string): void {
  editCfg((cfg) => cfg.filter((p) => p.id !== id || !p.custom), false);
}
/** Preset chip: switches the built-in prizes on/off, keeps added ones, back to auto-split. */
export function applyPreset(rules: RuleId[]): void {
  draft.set((s) => ({ prizeCfg: s.prizeCfg.map((p) => (p.custom ? p : { ...p, on: rules.includes(p.id as RuleId) })), prizesTouched: false }));
}
/** The Auto-split pill. */
export function resetAutoSplit(): void { draft.set({ prizesTouched: false }); }

const HOUSES = ['Second House', 'Third House', 'Fourth House'];
/** How many ON prizes use this pattern, and what the library button would add next. */
export function libraryState(cfg: PrizeCfg[], rule: RuleId): { have: number; multi: boolean; nextName: string } {
  const have = cfg.filter((p) => p.rule === rule && p.on).length;
  const multi = rule === 'full';
  const base = RULES.find((r) => r.id === rule)?.name ?? rule;
  return { have, multi, nextName: multi && have ? HOUSES[Math.min(have - 1, 2)] : base };
}
/**
 * Add a pattern from the "More ways to win" library. Returns the prize name, or null when it is already in.
 * Only Full House can repeat (Second / Third House). A built-in prize that was switched off is switched back on.
 */
export function addPrize(rule: RuleId): string | null {
  const s = draft.get();
  const { have, multi, nextName } = libraryState(s.prizeCfg, rule);
  if (have && !multi) return null;
  const off = s.prizeCfg.find((p) => p.rule === rule && !p.on && !p.custom);
  if (off && !have) { togglePrize(off.id); return off.label; }
  const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  editCfg((cfg) => [...cfg, { id, label: nextName, rule, amt: 0, on: true, custom: true }], false);
  return nextName;
}

/** Which preset (if any) matches the built-in prizes that are on. */
export function activePresetKey(cfg: PrizeCfg[]): string {
  return cfg.filter((p) => p.on && !p.custom).map((p) => p.id).sort().join();
}

/** "Early Five, Top Line, Middle Line +3 more · auto-split" for the New game screen. */
export function prizeSummary(s: Draft): string {
  const on = effectivePrizes(s).filter((p) => p.on);
  if (!on.length) return 'None — just for fun';
  const names = on.slice(0, 3).map((p) => p.label).join(', ') + (on.length > 3 ? ` +${on.length - 3} more` : '');
  return names + (s.price > 0 ? (s.prizesTouched ? ' · your amounts' : ' · auto-split') : '');
}
