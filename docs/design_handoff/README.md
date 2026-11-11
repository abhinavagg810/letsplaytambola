# Handoff: Letsplaytambola — PRD + Design Spec

> Mobile app (iOS/Android) + web app for hosting and playing Tambola (Housie) with family and friends.
> Primary audience: **women aged 30–70 in India** (kitty parties, family & festival games). Simplicity beats features.

---

## 0. About these files

The files in `prototype/` are **design references built in HTML** — working prototypes that show the intended look, copy and behaviour. They are **not production code**. Recreate them in the target stack (recommended below) using its own patterns. Game state in the prototype lives in `localStorage` and syncs between browser tabs only; production needs a realtime backend.

**Fidelity: High.** Colours, type, spacing, copy and interactions are final unless noted. Recreate pixel-close.

**How to open the prototypes:** open any `.dc.html` file in Chrome (keep `support.js` beside them).
- `Tambola App.dc.html` — two phones side by side (Host “Priya”, Player “Rahul”). Use **Load sample past games** to see history/results. **Clear demo data** resets.
- `Tambola v3 Web.dc.html` — same app as a responsive web page with a left sidebar. Each browser tab = a different person.
- `TambolaPhone.dc.html` — the single app screen component used by both (all logic lives here).
- `Logo.dc.html` — logo component (props: `size`, `tone` light|dark, `markOnly`).
- `Tambola App Flow.dc.html` — static storyboard of the original flow (reference only; the live prototype supersedes it).

---

## 1. Product summary

### Problem
Families and kitty groups play Tambola with paper tickets or clunky apps. Hosting needs printing tickets, shouting numbers, checking claims by hand and tracking who won what. Existing apps are generic, ad-heavy, or confusing for older users.

### Goals
1. A host can start a game and get everyone playing in **under 60 seconds**.
2. Joining is **one tap from WhatsApp** — no app store detour required.
3. The caller, the ticket and the board are always the hero.
4. Claims are verified automatically — no arguments, no “bogey” disputes.
5. Replaying with the same people is one tap (groups).

### Non-goals (v1)
- **No payments in the app.** Ticket price and prize amounts are *recorded* only; money is settled offline (cash/UPI between friends). This is deliberate — real-money gaming is regulated in India. Show “Settled outside the app” wherever price appears.
- No public matchmaking with strangers.
- No ads during a game.

### Success metrics
- % of invited people who join (target > 70%)
- Time from “Host a game” to first number called (median < 90s)
- Games per host per month; % of games started from a saved group
- Day-30 retention of hosts

---

## 2. Users & key flows

| Role | Who | What they do |
|---|---|---|
| **Host** | Organiser (often 40–60) | Creates game, invites, calls numbers (or auto-call), resets, settles |
| **Player** | Family/kitty members (30–70) | Joins from link/invite, dabs ticket, claims prizes, reacts |
| **Guest** | Someone without an account | Joins with just a name from a link |

### Flow A — Host
Sign in → (pick username once) → Home → **Host a game** → name + Who’s playing (contacts / friends / groups) → seats, price, prizes (optional) → **Create game** → Lobby (share to WhatsApp group / send to each contact) → **Start calling** → Play (draw / auto-call / reset) → Results → Settle up → Save players as a group / Next round.

### Flow B — Player via WhatsApp link
Tap link → invite screen (“Priya invited you”) → **Join with Google** or type name → (username once) → **lands directly in Lobby with ticket dealt** (no extra confirmation screen) → waits → plays → claims.

### Flow C — Player via in-app invite
Home shows teal invite card “Priya invited you · Diwali Night · Join” → one tap → Lobby.

### Flow D — Replay with a group
Home → “Play again with” → group → create screen pre-filled with everyone invited.

---

## 3. Identity & onboarding (recommended for production)

- **Unique ID = mobile number** (verified by OTP). Needed for contact matching and WhatsApp.
- Sign-in options: **Phone + OTP (primary)**, Google, Apple (iOS). After Google/Apple, ask for mobile once.
- **Name** from Google or one field. **Username (@handle)** is auto-suggested from first name and editable; shown with a **Copy** link on Home, Friends, Profile and the web sidebar.
- Guests (name only) can play via link; prompt to save account at results.
- Contacts permission: explain first (“We never message anyone without you”), then upload **hashed** phone numbers only for matching.
- Deferred deep link: if a player installs the app from an invite, open straight into that game.

> The prototype simulates sign-in with a name/email sheet and a required username step. Production should follow the list above.

---

## 4. Screens (mobile, 390×844 reference; web reflows)

