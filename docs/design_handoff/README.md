# Handoff: Letsplaytambola — responsive website + no-sign-up game (v2)

## Overview
Letsplaytambola is a free web game for playing Tambola (Housie) with family and friends in India. The audience is mainly women aged 30–70, so keep it simple, use big tap targets and write in plain words.

**v2 changes the product (it replaces v1 in `design_handoff_letsplaytambola/`):**
- **No authentication at all.** No phone OTP, no Google/Apple, no usernames, no contacts, no friends, groups or profiles.
- Anyone can open the website and **host a game** → gets a **link + 5-letter code** → shares it (WhatsApp).
- Players open the link, **type their name**, get a ticket and play.
- **One responsive website** (mobile browser first, desktop too). The native apps stay "Coming soon" on the marketing page.
- Money never goes through the app. An optional ticket price is shown for information only.

## About the design files
The files in `prototype/` are **design references built in HTML**. They show the intended look and behaviour. They are **not production code**. Recreate them in the target stack (recommended: Next.js + TypeScript + Supabase, see the prompt file). Each `.dc.html` opens in a browser on its own (keep `support.js` next to it). The prototype stores games in `localStorage` and syncs browser tabs with `BroadcastChannel`. **In production this becomes a real backend with realtime updates.**

## Fidelity
**High-fidelity.** Colours, type, spacing, copy and flows are final. Match them closely.

## Files
| File | What it is |
|---|---|
| `prototype/Letsplaytambola Website.dc.html` | Marketing home page (responsive) |
| `prototype/Letsplaytambola Play.dc.html` | **The whole game app**: join-by-code, host setup, ways to win, lobby, live game, results. Its `<script>` holds the exact logic: ticket generation, the 26 pattern checks, the voice caller, claims |
| `prototype/SiteHeader.dc.html`, `SiteFooter.dc.html` | Shared header (desktop nav / mobile menu) and footer |
| `prototype/Logo.dc.html` | Logo (marigold "90" ball + "Let's play TAMBOLA") |
| `prototype/Mobile Preview.dc.html` | 8 live pages in phone frames: host journey + player journey. Open this first |
| `prototype/Letsplaytambola Privacy.dc.html`, `Terms.dc.html` | Legal pages. **Still describe v1 (phone sign-in, contacts) — must be rewritten for v2** |
| `assets/` | Logo PNGs, app icon |
| `data/number-callouts.json` | 90 callouts (seed data) |
| `data/winning-patterns.json` | 26 winning patterns with one-line rules (seed data) |

To try a two-person game in the prototype, open `Letsplaytambola Play.dc.html#host`, create a game, then use **Open as a guest ↗** in the lobby. That opens a second tab as a player.

---

## Routes
| Route | Screen |
|---|---|
| `/` | Website (marketing) |
| `/host` | Host setup |
| `/host/prizes` | Ways to win picker (sub-step of setup; it can also be a sheet) |
| `/join` | Join with a code |
| `/g/:code` | The game. Shows Join, Lobby, Live or Results depending on game status and who you are |
| `/privacy`, `/terms` | Legal |

The prototype uses hashes (`#host`, `#host/prizes`, `#join`, `#g=CODE`). In production use real paths. Share links must be short: `letsplaytambola.com/g/K7RQ2`.

## Identity without accounts
- On first visit, create a random **device token** (UUID) and store it in `localStorage`. All game actions are signed with it. A Supabase anonymous session works well for this.
- **Host** = the token that created the game. Only the host can start, call numbers, toggle auto-call and start a new round.
- **Player** = a token that joined with a name. Refreshing or reopening the link on the same device takes you back to your ticket.
- Remember the last name typed (`localStorage`) and prefill it next time.
- Names: 1–24 characters, trimmed. Duplicate names are allowed, but show the second one as "Meera (2)".
- No cross-device recovery. That is accepted for v2.

## Game codes
5 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O/1/I/L). Must be unique among active games. Games expire 24 hours after the last activity.

---

## Screens

### Shared header (all pages)
- Sticky at the top. Background plum at 90% opacity with a 10px backdrop blur and a 1px bottom border in `#…line`.
- Content max-width 1160px. Padding 10px 20px.
- **Desktop (≥ 860px):** logo on the left. On the right: "How it works", "Features" (16px/600, text-soft), "Join a game" (outline pill, 44px tall) and "Host a game" (marigold pill, 44px, ink text, 800).
- **Mobile (< 860px):** logo, a "Host" marigold pill and a "Menu" outline pill. Menu opens a list under the header: "Join a game with a code", "How it works", "Features". Rows are 54px tall, 19px/700, with top dividers.
- There is **no "Questions" item** in the menu. The FAQ section stays on the page only.

