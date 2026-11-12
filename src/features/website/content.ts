// Copy and sample data for the marketing page. Text follows the design prototype, corrected where the
// v2 README differs (no prize amounts, gentle wrong-claim message, auto-call 4/6/8/10 seconds).

export const TONES = { marigold: 'var(--marigold)', pink: 'var(--pink)', teal: 'var(--teal)' } as const;

/** Sample ticket in the hero (0 = blank) and the numbers already dabbed on it. */
export const SAMPLE_TICKET: number[][] = [
  [4, 0, 23, 0, 45, 0, 61, 0, 82],
  [0, 12, 0, 37, 0, 55, 0, 74, 88],
  [8, 0, 29, 0, 47, 0, 66, 79, 0],
];
export const SAMPLE_DABS: number[] = [4, 23, 12, 55, 74, 8, 29, 66, 79];

export const FACTS = [
  { big: '1', title: 'Shared live board', body: 'Every number lights up on everyone’s phone the instant it’s called.', color: TONES.marigold },
  { big: '0', title: 'Sign-ups needed', body: 'Tap the link, type your name, play. Right in the browser.', color: TONES.marigold },
  { big: '90', title: 'Unique rhymes', body: 'A playful voice calls every number with its own callout.', color: TONES.pink },
  { big: '26', title: 'Ways to win', body: 'Laddoo, Pyramid, Breakfast-Lunch-Dinner and more — rules explained.', color: TONES.teal },
  { big: '1 tap', title: 'Claims checked', body: 'Verified instantly against called numbers. No bogey fights.', color: TONES.marigold },
] as const;

export const MARQUEE = [
  '7 · Lucky seven',
  '11 · Legs eleven',
  '22 · Two little ducks',
  '42 · Quit India movement',
  '47 · Year of Independence',
  '66 · Clickety click',
  '80 · Gandhi’s breakfast',
  '88 · Two fat ladies',
  '90 · Top of the house',
  '1 · Kelly’s eye',
  '50 · Half a century',
  '16 · Sweet sixteen',
] as const;

export const STEPS = [
  { n: '1', color: TONES.pink, title: 'Host a game', body: 'Type your name, name the game and pick ways to win. You get a link and a 5-letter code.' },
  { n: '2', color: TONES.marigold, title: 'Share on WhatsApp', body: 'Drop the link in the family group. Friends open it, type their name and get a ticket.' },
  { n: '3', color: TONES.teal, title: 'Play together', body: 'Call numbers or switch on auto-call. Everyone dabs their own ticket and claims prizes instantly.' },
] as const;

/** Numbers lit on the sample board; 88 is the latest. */
export const BOARD_CALLED: number[] = [88, 7, 23, 41, 66, 12, 90, 3, 55, 47, 18, 72, 29, 61, 84, 9, 36, 50, 77, 14, 2, 68, 33, 45, 81, 26, 59, 70, 11, 38, 64];
export const BOARD_LATEST = 88;

export const COMPARE: ReadonlyArray<readonly [label: string, paper: string, us: string]> = [
  ['Printing & cutting tickets', 'Every game', 'Never'],
  ['Seeing what’s been called', 'Ask the host', 'Live board for all'],
  ['Shouting numbers', 'Host’s voice', 'Rhyming caller'],
  ['Checking claims', 'By hand', 'Instant'],
  ['Remote family can play', 'Hard', 'One link'],
  ['Custom kitty rules', 'Explain each time', '26 built in'],
  ['Joining', 'Add to group, explain', 'Tap link, type name'],
  ['Next round', 'Start over', 'One tap'],
];

export const FAQS: ReadonlyArray<readonly [q: string, a: string]> = [
  ['Do we need to sign up?', 'No. The host types a name and gets a link. Players open the link, type their name and get a ticket. Nobody creates an account.'],
  ['Do players need to download anything?', 'No. Everything works in the phone’s browser. The Android and iOS apps are coming soon for extras like number alerts.'],
  ['Is it really free?', 'Yes — hosting and playing are free.'],
  ['Can we play for money?', 'The app never handles money. You can note a ticket price to keep track, and settle with each other in cash or UPI, just like a paper game.'],
  ['How many people can play?', 'Two people or the whole family group — everyone gets their own ticket. Host from one phone, call numbers yourself or let auto-call do it.'],
  ['What if someone claims wrongly?', 'Every claim is checked against the numbers actually called. A wrong claim just gets a gentle “Not yet — keep playing!” and the game carries on. No arguments.'],
];
