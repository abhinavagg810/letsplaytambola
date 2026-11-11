// Static game data, inlined as TS constants (no JSON imports: this file is also bundled for Deno).
import type { PrizeCfg, RuleId } from './types.ts';

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
  id: RuleId; name: string; group: string; rule: string;
  /** Cells (0-26, row-major on the 3x9 grid) highlighted in the mini preview. */
  mini: number[] | 'all';
  /** Auto-split weight (pattern difficulty). */
  weight: number;
}

export const RULES: RuleDef[] = [
  { id: "early5", name: "Early Five", group: "Quick", rule: "Any 5 numbers", mini: [1, 12, 14, 20, 25], weight: 1 },
  { id: "early7", name: "Early Seven", group: "Quick", rule: "Any 7 numbers", mini: [1, 5, 12, 14, 16, 20, 25], weight: 1 },
  { id: "early9", name: "Early Nine", group: "Quick", rule: "Any 9 numbers", mini: [1, 3, 5, 10, 12, 14, 19, 21, 25], weight: 1.2 },
  { id: "lucky3", name: "Lucky Three", group: "Quick", rule: "3 of the first 5 numbers called", mini: [3, 12, 22], weight: 1 },
  { id: "laddoo", name: "Laddoo", group: "Quick", rule: "Centre number of the middle line", mini: [13], weight: 0.8 },
  { id: "temp", name: "Temperature / BP", group: "Quick", rule: "Smallest and biggest number on the ticket", mini: [0, 26], weight: 1 },
  { id: "top", name: "Top Line", group: "Lines", rule: "All 5 numbers of the top line", mini: [0, 1, 2, 3, 4, 5, 6, 7, 8], weight: 1.5 },
  { id: "middle", name: "Middle Line", group: "Lines", rule: "All 5 numbers of the middle line", mini: [9, 10, 11, 12, 13, 14, 15, 16, 17], weight: 1.5 },
  { id: "bottom", name: "Bottom Line", group: "Lines", rule: "All 5 numbers of the bottom line", mini: [18, 19, 20, 21, 22, 23, 24, 25, 26], weight: 1.5 },
  { id: "railway", name: "Railway Lines", group: "Lines", rule: "First and last column (1–9 and 80–90)", mini: [0, 9, 18, 8, 17, 26], weight: 1.5 },
  { id: "bamboo", name: "Bamboo", group: "Lines", rule: "All numbers in the 40s", mini: [4, 13, 22], weight: 1.2 },
  { id: "corners", name: "Four Corners", group: "Corners", rule: "First & last of top and bottom lines", mini: [0, 8, 18, 26], weight: 1.5 },
  { id: "star", name: "Star", group: "Corners", rule: "Four corners + centre", mini: [0, 8, 13, 18, 26], weight: 1.5 },
  { id: "six", name: "Six Corners", group: "Corners", rule: "First & last of every line", mini: [0, 8, 9, 17, 18, 26], weight: 1.6 },
  { id: "kings", name: "King’s Corner", group: "Corners", rule: "First number of each line", mini: [0, 9, 18], weight: 1.2 },
  { id: "queens", name: "Queen’s Corner", group: "Corners", rule: "Last number of each line", mini: [8, 17, 26], weight: 1.2 },
  { id: "pyramid", name: "Pyramid", group: "Shapes", rule: "1 top, 2 middle, 3 bottom — a triangle", mini: [4, 12, 14, 20, 22, 24], weight: 1.8 },
  { id: "rpyramid", name: "Reverse Pyramid", group: "Shapes", rule: "3 top, 2 middle, 1 bottom", mini: [2, 4, 6, 12, 14, 22], weight: 1.8 },
  { id: "diamond", name: "Diamond", group: "Shapes", rule: "Centre top & bottom + ends of middle", mini: [4, 9, 17, 22], weight: 1.4 },
  { id: "one24", name: "1-2 ka 4", group: "Shapes", rule: "1st of top, 2 of middle, 4 of bottom", mini: [0, 9, 10, 18, 19, 20, 21], weight: 1.8 },
  { id: "breakfast", name: "Breakfast", group: "Number ranges", rule: "Every number from 1–29", mini: [0, 1, 2, 9, 10, 11, 18, 19, 20], weight: 2 },
  { id: "lunch", name: "Lunch", group: "Number ranges", rule: "Every number from 30–59", mini: [3, 4, 5, 12, 13, 14, 21, 22, 23], weight: 2 },
  { id: "dinner", name: "Dinner", group: "Number ranges", rule: "Every number from 60–90", mini: [6, 7, 8, 15, 16, 17, 24, 25, 26], weight: 2 },
  { id: "day", name: "Devrani (Day)", group: "Number ranges", rule: "Every number from 1–45", mini: [0, 1, 2, 3, 9, 10, 11, 12, 18, 19, 20, 21], weight: 2.2 },
  { id: "night", name: "Jethani (Night)", group: "Number ranges", rule: "Every number from 46–90", mini: [5, 6, 7, 8, 14, 15, 16, 17, 23, 24, 25, 26], weight: 2.2 },
  { id: "full", name: "Full House", group: "Full ticket", rule: "All 15 numbers — add again for Second House", mini: "all", weight: 3 },
];

