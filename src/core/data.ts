// Static game data, ported from the design handoff (prototype CALLS / RULES / PRESETS / AV).
import type { AutoSeconds, RuleId } from './types';

/** Callout for number n is CALLOUTS[n - 1]. */
export const CALLOUTS: string[] = [
  "Kelly's eye",
  "One little duck",
  "Cup of tea",
  "Knock at the door",
  "Man alive",
  "Pick up sticks",
  "Lucky seven, straight to heaven",
  "Close the garden gate",
  "Doctor's orders",
  "Big fat hen",
  "Legs eleven",
  "One dozen, call your cousin",
  "Unlucky for some",
  "Valentine's day",
  "Young and keen",
  "Sweet sixteen",
  "Dancing queen",
  "Voting age, take the stage",
  "Goodbye teens",
  "Plenty twenty",
  "Key of the door",
  "Two little ducks, quack quack",
  "You and me",
  "Two dozen",
  "Duck and dive",
  "Pick and mix",
  "Gateway to heaven",
  "In a state",
  "Rise and shine",
  "Flirty thirty",
  "Get up and run",
  "Buckle my shoe",
  "All the threes, buzzing bees",
  "Ask for more",
  "Jump and jive",
  "Three dozen",
  "A flea in heaven",
  "Christmas cake",
  "Thirty-nine steps",
  "Naughty forty",
  "Life's begun at forty-one",
  "Quit India movement",
  "Down on your knees",
  "All the fours, shut the doors",
  "Halfway there",
  "Up to tricks",
  "Year of Independence",
  "Four dozen",
  "Rain or shine, forty-nine",
  "Half a century",
  "Tweak of the thumb",
  "Deck of cards",
  "Stuck in a tree",
  "Clean the floor",
  "Snakes alive, all the fives",
  "Mixed up tricks",
  "Mutiny year",
  "Make them wait",
  "Fifty-nine, feeling fine",
  "Five dozen, senior citizen",
  "Baker's bun",
  "Tickety-boo",
  "Tickle me",
  "When I'm sixty-four",
  "Old age pension",
  "Clickety click",
  "Made in heaven",
  "Saving grace",
  "Either way up",
  "Three score and ten",
  "Bang on the drum",
  "Six dozen, lucky cousin",
  "Queen bee, under the tree",
  "Candy store",
  "Diamond jubilee",
  "Trombones",
  "All the sevens, double heaven",
  "Heaven's gate",
  "One more time",
  "Gandhi's breakfast, ate nothing",
  "Stop and run",
  "Straight on through",
  "Time for tea",
  "Seven dozen",
  "Staying alive",
  "Between the sticks",
  "Nearly heaven",
  "Two fat ladies",
  "Nearly there",
  "Top of the house",
];

export interface RuleDef {
  id: RuleId;
  /** Display name, e.g. "Top Line". */
  name: string;
  /** Group heading on the Ways to win screen. */
  group: string;
  /** One-line rule, e.g. "All 5 numbers of the top line". */
  rule: string;
}

/** The 26 ways to win, in display order. */
export const RULES: readonly RuleDef[] = [
  { id: "early5", name: "Early Five", group: "Quick", rule: "Any 5 numbers" },
  { id: "early7", name: "Early Seven", group: "Quick", rule: "Any 7 numbers" },
  { id: "early9", name: "Early Nine", group: "Quick", rule: "Any 9 numbers" },
  { id: "lucky3", name: "Lucky Three", group: "Quick", rule: "3 of the first 5 numbers called" },
  { id: "laddoo", name: "Laddoo", group: "Quick", rule: "Centre number of the middle line" },
  { id: "temp", name: "Temperature / BP", group: "Quick", rule: "Smallest and biggest number on the ticket" },
  { id: "top", name: "Top Line", group: "Lines", rule: "All 5 numbers of the top line" },
  { id: "middle", name: "Middle Line", group: "Lines", rule: "All 5 numbers of the middle line" },
  { id: "bottom", name: "Bottom Line", group: "Lines", rule: "All 5 numbers of the bottom line" },
  { id: "railway", name: "Railway Lines", group: "Lines", rule: "First and last column (1–9 and 80–90)" },
  { id: "bamboo", name: "Bamboo", group: "Lines", rule: "All numbers in the 40s" },
  { id: "corners", name: "Four Corners", group: "Corners", rule: "First & last of top and bottom lines" },
  { id: "star", name: "Star", group: "Corners", rule: "Four corners + centre" },
  { id: "six", name: "Six Corners", group: "Corners", rule: "First & last of every line" },
  { id: "kings", name: "King’s Corner", group: "Corners", rule: "First number of each line" },
  { id: "queens", name: "Queen’s Corner", group: "Corners", rule: "Last number of each line" },
  { id: "pyramid", name: "Pyramid", group: "Shapes", rule: "1 top, 2 middle, 3 bottom — a triangle" },
  { id: "rpyramid", name: "Reverse Pyramid", group: "Shapes", rule: "3 top, 2 middle, 1 bottom" },
  { id: "diamond", name: "Diamond", group: "Shapes", rule: "Centre top & bottom + ends of middle" },
  { id: "one24", name: "1-2 ka 4", group: "Shapes", rule: "1st of top, 2 of middle, 4 of bottom" },
  { id: "breakfast", name: "Breakfast", group: "Number ranges", rule: "Every number from 1–29" },
  { id: "lunch", name: "Lunch", group: "Number ranges", rule: "Every number from 30–59" },
  { id: "dinner", name: "Dinner", group: "Number ranges", rule: "Every number from 60–90" },
  { id: "day", name: "Devrani (Day)", group: "Number ranges", rule: "Every number from 1–45" },
  { id: "night", name: "Jethani (Night)", group: "Number ranges", rule: "Every number from 46–90" },
  { id: "full", name: "Full House", group: "Full ticket", rule: "All 15 numbers — add again for Second House" },
];