### Website `/`
Sections in order:
1. **First section:** two columns that stack below about 900px.
   - Left column: pill "FREE · NO SIGN-UP · NO DOWNLOAD" · H1 "Housie night, sorted." (clamp 48–84px, 800, line-height .92) · paragraph · CTA **"Host a game free"** (60px, radius 18, marigold) → `/host` · "Got a game code?" input + Join (opens `/g/CODE`) · avatar row.
   - Right column: caller card + a sample ticket + "Meera won Top Line!" chip.
2. Five fact cards (auto-fit, min 230px): 1 live board · 0 sign-ups · 90 rhymes · 26 ways · 1-tap claims.
3. A marquee of callouts on a marigold strip.
4. **How it works:** 3 steps (Host a game / Share on WhatsApp / Play together).
5. **Features:** alternating text + mock rows, wrapping at 380px each. Topics: caller, shared live board, fair play (claims), **joining ("One link. Type your name. You're in.")**, **next round ("Same group, next round in one tap")**.
6. Comparison table: paper vs Letsplaytambola.
7. 26 ways to win chips.
8. App "Coming soon" with a WhatsApp "Notify me" number field (10 digits).
9. FAQ accordion (id `faq`). The first question is "Do we need to sign up?"
10. Closing CTA band → `/host`, then the footer.

### Join with a code `/join`
Two cards (auto-fit, min 380px; they stack on mobile):
- **Join a game:** code input (62px tall, JetBrains Mono 24px, letter-spacing .16em, uppercase, letters and digits only, max 6) + "Find my game" (cream button).
- **Host your own:** marigold card with a "Host a game" button.

### Host setup `/host` — single column, max-width 560px, centred on desktop too
- Top row: round back button (44px, surface) and the label "NEW GAME" (JetBrains Mono 12px, muted).
- H1 "Host a game" (clamp 34–48px) and the subtitle "Takes a minute. No sign-up for you or your players."
- **Your name:** input 60px tall, radius 16, surface background, 22px/600. Helper text below: `Players will see "<name> invited you".`
- **Game name:** input 60px, 24px/800. Quick-pick chips below (40px pills): Kitty Party · Diwali Night · Family Sunday · Teej Special. Tapping a chip fills the input.
- **Settings card** (surface, radius 20), rows separated by 1px dividers:
  - **Ticket price** with an OPTIONAL tag and "Collected outside the app". A ₹ field on the right (120×50, numbers only, max 5 digits).
  - **Deal me a ticket:** toggle (52×30), on by default. Sub-line "Play while you call numbers".
  - **Ways to win:** summary like "Classic · 6 ways" with a "Change →" link (marigold). Opens `/host/prizes`.
- **Sticky bottom button** "Create game & get link" (62px, radius 18, marigold) on a gradient fade. Disabled look (`disabled` colour) until a name is typed. If tapped while disabled, show the toast "Type your name first".

### Ways to win `/host/prizes`
- Back button and the label "WAYS TO WIN". H1 "How can people win?" Subtitle "Pick a ready-made set, or tap any pattern to add or remove it."
- **Presets** (46px pills; the selected one is filled marigold):
  - Classic = Early Five, Top, Middle, Bottom, Four Corners, Full House
  - Lines + House = Top, Middle, Bottom, Full House
  - Just Full House
- **All 26 patterns**, grouped (Quick, Lines, Corners, Shapes, Number ranges, Full ticket). Each group is a surface card.
  - Each row is at least 60px tall: name (18px/800) + one-line rule (15px, muted), with a round 30px check on the right (marigold fill + ✓ when on).
- Sticky button "Done · N picked". It needs at least 1 pattern; otherwise show the toast "Pick at least one way to win".

### Game page `/g/:code`
Title row on every state: a kicker ("You're hosting" or "Priya's game"), the game name (clamp 32–48px), and on the right: a "Code K7RQ2" pill, a "Copy link" pill and a "Sound on/off" pill.