Global layout: dark plum canvas, content column max-width 560px (play screen 1100px), safe-area top padding ≈ 48px. **Bottom tab bar** (mobile) or **left sidebar 240px** (web) on Home, Games, Friends, Profile — hidden inside create/lobby/play/results.

### 4.1 Sign in
- Logo (size 72), headline “Housie night, **sorted.**” (44px/800, “sorted.” marigold), sub “Host or join a game with family and friends in seconds.” (18px muted).
- Buttons (54px, radius 16): **Continue with Google** (cream bg, ink text), **Continue with Apple** (black).
- If a pending invite link exists, a cream “LINK · Priya shared a link · Join Diwali Night” card appears at top.

### 4.2 Pick a username
- Avatar 72px, eyebrow “HI PRIYA · ONE LAST THING”, title “Pick a username”, helper “Friends find and invite you with it — no more ‘which Rahul?’”.
- Input with “@” prefix, live status: “3–15 letters, numbers or _” / “@priya is available ✓” (teal) / “@x is taken — try another” (pink). Continue (56px marigold).

### 4.3 Invite landing (signed out, from link)
- Host avatar + “Priya invited you”, game name 50px, chips (price or “Just for fun”, seats left, Full House amount).
- **Join with Google** + “Or just your name” input + **Join**.

### 4.4 Home (tab)
Order top→bottom:
1. Small logo (30).
2. Compact header: “Namaste, Priya” (24px/800) + `@priya Copy` (14px muted + 12px marigold underlined link); avatar button 46px → Profile.
3. **In-app invite cards** (teal bg, ink text): host avatar, “Priya invited you”, game name 22px, info line, **Join** (ink pill).
4. **Host a game** hero card (marigold, 28px title, “Invite friends, deal tickets, start calling.”).
5. **Happening now** — live/lobby games (blinking marigold dot, “Open →”).
6. **Play again with** — group cards (stacked face avatars, name, “3 people · Rahul, Kamla…”, “Play →”). If none: dashed “Make a group” card.
7. Game-code input + Join.

### 4.5 Games (tab)
List of all games (hosted or joined): date tile (day/month), name, “Hosted · 5 players · 2 rounds” or “Meera’s game…”, right side **LIVE / Lobby / +₹225 / −₹50 / prize name**. Tap → that game (lobby, play or results).

### 4.6 Friends (tab)
- Title “Friends” + count + `@handle Copy` pill.
- Two big buttons (64px): **+ Add friend** (marigold), **+ Make a group** (teal).
- **Your groups**: rows with faces, name, members, × delete, **Play**.
- **Invited to Tambola** (contacts not yet on app): row with “Invite on WhatsApp” → “Send again”, ×. They auto-convert to friends when they sign up.
- **Friends list**: avatar 44, name, @handle · “3 games together”.
- **Make a group mode**: panel with name input (placeholder auto “Rahul, Kamla & Vikram”), rows become tappable with check circles, sticky **Create group · 3 people**.
- **Add friend sheet**: big green **Choose from contacts** → or by username (@ input + Add) → or let them add you: **Share on WhatsApp** (“Add me on Tambola — I’m @priya”), **Copy @priya**.
- Anyone you play a game with becomes a friend automatically.

### 4.7 Profile (tab)
Avatar 96 with marigold ring, name, email/“Guest account”, `@handle Copy`. Stats (3 tiles): Games, Prizes won, Net (+₹/−₹, teal/pink, “—” if never paid). Settings list: Caller voice toggle, Friends & groups →, Share my username. **Sign out** (pink text).

### 4.8 New game (create)
- Back, eyebrow “NEW GAME”, editable game name (26px/800 input, default “Diwali Night”).
- **Who’s playing?** card (designed to scale to 50+ friends / 10+ groups):
  - Selected invitees as stacked faces + “Rahul, Kamla, Vikram +5 more” + **Edit**.
  - **QUICK ADD**: max 3 one-line chips (top groups in teal, then most-played friends).
  - Selected contacts summary “5 contacts · Sunita, Rekha… — You’ll send the WhatsApp invite after creating”.
  - **Choose from contacts** (56px WhatsApp green, primary).
  - **App friends & groups · N** (secondary, opens People picker).
  - Footer: “Or skip — share to a WhatsApp group next.” + **Save as group** link.
- Settings card: **Seats** stepper (2–30, auto-grows with invitees), **Ticket price** (₹, “Pot ₹500 if all join” / “Set 0 to play just for fun”, “Settled outside the app”), **Deal me a ticket** toggle, **Prizes · OPTIONAL** row (“Early Five, Top Line… · auto-split” → Edit).
- Sticky **Create game · 6 prizes**.