/** Group headings in display order: Quick, Lines, Corners, Shapes, Number ranges, Full ticket. */
export const RULE_GROUPS: readonly string[] = RULES.reduce<string[]>((a, r) => (a.includes(r.group) ? a : [...a, r.group]), []);

export interface Preset { name: string; rules: RuleId[] }

export const PRESETS: readonly Preset[] = [
  { name: 'Classic', rules: ['early5', 'top', 'middle', 'bottom', 'corners', 'full'] },
  { name: 'Lines + House', rules: ['top', 'middle', 'bottom', 'full'] },
  { name: 'Just Full House', rules: ['full'] },
];

/** The preset whose rules are exactly `rules` (any order), or null for "Your own mix". */
export function matchPreset(rules: readonly string[]): Preset | null {
  return PRESETS.find((p) => p.rules.length === rules.length && p.rules.every((r) => rules.includes(r))) ?? null;
}

/** "Classic · 6 ways" / "Your own mix · 1 way" — the summary on the Host setup screen. */
export function prizeSummary(rules: readonly string[]): string {
  const p = matchPreset(rules);
  return `${p ? p.name : 'Your own mix'} · ${rules.length}${rules.length === 1 ? ' way' : ' ways'}`;
}

/** Avatar colours in join order: pink, marigold, teal, then three more (README). */
export const AVATAR_COLORS: readonly string[] = [
  'oklch(0.68 0.22 358)',
  'oklch(0.83 0.16 78)',
  'oklch(0.8 0.13 180)',
  'oklch(0.75 0.14 260)',
  'oklch(0.8 0.15 140)',
  'oklch(0.75 0.15 30)',
];

/** Quick-pick chips under the Game name field. */
export const GAME_NAME_IDEAS: readonly string[] = ['Kitty Party', 'Diwali Night', 'Family Sunday', 'Teej Special'];

export const DEFAULT_GAME_NAME = 'Tambola Night';
export const MAX_NAME_LENGTH = 24;
export const MAX_GAME_NAME_LENGTH = 32;
export const MAX_PRICE = 99999;
/** Safety cap, not a product feature: keeps one game document a sensible size. */
export const MAX_PLAYERS = 100;

export const AUTO_SECONDS: readonly AutoSeconds[] = [4, 6, 8, 10];
export const DEFAULT_AUTO_SECONDS: AutoSeconds = 6;

/** Characters used in game codes (no 0/O/1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
/** Games are unusable this long after the last activity. */
export const GAME_TTL_MS = 24 * 60 * 60 * 1000;

const RULE_BY_ID = new Map<string, RuleDef>(RULES.map((r) => [r.id, r]));

export function ruleDef(id: string): RuleDef | null {
  return RULE_BY_ID.get(id) ?? null;
}

export function isRuleId(id: unknown): id is RuleId {
  return typeof id === 'string' && RULE_BY_ID.has(id);
}

/** Display name of a pattern ("Top Line"). Falls back to the id. */
export function ruleName(id: string): string {
  return ruleDef(id)?.name ?? id;
}

/** One-line description of a pattern. Falls back to the id. */
export function ruleDesc(id: string): string {
  return ruleDef(id)?.rule ?? id;
}

export function calloutFor(n: number): string {
  return CALLOUTS[n - 1] ?? '';
}

/** "Single number, 7" / "4 and 2, 42" */
export function spokenNumber(n: number): string {
  return n < 10 ? `Single number, ${n}` : `${Math.floor(n / 10)} and ${n % 10}, ${n}`;
}

/** Full text for the voice caller: "Two fat ladies! ... 8 and 8, 88". */
export function speechFor(n: number): string {
  return `${calloutFor(n)}! ... ${spokenNumber(n)}`;
}

/** Voice line and banner title for a win. */
export function winText(name: string, prize: string): string {
  return `${name} wins ${prize}!`;
}

/** Is `s` shaped like a game code? */
export function isGameCode(s: unknown): boolean {
  return typeof s === 'string' && s.length === CODE_LENGTH && [...s].every((ch) => CODE_ALPHABET.includes(ch));
}

/** A random game code. */
export function genCode(rng: () => number): string {
  let s = '';
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[Math.min(CODE_ALPHABET.length - 1, Math.floor(rng() * CODE_ALPHABET.length))];
  return s;
}

/** Supabase Realtime Broadcast channel for a game, and the event name of the "changed" ping. */
export const REALTIME_EVENT = 'changed';
export function realtimeChannel(code: string): string {
  return `g:${code}`;
}