**a) Join** (a visitor who is neither the host nor a player), max-width 560:
- Card: "Priya invited you to" / the game name (marigold, clamp 36–48px) / meta line "3 people in · 6 ways to win · ₹100 ticket, pay Priya directly".
- "What should we call you?" input (62px, 22px). "Join game" button (marigold; disabled look while empty).
- Footnote: "No sign-up. Your name is only shown to people in this game."
- Joining is allowed while the game is **lobby or live**, but not when it is done. Every joiner is dealt a ticket straight away.

**b) Lobby** — 2 columns ≥ 840px (auto-fit min 400), 1 column on mobile.
- **Host, left column:**
  - Card "Share this link with everyone": the link in a mono box; **Share on WhatsApp** (60px, green, white text) opening `https://wa.me/?text=`; "Copy link" and the system share sheet (`navigator.share` when available).
  - Hint: "Playing in the same room? Read out the code: K7RQ2".
  - Then the big **"Start the game"** button. It reads "Waiting for players…" and is disabled until at least 1 player is in.
- **Player, left column:** marigold note "You're in! Waiting for Priya to start the game." and a preview of their ticket.
- **Right column:** "Who's here · N" list (40px avatar with initial, name, tags "host" / "you") updating live; "Ways to win" list (name + rule).

**c) Live** — 2 columns ≥ 860px, stacked on mobile in this order: caller, host controls, ticket, ways to win, board, players.
- **Caller card** (surface, radius 26, marigold dotted top edge):
  - Pink ball 116px with a 5px marigold ring and a glow; inside it a cream disc 76px with the number (42px/800).
  - Next to it: "N OF 90 CALLED" (mono 12px, marigold) and the callout (clamp 22–28px/800).
  - Below: "Before:" and the previous 5 numbers as 40px chips.
- **Host controls** (host only): "Call next number" (64px, marigold, flex 1) + an "Auto call" toggle button (120px). When on it reads "Auto on · Stop" with a green tint. Auto-call interval is 6s by default (4/6/8/10 configurable).
- **Ticket** (if you have one):
  - Paper card, radius 20. Pink header with "<Name>'s ticket" and a **Claim!** pill (46px, marigold).
  - 3×9 grid, 2px gaps. Blank cells are diagonal-striped; number cells are tappable (aspect 1:1.15).
  - Tapping toggles a pink dab (white number). Only called numbers can be dabbed; otherwise show the toast "${n} hasn't been called yet".
  - Hint line below the grid.
- **Ways to win** list with status: "Open" (muted) or the winner's name (marigold, plus " (you)").
- **Board:** 10×9 grid of round cells. Latest number pink, called numbers marigold, others plum.
- **Players:** chips with avatar + name.
- **Claim sheet:**
  - Bottom sheet, cream, radius 28 at the top, max-width 560. Title "What are you claiming?" and the line "We'll check your ticket instantly."
  - One button per **open** prize (name + rule).
  - **The server validates** the claim against the called numbers and the player's dabs.
  - **Valid:** set the winner and broadcast to everyone.
  - **Not valid:** toast "Not yet for <prize> — keep playing!" (gentle, no penalty).
- **Win banner** (everyone): marigold card, fixed near the top, 5 seconds: "Meera wins Top Line!" / "Checked and confirmed ✓", plus the voice line. **Never navigate away.**
- The game ends when every prize has a winner or all 90 numbers are called.

**d) Results**
- "That's the game!" (clamp 40–64px, marigold), the count of numbers called, and the note "Settle any prize money between yourselves — the app never handles payments."
- Winners list.
- **Host:** "Play again with same people". This resets to the lobby with the same code and link, new tickets for everyone, and prizes cleared.
- **Players:** "Stay on this page — if Priya starts another round, you'll get a fresh ticket."
- Everyone: "Host my own game".

### Not found
"We can't find game K7RQ2" / "Check the code with whoever sent you the link." / a "Try another code" button.

---

## Game rules and logic
Port these exactly from `Letsplaytambola Play.dc.html`:
- **Ticket (`genTicket`):** 3 rows × 9 columns. 5 numbers per row, 15 in total. Every column has 1–3 numbers. Column ranges are 1–9, 10–19 … 80–90. Numbers ascend down each column.
- **Pattern checks (`check`):** the 26 rules in `data/winning-patterns.json`. Lucky 3 counts the first 5 numbers called.
- **Mark mode:** manual tap by default. An "auto-mark" option exists as a host setting idea, not in v2 scope.
- **Draw:** a random uncalled number, **done on the server** (Edge Function / RPC). Only the host token may call it.
- **Voice caller:** Web Speech API, prefer the `en-IN` voice, rate 0.95, pitch 1.15.
  - Say "${callout}! … ${tens} and ${units}, ${n}". Single digits are read as "Single number, 7".
  - On a win, say "${name} wins ${prize}!".
  - Mute toggle is stored per device.
  - iOS needs a user gesture before the first speech, so unlock it on Join/Start.