### 4.9 People picker (bottom sheet, 88% height)
Title “Add people” + “8 invited”; search (name or @username); segmented **Friends · 50 / Groups · 10**; scrolling list (friends sorted by games together; groups with **Add all / Added ✓**); exact @username of a non-friend shows dashed “Invite” row; sticky **Done · 8 invited**.

### 4.10 Contacts picker (bottom sheet, 90%, light theme for readability)
First time: permission explainer (green tile, “Invite from your contacts”, copy, **Allow contacts**, Not now). Then: “Your contacts”, search, 60px rows (avatar 44, name 18px, sub = phone or “On Tambola · @meera” in green or “Already invited/added”), round green check; sticky **Done · 5 selected** / **Add 5 as friends** / **Add 5 to invite list**.

### 4.11 Prizes (optional)
- Presets chips: Classic, Lines + House, Just Full House, No prizes.
- Pot card (if price > 0): “POT IF ALL 6 JOIN” + big amount, **Auto-split ✓** pill, progress meter, “₹500 of ₹600 assigned / ₹100 left / All set ✓ / ₹50 over”.
- Prize cards: mini 3×9 ticket (pink cells = pattern), name, **brief rule**, on/off switch, × for added ones, −/+ ₹10 stepper with editable amount.
- **+ More ways to win** → library grouped Quick / Lines / Corners / Shapes / Number ranges / Full ticket. Each row: mini ticket, name, one-line rule, **Add** (→ “Added ✓”). Full House repeats as **+ Second House / + Third House**.
- Sticky **Done**.
- Full list of 26 patterns with rules: `data/winning-patterns.json`.

### 4.12 Lobby
- Game name 34px + info (“₹100 ticket · 6 prizes · ₹600 pot” or “Just for fun…”), code + round in eyebrow.
- **Host — Invite people card**: **Share to a WhatsApp group** (56px green, primary); **Send to your contacts** list (each: avatar, name, status Not sent yet / Invite sent / Joined the game, button **Send on WhatsApp** → Send again → Joined ✓, counter “3 OF 5 SENT”); small row **From contacts · App friends · Copy link**.
- **Your ticket** (cream paper, pink header, ticket number).
- Players list: joined (“Host · @priya”, “Joined”) + invited-pending at 50% opacity (“@rahul · invited”, “Invited”).
- Host: **Start calling** (56px marigold). Player: grey pill “You’re in! Waiting for Priya to start” with blinking dot.

### 4.13 Play (main game screen)
Two columns on wide screens (each `flex:1 1 340px`), stacked on mobile.
- Header: back, game name, “23 / 90 · K7Q2M”, **Voice/Muted** pill.
- **Caller card**: marquee bulb strip (dots), **ball** 104px (pink, marigold ring, glow) with cream inner 68px showing number 38px/800; eyebrow “NUMBER 23” / “SHAKING THE BAG…”; **callout** 24px/800 (unique rhyme per number, `data/number-callouts.json`); last 5 numbers as 26px chips.
- Host controls: **Next number** (flex, 54px marigold), **AUTO** (Off/5s/8s/12s cycle), **Reset**.
- Win banner (inline, 5s): mine = marigold “CLAIM VERIFIED · You won Top Line! ₹75”; others = teal “WINNER · Meera won Top Line”. Confetti for everyone. **Never navigates away.**
- Private nudge (mine only): “You need just 1 more for Full House!”.
- **Ticket** (3×9, cream paper, striped blanks): tap a called number to dab (tilted pink stamp); called-but-undabbed numbers get a pink ring; tapping an uncalled number toasts “Not yet! 34 hasn’t been called”. Header shows **“6/15 · NEEDS 9”** — visible only to the ticket owner.
- Reactions row: Waah!, Arre yaar, Jaldi!, So close, One more! → floating bubbles on everyone’s screen.
- **Board** 1–90 (10 columns): called = marigold, latest = pink with cream ring.
- **Prizes & winners** list (no horizontal scroll): mini pattern, name, “₹75 · rule”, right side = winner avatar+name / **Claim** button / “Open”. Header “2 OF 6 WON”.
- **Players** list: avatar, name (you), “Host · @priya”, “2 won” tag. No ticket progress shown for others (privacy).

### 4.14 Reset sheet (host)
“Reset the board?” — **Restart — same tickets**, **Restart — fresh tickets**, **End round & show winners**, Cancel. Same link keeps working.