export const DEFAULT_PRIZES: PrizeCfg[] = [
  { id: 'early5', label: 'Early Five', rule: 'early5', amt: 50, on: true, custom: false },
  { id: 'top', label: 'Top Line', rule: 'top', amt: 75, on: true, custom: false },
  { id: 'middle', label: 'Middle Line', rule: 'middle', amt: 75, on: true, custom: false },
  { id: 'bottom', label: 'Bottom Line', rule: 'bottom', amt: 75, on: true, custom: false },
  { id: 'corners', label: 'Four Corners', rule: 'corners', amt: 75, on: true, custom: false },
  { id: 'full', label: 'Full House', rule: 'full', amt: 250, on: true, custom: false },
];

export const PRESETS: { name: string; rules: RuleId[] }[] = [
  { name: 'Classic', rules: ['early5', 'top', 'middle', 'bottom', 'corners', 'full'] },
  { name: 'Lines + House', rules: ['top', 'middle', 'bottom', 'full'] },
  { name: 'Just Full House', rules: ['full'] },
  { name: 'No prizes', rules: [] },
];

export const REACTS: string[] = ['Waah!', 'Arre yaar', 'Jaldi!', 'So close', 'One more!'];

/** Shown in a game's history in place of the name of someone who deleted their account. */
export const DELETED_NAME = 'Deleted player';

export const AVATAR_COLORS: string[] = ['#FA4A98', '#FFB831', '#40D9C1', '#78AEFF', '#87D576', '#FE8674'];

const RULE_BY_ID: Record<string, RuleDef> = {};
for (const r of RULES) RULE_BY_ID[r.id] = r;

export function ruleDef(id: string): RuleDef | null {
  return RULE_BY_ID[id] ?? null;
}

export function isRuleId(id: unknown): id is RuleId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(RULE_BY_ID, id);
}

/** Display name of a pattern ("Top Line"). Falls back to the id. */
export function ruleName(id: string): string {
  const r = ruleDef(id);
  return r ? r.name : id;
}

/** One-line description of a pattern ("All 5 numbers of the top line"). Falls back to the name, then the id. */
export function ruleDesc(id: string): string {
  const r = ruleDef(id);
  return r ? r.rule || r.name : id;
}

/** Auto-split weight of a pattern (1 when unknown). */
export function ruleWeight(id: string): number {
  const r = ruleDef(id);
  return r ? r.weight : 1;
}

/** 27 booleans (row-major 3x9) for the mini ticket preview of a pattern. */
export function miniCells(id: string): boolean[] {
  const r = ruleDef(id);
  const mini = r ? r.mini : [];
  return Array.from({ length: 27 }, (_, i) => mini === 'all' || mini.includes(i));
}

export function calloutFor(n: number): string {
  return CALLOUTS[n - 1] ?? '';
}

/** "Single number, 7" / "4 and 2, 42" */
export function spokenNumber(n: number): string {
  return n < 10 ? `Single number, ${n}` : `${Math.floor(n / 10)} and ${n % 10}, ${n}`;
}

/** Full text for the voice caller. */
export function speechFor(n: number): string {
  return `${calloutFor(n)}! ... ${spokenNumber(n)}`;
}