## Data model (suggested)
```
games(id code PK, name, host_token, host_name, price int, status 'lobby'|'live'|'done',
      called int[], auto bool, round int, created_at, updated_at)
players(id, game_code FK, token, name, color, ticket int[3][9], marks int[], joined_at)
prizes(id, game_code FK, pattern_id, label, sort, winner_player_id null, won_at)
events(id, game_code, kind 'join'|'call'|'win'|'round', payload jsonb, at)   -- realtime feed
```
- **Row-level security:** only `host_token` can update a game's status, called numbers or auto; a player can only update their own `marks`; claims go through an RPC.
- **Realtime:** one channel per game code.

## Responsive rules
- Mobile-first. Breakpoints: header changes at 860px; two-column grids use `repeat(auto-fit, minmax(min(100%, 400–420px), 1fr))`.
- Content max-width is 1160px (game, website) or 560px (setup, join, ways to win). Side padding is 20px.
- Minimum tap target 44px; main buttons 60–64px. Minimum body text 15px. Inputs are at least 16px so iOS does not zoom.
- Use `100dvh` and the safe-area insets for sticky bottom buttons on mobile.

## Design tokens
Fonts: **Baloo 2** (500/600/800) for everything; **JetBrains Mono** (500) for codes, counters and small caps labels (12px, letter-spacing .08–.1em, uppercase).

| Token | OKLCH (source) | Hex (approx.) |
|---|---|---|
| bg / plum | `oklch(0.21 0.07 295)` | `#1b0f34` |
| bg-deep (footer) | `oklch(0.18 0.06 295)` | `#140a29` |
| surface | `oklch(0.27 0.08 295)` | `#2a1c49` |
| surface-2 / row divider | `oklch(0.33 0.08 295)` | `#392b5a` |
| line / border | `oklch(0.38 0.07 295)` | `#453a64` |
| text | `oklch(0.97 0.02 85)` | `#fbf4e6` |
| text-soft | `oklch(0.82 0.03 295)` | `#c5c1d6` |
| text-muted | `oklch(0.78 0.04 295)` | `#b9b3cf` |
| marigold (primary) | `oklch(0.83 0.16 78)` | `#ffb831` |
| pink (accent, ball, ticket header, dab) | `oklch(0.68 0.22 358)` | `#fa4a98` |
| teal | `oklch(0.8 0.13 180)` | `#40d9c1` |
| whatsapp green | `oklch(0.68 0.16 150)` | `#3bb360` |
| ink (text on light) | `oklch(0.25 0.07 295)` | `#25193f` |
| paper (ticket) | `oklch(0.96 0.03 85)` | `#fbf1dc` |
| disabled button | `oklch(0.5 0.08 295)` | `#665a8c` |

- **Radius:** pills 999; buttons 16–18; inputs 14–16; cards 18–28; bottom sheets 28 at the top.
- **Shadows:** ticket `0 24px 50px -24px rgba(0,0,0,.8)`; win banner `0 30px 60px -20px rgba(0,0,0,.7)`; toast `0 16px 40px -12px rgba(0,0,0,.6)`; primary buttons `inset 0 -4px 0 rgba(0,0,0,.18)`.
- **Page background:** plum + `radial-gradient(ellipse at 0% 0%, oklch(0.3 0.11 340 / .45), transparent 45%)`.
- **Avatar colours (in join order):** pink, marigold, teal, `oklch(0.75 0.14 260)`, `oklch(0.8 0.15 140)`, `oklch(0.75 0.15 30)`.
- **Toast:** cream pill, bottom centre, 2.4 seconds.

## Copy notes
Plain words, warm tone, Indian English. Key strings are written out in the screens above. Never say "account", "log in" or "sign up" except to say it isn't needed.

## Out of scope for v2
Accounts, friends, groups, contacts, history across devices, payments, native apps, chat or reactions.

## Open items
- Rewrite the Privacy and Terms pages for v2. They should cover: names typed by players, a device token, game data deleted after 24 hours, and the Notify-me phone numbers.
- Confirm the domain and the share-link format.
- App store badges stay "Coming soon".