### 4.15 Results
Gold radial glow, “ROUND 2 · 61 NUMBERS”, title “That’s a wrap!” / “You top the table!”. **Podium** (2nd, 1st, 3rd; 1st marigold bar with pink ring). **Winners** list per prize (Full House row highlighted). Buttons: **Save these players as a group**, **Settle up** (host) / **See payouts**, **Next round — fresh tickets** (host).

### 4.16 Settle up
“Who gets what” + summary (“You collected ₹500 · pay out ₹425 · ₹75 stays with you”). Rows: avatar, name, prizes + net, amount won. Unclaimed note (“Second House unclaimed (₹50) — roll it into the next round?”). **Share results** (WhatsApp text), **Done**. No in-app payment buttons.

### 4.17 Web layout
Same screens; left sidebar (logo, Home/Games/Friends/Profile with invite badge, **Host a game**, user + handle Copy). Content centred; play screen two-column.

---

## 5. Game rules & logic

- **Ticket**: 3 rows × 9 columns, 15 numbers, exactly 5 per row, ≥1 per column, column c holds c·10…c·10+9 (col 0 = 1–9, col 8 = 80–90), sorted top→bottom within a column. See `genTicket()` in `TambolaPhone.dc.html`.
- **Draw**: uniform random from remaining of 1–90. Only host can draw. Auto-call runs on host device at 5/8/12s; stops when round ends.
- **Dabbing**: only numbers already called can be dabbed. Optional auto-dab setting.
- **Claim**: server validates `check(ticket, dabbed ∩ called, rule)`. Valid → prize locked to player, broadcast win. Invalid → **Bogey** broadcast (“Bogey! Nani’s Middle Line didn’t check out”), voice “Oh no! Bogey!”.
- Multiple prizes with the same pattern (Full / Second / Third House) are claimed **in order**; one player can’t win the same pattern twice.
- Round ends when every prize is claimed or host chooses End. Next round can keep or refresh tickets.
- **Auto-split**: pot = price × joined players; amounts weighted by pattern difficulty (`autoSplitWeight`), rounded down to ₹10, remainder to Full House. Host can override any amount; meter shows assigned/left/over.
- Host’s own ticket is not counted as a cost in host’s net.

### Voice caller
Text-to-speech (prefer en-IN voice, pitch 1.2, rate 0.95): “{callout}! … {tens} and {units}, {number}” (single digits: “Single number, 7”). Also announces wins and bogeys. Mutable per user. Only one device in a room needs to speak (each device speaks its own; prototype mutes the second phone).

---

## 6. Data model (suggested)

```
User { id, phone (unique, hashed for matching), name, photoUrl, username (unique), email?, createdAt }
Friendship { userId, friendId, source: 'contact'|'username'|'played', createdAt }
PendingInvite { userId, contactName, phoneHash, sentAt? }   // auto-resolve on signup
Group { id, ownerId, name, memberIds[] }
Game { id, code(5), name, hostId, status: 'lobby'|'live'|'ended', round, maxSeats, price, invitedUserIds[], contactInvites[{name, phone, sentAt}], createdAt }
Prize { id, gameId, label, rule, amount, order }
Player { gameId, userId|guestName, ticket[3][9], dabs[], joinedAt }
Round { gameId, n, called[], claims{prizeId → {userId, at}}, endedAt }
Event { gameId, seq, kind: 'call'|'win'|'bogey'|'react'|'join'|'start'|'end', payload, at }
```
Realtime: one channel per game (`game:{id}`) broadcasting Events; clients derive state. Recommended: **Supabase** (Postgres + Realtime + Auth with phone OTP) or **Firebase** (Firestore + Auth). Claims validated server-side (edge function).

---

## 7. Design tokens

### Colours
| Token | OKLCH (source) | Hex (approx) | Use |
|---|---|---|---|
| bg | oklch(0.21 0.07 295) | #1B0F34 | App background |
| sidebar | oklch(0.18 0.06 295) | #140A29 | Web sidebar, tab bar |
| surface | oklch(0.27 0.08 295) | #2A1C49 | Cards |
| surface-2 | oklch(0.33 0.08 295) | #392B5A | Chips, steppers |
| line | oklch(0.38 0.07 295) | #453A64 | Borders |
| cream | oklch(0.97 0.02 85) | #FBF4E6 | Primary text on dark |
| muted | oklch(0.78 0.04 295) | #B9B3CF | Secondary text |
| ink | oklch(0.25 0.07 295) | #25193F | Text on light/marigold |
| marigold | oklch(0.83 0.16 78) | #FFB831 | Primary CTA, called numbers |
| pink | oklch(0.68 0.22 358) | #FA4A98 | Ball, dabs, ticket header, accent |
| teal | oklch(0.8 0.13 180) | #40D9C1 | Secondary CTA, invites, success |
| paper | oklch(0.96 0.03 85) | #FBF1DC | Ticket |
| whatsapp | oklch(0.68 0.16 150) | #3BB360 | Contacts / WhatsApp actions |
| bogey-text | oklch(0.85 0.12 358) | #FFACCD | Negative net, sign out |
| avatar set | pink, marigold, teal, #78AEFF, #87D576, #FE8674 | | Assigned in join order |

### Typography
- **Baloo 2** (Google Fonts) 500/600/800 — all UI. **JetBrains Mono** 500 — eyebrows, counters, codes (11–12px, letter-spacing .06–.1em, uppercase).
- Scale: 62 / 56 / 50 / 44 / 38 / 34 (screen titles) / 28 / 24 / 22 / 20 / 18 / 17 (body) / 16 / 15 / 14 / 13 / 12. Min body 15px; min tap target 44px. Line-height 1–1.15 headings, 1.35–1.45 paragraphs.
- Accessibility for audience: consider a “Large text” setting (+15%).

### Radius / spacing / shadow
- Radius: 999 (pills), 28 (sheets), 24 (caller, hero cards), 18–20 (cards), 14–16 (buttons/inputs), 12 (small inputs), 8 (ticket grid).
- Spacing: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24. Screen side padding 20 (play 14).
- Primary button: 56px tall, `inset 0 -4px 0 rgba(0,0,0,.18)` bottom lip; active `translateY(2px)`.
- Cards on dark: no shadow; ticket `0 20px 40px -18px rgba(0,0,0,.7)`.

### Motion
| Name | Spec |
|---|---|
| Ball shake | 12 frames × 75ms random numbers, wobble ±8° 0.22s loop, then pop |
| Ball pop | 0.65s cubic-bezier(.2,1.4,.4,1): scale .3→1.1→1, rotate −120°→8°→0 |
| Sheet in | translateY(100%)→0, 0.3s cubic-bezier(.2,.9,.3,1) |
| Card in | scale .92→1 + fade, 0.35–0.4s |
| Confetti | 60–70 pieces, 2–3.5s fall with 720° spin |
| Reaction bubble | rise + fade over 4s |
| Live dot | opacity blink 1.2s |

---

## 8. Assets
- `assets/logo-wordmark-transparent-4x.png` — light wordmark (for dark backgrounds).
- `assets/logo-on-plum-4x.png` — wordmark on brand plum.
- `assets/app-icon-1024.png` — app icon (pink ball, marigold ring, cream “90”, plum rounded square).
- Logo construction (recreate as vector): tilted (−5°) pink pill “Let’s play” (white Baloo 2 800, 0.36em, bottom shadow #A0145E-ish) overlapping bold cream “TAMB◉LA” (Baloo 2 800, pink 0.05em text-shadow), where ◉ is a marigold ball (0.74em) with cream inner disc and ink “90”, rotated −12°. Dark tone variant: ink letters, marigold shadow. See `prototype/Logo.dc.html`.
- No icon library is used; tabs are text pills. Add a consistent rounded icon set (e.g. Phosphor “Fill”) if needed.
- Data: `data/number-callouts.json` (90 unique callouts incl. Indian ones: 42 Quit India movement, 47 Year of Independence, 80 Gandhi’s breakfast), `data/winning-patterns.json` (26 patterns with rules + preview cells + split weights).

---

## 9. Edge cases
- Game full → “Sorry — this game is full”. Link to ended game → results view.
- Host leaves mid-game → game pauses; host can resume from Home “Happening now”.
- Player offline → on reconnect, replay events; dabs persist.
- Two simultaneous valid claims for same prize → server timestamp wins; second gets “already went to X”.
- Ticket has no numbers in a range (e.g. Bamboo) → cannot win that prize.
- All 90 called with prizes unclaimed → host ends round; unclaimed shown in settle-up.

---

## 10. Release plan
- **v1**: everything above, phone OTP + Google, contacts + WhatsApp invites, groups, history, voice in English.
- **v1.1**: Hindi voice + UI, “Large text” mode, multiple tickets per player, TV/cast big-board mode.
- **v1.2**: themed prize packs (Diwali, Kitty, Wedding), scheduled games with reminders.
