# QA report — player-facing side

For the owner. Plain language; the technical detail is in [`TEST_PLAN.md`](TEST_PLAN.md) and
[`results-user.json`](results-user.json). Screenshots are in [`evidence/`](evidence/).

## 1. Verdict: **ready, with caveats**

The website, hosting, joining and the game itself work correctly and fairly in everything that could be tested here.
21 problems were found; 16 are fixed (each with an automatic test so it cannot quietly come back), 5 are left open
because they are choices for you rather than mistakes.

**Why "ready":**
- A whole game works end to end on phone and desktop sizes: host → share → join → play → claim → results → play again.
- Tickets stay private. 1,364 server answers from a two-round game were searched: nobody ever received another
  person's ticket, dabs or device identity.
- Only the host can run the game; every claim is checked by the server. All 26 ways to win were compared, claim by
  claim, against a second, independent reading of the rules — they always agreed.
- Two phones claiming at the same instant: always exactly one winner. Thirty people opening the link in the same
  second: all thirty got a seat.
- Phones that go offline, sleep, reload or are slow catch up by themselves; nothing is called twice.
- Fast: about 300 KB per page on a first visit, Lighthouse mobile performance 97–100, a 100-player game stays smooth.

**The caveats (please read before launch):**
1. **Not tested on real phones.** Everything ran in an emulated Android Chrome and iPhone-sized browser. Before
   inviting real groups, play one game on a real Android phone opened from WhatsApp, and one on an iPhone to **hear the
   voice** (section 6).
2. **Not tested with the real database and hosting** (Supabase + Vercel). Games here were kept in the server's memory.
3. **One rule needs your decision (D-1):** when the 90th number is called the round ends at that instant, so a prize
   that needed that last number — or that a slow player has not claimed yet — can never be claimed. This is what the
   written spec says, but it will feel unfair in a real game.
4. Three colour/size choices from the design fall short of the usual readability standard (section 5, D-3).

## 2. What was tested, and how

- **How:** the real production build of the site, driven by automatic "devices" — separate browser windows that each
  behave like one person's phone (own storage, own identity, touch screen). Up to 100 devices in one game through the
  server, up to 4 real browser windows side by side. Plus direct requests to the server to try things a normal screen
  would never send (forged requests, floods, broken data).
- **Devices emulated:** Android phone (360 px and 412 px wide, Chrome), iPhone (390 px, Safari identity), desktop (1280 px).
- **Screen widths:** 320, 360, 390, 414, 640, 768, 1024, 1280, 1440, 1920 px and a phone held sideways (760×360) —
  16 screens at each, 176 combinations, none scrolls sideways.
- **Browser:** Chromium only (the engine behind Chrome and most Android browsers). Safari's and Firefox's engines were
  not available.
- **Tools:** 393 rule tests (`npm test`), 113 end-to-end cases (`npm run e2e`, new in this pass), a scripted full game
  (`npm run smoke`), Lighthouse (speed/quality audit), axe-core (accessibility scanner), load scripts.

### Counts

| | Cases |
|---|---|
| **Total in the plan** | **149** |
| Passed | 107 |
| Failed first, fixed, pass now | 25 |
| Ran, but a known problem is still open (your decision) | 6 |
| Blocked — impossible in this environment | 7 |
| Not run — with the reason | 4 |
| Failed and unexplained | 0 |

The full suite was run three times in a row at the end with the same result. "Blocked" and "not run" are listed in
section 6 — none of them was counted as a pass.

## 3. Every problem found

Severity: **S1** game unusable / unfair · **S2** serious, many people affected · **S3** moderate · **S4** minor.

| ID | Sev | Area | What happened | How to reproduce | Status | Fix | Test that guards it |
|---|---|---|---|---|---|---|---|
| U-01 | S2 | Auto-call | With the game open in two tabs (or two devices) as host, auto-call called numbers twice as fast — 8 numbers in 24 s instead of 4 | Host opens the game link twice, switches Auto call on | **Fixed** | Each "call next" request now says how many numbers the screen has seen; the server calls a number only if that is still true. Also protects against double taps and retries | AUTO-02, API-14, LIVE-03, UNIT-09 |
| U-02 | S3 | Auto-call | Switching Auto call on called a number immediately (0.1 s) if the last one was more than 6 s ago | Call one number, wait 8 s, tap Auto call | **Fixed** | Now waits one full interval after switching on, then one interval after every number (measured: 6.1 s, 12.3 s, 18.4 s) | AUTO-01, AUTO-03, UNIT-10 |
| U-03 | S2 | Ticket | Number cells were 32×37 px on a 360 px phone (27×32 at 320 px) — hard to hit for older fingers | Open a live game on a small phone | **Fixed** | On phones the ticket uses a little of the page margin and a slimmer frame; cells are now 35×46 px at 360 px (31×46 at 320, 41×47 at 412). more than 200 taps 3 px inside cell edges never hit a neighbour | LIVE-07, RSP-03 |
| U-04 | S4 | Copy | Full House read "All 15 numbers — add again for Second House" (not possible: a pattern can be picked once); the home page also advertised "Second House" | Open Ways to win, the lobby, the claim sheet or the home page | **Fixed** | Now "All 15 numbers"; home page says "Full House" | PRZ-01, CLM-01, WEB-01, UNIT-15 |
| U-05 | S4 | Results | The count line shouted "23 OF 90 CALLED." | Finish a game | **Fixed** | "23 of 90 numbers called." | RES-01, RES-02 |
| U-06 | S3 | Notify me | Any 10 digits were accepted (1234567890, 0000000000) | Type 1234567890, tap Notify me | **Fixed** | Indian mobile numbers only (10 digits starting 6–9), checked on the page and on the server, with the message "Please type a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)" | WEB-06, API-24, UNIT-12 |
| U-07 | S3 | Notify me | Pasting or auto-filling "+91 98100 11001" saved the wrong number (9198100110 — the last two digits were cut off) | Paste a number with +91 | **Fixed** | A leading +91, 91 or 0 is dropped instead | WEB-06, API-24, UNIT-12 |
| U-08 | S4 | Notify me | When the hourly limit was reached people saw only "Couldn't save your number" | Submit 6 times in an hour | **Fixed** | Shows the real reason: "Too many tries — please wait a minute and try again" | WEB-07 |
| U-09 | S3 | Names | A name made of invisible characters was accepted (a blank player in the list); a hidden "reverse the text" character could scramble how a name and the words next to it are shown; cutting a name at 24 characters could leave half an emoji (shown as �) | Join with a zero-width space as the name | **Fixed** | Invisible and text-flipping characters are removed; a name with nothing visible is refused. Hindi, Arabic and emoji names still work | API-17, UNIT-11 |
| U-10 | S2 | Sharing | The invite link's preview (what WhatsApp shows under the link) had **no picture and no site name** — only the home page had them | Look at the preview tags of any /g/CODE page | **Fixed** | The game page now carries the same picture (1200×630), site name and large-card setting; still nothing about who is playing | WEB-09 |
| U-11 | S2 | Security | The site sent none of the standard protective headers: another website could show it inside an invisible frame and trick taps ("clickjacking"); it also announced its framework | Read the response headers of any page | **Fixed** | Added: no framing by other sites, no content-type guessing, short referrers (a game link is never passed on to other sites), search engines told to skip game pages and the API; framework banner removed | API-25 |
| U-12 | S4 | Host setup | Pasting a price with paise, "1500.50", became ₹15005; same for prize amounts | Paste 1500.50 into Ticket price | **Fixed** | Paise are dropped: ₹1500 | HOST-04, PRZ-04, UNIT-14 |
| U-13 | S4 | Footer | Footer links (Privacy, Terms, Contact…) were 24 px tall tap targets | Any page on a phone | **Fixed** | 44 px tap area each | RSP-03 |
| U-14 | S4 | Join | A name typed with extra spaces ("Meera   Devi") was shown tidy in the game but prefilled untidy next time | Join with double spaces, open another invite | **Fixed** | Remembered the same way the game shows it | JOIN-03 |
| U-15 | S3 | Ticket | Dabbed numbers (white on pink) were 16.5 px on phones — below the readability standard for that colour pair | Dab a number on a 360 px phone | **Fixed** | Ticket numbers are 19 px or more on phones (bold text of that size meets the standard) | A11Y-05, A11Y-07 |
| U-16 | S4 | Tooling | `npm run smoke` failed about 1 run in 10 for no real reason (when a top line happened to need the 90th number) | Run it 10–20 times | **Fixed** | It deals a new game in that case | 12 runs in a row passed |
| U-17 | S3 | Colours | "Share on WhatsApp": white text on the green is 2.7 : 1 (the standard asks 3 : 1 for big bold text) | Lobby as host | **Open — D-3** | Colours are fixed by the design; suggestion below | A11Y-05 reports it |
| U-18 | S4 | Colours | Main buttons in their "not ready yet" look (Create game, Join game before a name is typed): dark text on muted purple, 2.6 : 1 | /host with no name | **Open — D-3** | As above | A11Y-05 |
| U-19 | S4 | Home page | The pink "COMING SOON" pill (12 px, 3.2 : 1) and the two 12 px "Coming soon on…" lines in the app-store badges are smaller/fainter than the 15 px rule | Home page, app section | **Open — D-3** | Matches the design prototype | RSP-04, A11Y-05 |
| U-20 | S2 | Game rule | The round ends the instant the 90th number is called. A prize completed by that number, or not yet claimed by a slow player, stays "Open" for ever (in one test run the 90th number completed 10 patterns on a ticket and none could be claimed) | Play to the 90th number without claiming | **Open — D-1** | Works as the spec is written; needs a product decision | API-28 documents it |
| U-21 | S4 | Security | The "per network address" request limits trust a header that only a hosting platform should set. On Vercel this is fine; on a self-run server someone could dodge the limits | 25 Notify-me requests with made-up addresses were all accepted | **Open** | No change needed on Vercel; noted for any other hosting | SEC-01 |

No S1 problems were found.

## 4. Open risks

- **Real phones and WhatsApp** (not available here): the in-app browser WhatsApp opens links in, the Android keyboard
  covering fields (simulated only), the Back gesture, real touch accuracy.
- **The voice on iPhone.** iPhones only speak after a tap. The site does what iOS needs (it "unlocks" the voice inside
  the Join, Start and Sound-on taps — verified), but whether the phone then really speaks, and how the Indian-English
  voice sounds, can only be heard on a real device. A player who joined, then left the page open in the background
  before the first number, is the case most likely to stay silent.
- **Host's phone in the background.** Auto-call runs in the host's browser. If the host switches to WhatsApp or the
  screen locks, phones pause the page, so calling pauses and resumes when they come back (the pause/resume itself was
  tested by closing, reloading and going offline). Hosts should be told to keep the game on screen — see D-4.
- **Real database, hosting and instant updates** (Supabase + Vercel) were not exercised. In particular: several server
  copies handling one game at once, the instant-update channel, and the request limits behind Vercel.
- **Many players behind one mobile-network address.** Without the instant-update channel each phone asks the server
  every 1.5 s; the per-address limit is 6,000 requests a minute (about 150 phones on one address). With the channel
  on, phones ask every 8 s. One device with more than 6 tabs of the same game open would hit its own limit.
- **Seats cannot be removed.** Someone who joined by mistake, joined twice (after clearing browser data) or left stays
  in the list, and counts when the ticket money is split — see D-2.
- **Safari and Firefox engines** were not available; layout uses standard features, but it was not seen there.
- **Mobile data in the field** (slow, patchy) was only simulated by delaying and failing requests.

## 5. Needs your decision

| # | Question | Recommendation |
|---|---|---|
| **D-1** | After the 90th number, should the round stay open so people can still dab and claim? (U-20) | Yes: after the 90th call keep the game "live" with calling switched off, and end the round when every prize is won or the host taps a new "Finish round" button. Small change, removes the unfair case |
| **D-2** | Should the host be able to remove a player (wrong person, duplicate, someone who left)? Today nobody can, and every seat counts in the automatic prize split | A "Remove" option for the host in the lobby only would cover most cases |
| **D-3** | Readability vs the design's colours (U-17, U-18, U-19) | WhatsApp button: use the dark ink colour for the text, or a slightly darker green. "Not ready" buttons: cream text. Home-page badges: 15 px. All three are one-line changes once you agree |
| **D-4** | Tell hosts to keep the page open while auto-call runs? | A one-line hint under the Auto call button the first time it is switched on: "Keep this page open — calling pauses if you leave" |
| **D-5** | The code box accepts 6 characters although codes have 5; a wrong-length code goes to "We can't find game …" | Fine as is; optionally say "Codes have 5 letters and numbers" before leaving the page |
| **D-6** | Names are limited to 24 "characters" as computers count them: an emoji counts as 2, so 24 emoji do not fit | Leave as is |

## 6. What could NOT be tested here

| ID | What | Why | What was done instead |
|---|---|---|---|
| NR-01 | Real Android phones, incl. WhatsApp's in-app browser | No devices | Emulated Android Chrome at 360 and 412 px with touch |
| NR-02 | Real iPhone: hearing the voice | No iPhone, no Safari engine | The unlock-in-a-tap path iOS needs is verified (LIVE-13) |
| NR-03 | Real WhatsApp share and link preview | No WhatsApp | Exact wa.me link and text (LOB-01); preview tags and picture (WEB-09) |
| NR-04 | Supabase database and instant updates | No project available | In-memory store with polling |
| NR-05 | The site on Vercel | No deployment | Local production build |
| NR-06 | Safari / Firefox engines | Not installed; downloading was not allowed | Chromium with phone emulation |
| NR-07 | Slow 3G in the field | Not available | Delayed, failed and offline requests |
| NR-08 | TalkBack / VoiceOver | Not available | Roles, names, live regions, axe scan |
| NR-09 | Host's real phone locking with auto-call on | Headless browsers do not freeze pages | Close, reload, offline and hidden-tab cases |
| NR-10 | Android "largest font" setting | Cannot be emulated | 200 % zoom equivalent widths; pinch-zoom allowed |
| NR-11 | Names shown in the admin panel | Admin is in the next pass | Player side renders all names as plain text |

## 7. Recommendations, in order

1. **Decide D-1** (the 90th number) before real groups play — it is the one thing likely to cause an argument.
2. **Play two real games before launch:** one hosted from an Android phone with players joining from a WhatsApp group;
   one with an iPhone in the game, listening for the voice from the first number.
3. **Deploy to Vercel + Supabase and run `npm run smoke` and a hand-played game there** — the multi-server and
   instant-update paths have not been exercised.
4. Decide D-3 (three small readability changes) and D-4 (hint for hosts).
5. Consider D-2 (remove a player) for the next version.
6. Keep `npm test` and `npm run e2e` in the routine before each release (about 4 minutes together; how to run them is in the README).

## 8. Measurements worth knowing

| | Result |
|---|---|
| Lighthouse, mobile (slow 4G, slow phone) | Home: performance 97, accessibility 96, best practices 100, SEO 100 · Host: 100 / 96 / 100 / 100 · Join: 98 / 100 / 100 / 100. Largest paint 0.9–1.1 s, no layout shift. (The accessibility points lost are the colour items in D-3.) |
| Download on a first visit (compressed) | Home 278 KB · Host 294 KB · Join 284 KB · Game page 326 KB · of which fonts 79–95 KB (kept for a year after the first visit) |
| 30 devices in one game for 60 s, auto-call at the fastest setting | 1,198 reads: typical 4 ms, slowest 26 ms. 159 actions: typical 4 ms, slowest 24 ms. No errors |
| 200 games at once (10 players each, in play) | Built at about 500 requests a second; reading a game still takes 2.5 ms |
| 100 players in one game on a 360 px phone | Live screen ready in 0.3 s; a dab shows in 9 ms; what each phone downloads per update: 12.8 KB |
| Time for a called number to reach a player (polling) | 0.2–1.8 s, average 1.1 s |
| Win banner | Shows on every device within about 1 s, stays 5.0–5.8 s, nobody is moved off their screen |
| Automated accessibility scan (axe-core, 16 screens) | Only colour-contrast items (D-3 and decorative pictures on the home page); no missing labels, names, roles or headings |
| Ads | Off: no ad code, no requests to other sites at all. In a test build with ads switched on: one slot at the bottom of the lobby, one on results, none on the live game or anywhere else (ADS-01) |

## 9. Notes for the admin / analytics pass

Seen while testing the player side, not changed (outside this pass):
- The analytics beacon (`/api/t`) sends the device's secret token in the request body (`tk`). The privacy page and
  `docs/API.md` say tokens only travel in a header and are stored as a hash; please confirm the body value is hashed at
  once, never logged, and that the privacy text still matches.
- Player and game names can contain HTML-looking text (`<img onerror=…>` is a legal 24-character name). They are safe on
  the player side; the admin tables and CSV exports should be checked for the same (including spreadsheet formulas such
  as a name starting with `=`).

## 10. Files changed in this pass

Fixes: `src/core/engine.ts`, `src/core/types.ts`, `src/core/data.ts`, `src/core/phone.ts` (new), `src/core/index.ts`,
`src/lib/useAutoCall.ts`, `src/lib/device.ts`, `src/server/games.ts`, `src/server/http.ts`,
`src/features/game/HostControls.tsx`, `src/features/game/Results.tsx`, `src/features/host/draft.ts`,
`src/features/host/HostSetup.tsx`, `src/features/website/NotifyForm.tsx`, `src/features/website/Website.tsx`,
`src/components/Ticket.tsx`, `src/components/Ticket.module.css`, `src/components/SiteFooter.module.css`,
`src/app/g/[code]/page.tsx`, `next.config.ts`, `scripts/smoke-api.mjs`.

Tests: `src/core/__tests__/qa-regressions.test.ts`, `src/lib/__tests__/autoCall.test.ts`,
`src/features/host/__tests__/draft.test.ts` (new); `src/core/__tests__/patterns.test.ts`,
`src/server/__tests__/server.test.ts` (updated); `e2e/run.mjs`, `e2e/lib.mjs`, `e2e/specs/*.spec.mjs` (new, 9 files);
`package.json` (`npm run e2e`), `.gitignore`.

Docs: `README.md`, `docs/API.md`, `docs/COMPONENTS.md`, `docs/qa/*`.

## 10a. Screenshots (in `evidence/`)

- Before the fixes: `before-live-host-360.jpg` (small ticket cells, "add again for Second House"), `before-lobby-host-360.jpg`.
- After: `LIVE-01-live-host-360.jpg`, `LIVE-07-ticket-360.jpg` (ticket on a 360 px phone), `LIVE-01-live-host-desktop-1280.jpg` (two-column desktop layout), `LIVE-02-live-player-390.jpg`, `CLM-01-claim-sheet-390.jpg`, `CLM-02-win-banner-other-player.jpg`, `CLM-05-results-with-banner-host.jpg`, `RES-01-results-host-360.jpg`, `RES-01-results-winner-390.jpg`, `RES-03-round2-live-player.jpg`.
- Setup and joining: `HOST-01-host-360.jpg`, `PRZ-01-prizes-360.jpg`, `PRZ-04-live-typed-amounts.jpg`, `JOIN-01-invite-360.jpg`, `JOIN-03-lobby-player-390.jpg`, `LOB-01-lobby-host-360.jpg`, `LOB-03-lobby-host-desktop.jpg`, `JOIN-02-not-found-360.jpg`, `JOIN-08-finished-visitor.jpg`, `WEB-11-404.jpg`.
- Stress: `RSP-02-long-names-26-prizes-live-320.jpg`, `RSP-02-long-names-results-320.jpg`, `HOST-02-long-names-invite-390.jpg`, `JOIN-09-lobby-100-players.jpg`, `PERF-05-live-100-players-360.jpg`, `RSP-01-live-player-landscape.jpg`, `ADS-01-lobby-with-ad-slot.jpg` (test build with ads on).

## 11. Every case and its result

| ID | Case | Result | What was observed |
|---|---|---|---|
| WEB-01 | Home page shows every section in the specified order with the specified copy | Failed → fixed (U-04) | 24 pieces of copy found in order; one h1; no console errors |
| WEB-02 | Every link on the home page goes somewhere real | Passed | 8 distinct links: / /#how /#features /join /host /privacy /terms /privacy#contact |
| WEB-03 | Mobile menu: opens, lists the three items (no "Questions"), closes on tap, Escape and navigation | Passed | Met the expected result. |
| WEB-04 | Desktop header: logo, How it works, Features, Join a game, Host a game; sticky | Passed | Met the expected result. |
| WEB-05 | Code box on the home page: valid code, lower case, pasted link, junk, too short, empty | Passed | 10 inputs normalised as expected; real code opened the invite; ZZ9 → not found → Try another code → /join; empty → /join |
| WEB-06 | Notify me: valid Indian mobile number is saved; invalid numbers get a friendly message | Failed → fixed (U-06, U-07) | Met the expected result. |
| WEB-07 | Notify me: the same number twice is fine; the hourly limit and a server failure show a clear message | Failed → fixed (U-08) | rate limits are switched off on this server: the limit message could not be shown · duplicate saves ok ×5; limit message not testable here; offline message shown |
| WEB-08 | FAQ accordion: first question open; opening another closes it; keyboard works | Passed | Met the expected result. |
| WEB-09 | Page titles, descriptions and link previews (Open Graph / Twitter) | Failed → fixed (U-10) | {"/":"Letsplaytambola — Housie night, sorted.","/host":"Host a game — Letsplaytambola","/host/prizes":"Ways to win — Letsplaytambola","/join":"Join a game — Letsplaytambola","/privacy":"Privacy Policy — Letsplaytambola","/terms":"Terms of Use — Letsplaytambola","/g/CODE":"Join the Tambola game — Letsplaytambola"} |
| WEB-10 | robots.txt and sitemap.xml | Passed | User-Agent: * \| Allow: / \| Disallow: /g/ \| Disallow: /api/ \| Disallow: /admin \|  \| Sitemap: https://letsplaytambola.com/sitemap.xml \|  |
| WEB-11 | Unknown addresses show the friendly 404 page with ways forward | Passed | Met the expected result. |
| WEB-12 | Privacy and Terms describe v2 (names, device token, 24 hours, Notify-me numbers) and nothing from v1 | Passed | privacy 10874 characters, terms 6413 characters |
| WEB-13 | Ads are off: no AdSense script, no ad slots, ads.txt harmless | Passed | no third-party requests at all on / and the lobby; /ads.txt → 404 |
| HOST-01 | Host setup screen matches the spec; Create looks disabled until a name is typed and explains itself | Passed | Met the expected result. |
| HOST-02 | Host and game names: 24/32-character limits, Hindi, emoji, right-to-left, and HTML are shown as plain text everywhere | Passed | 5 name pairs created and displayed verbatim; 0 scripts executed |
| HOST-03 | Game name chips fill the field; an empty game name becomes "Tambola Night" | Passed | game ATFJA created with a blank name → "Tambola Night" |
| HOST-04 | Ticket price: digits only, five digits at most; 0 and empty mean "no price" | Failed → fixed (U-12) | invite line for the top price: "1 person in · 6 ways to win · ₹99999 ticket, pay Priya directly" |
| HOST-05 | "Deal me a ticket" off: the host gets no ticket and cannot start alone | Passed | Met the expected result. |
| HOST-06 | The draft survives going to Ways to win and back, a refresh and back/forward; a new tab and a created game start clean | Passed | Met the expected result. |
| HOST-07 | Create on a slow connection: one game only, however often the button is tapped | Passed | Met the expected result. |
| HOST-08 | Create when the server fails or the phone is offline: a clear message, nothing lost, retry works | Passed | last toast region text: "" |
| HOST-09 | The round back button returns to where the person came from, or home on a direct visit | Passed | Met the expected result. |
| PRZ-01 | Ways to win: presets select exactly their patterns; all 26 patterns in six groups with one-line rules | Failed → fixed (U-04) | Met the expected result. |
| PRZ-02 | At least one way to win is needed — on the picker and on Create | Passed | Met the expected result. |
| PRZ-03 | All 26 ways selected: the game is created and every screen lists all 26 | Passed | Met the expected result. |
| PRZ-04 | Prize amounts: digits only up to 999999, totals shown, and a mix of typed and empty amounts is kept exactly | Failed → fixed (U-12) | amount typed for a deselected-then-reselected pattern came back as "250" |
| PRZ-05 | Opening /host/prizes directly (bookmark, refresh) still leads back to setup | Passed | Met the expected result. |
| JOIN-01 | Join with a code (/join): the code field cleans what is typed; "Find my game" opens the invite | Passed | Met the expected result. |
| JOIN-02 | Wrong, mistyped or hostile codes show "We can’t find game …" with a way back | Passed | Met the expected result. |
| JOIN-03 | Join by link: type a name → a ticket is dealt at once; the name is remembered for next time | Failed → fixed (U-14) | Met the expected result. |
| JOIN-04 | Two people with the same name: the second is shown as "Meera (2)" on every device | Passed | Met the expected result. |
| JOIN-05 | Same device comes back (refresh, re-opened link, second tab): same seat, same ticket | Passed | Met the expected result. |
| JOIN-06 | Clearing the browser’s storage makes a new identity (accepted: no cross-device recovery) | Passed | old seat stays (nobody can remove it) — recorded as a product question in the report |
| JOIN-07 | Joining while the game is live: straight to the ticket, with numbers already called available to dab | Passed | Met the expected result. |
| JOIN-08 | A visitor opening a finished game sees "This game has finished" and can join when the next round opens | Passed | Met the expected result. |
| JOIN-09 | A full game (100 people): the 101st sees "This game is full" and stays on the invite | Passed | Met the expected result. |
| JOIN-10 | Join on a slow or broken connection: one seat only; clear message on failure; retry works | Passed | Met the expected result. |
| JOIN-11 | A browser that blocks storage (private mode / strict in-app browser) can still host and join for that visit | Passed | Met the expected result. |
| LOB-01 | Host share card: WhatsApp opens wa.me with the invite text and link; Copy link copies it; no link text, no "Share another way" | Passed | wa.me text: "Join my Tambola game “Kitty & Co “Special” #1”! Tap the link, type your name and you’re in:\nhttp://localhost:8501/g/CGD75" |
| LOB-02 | Copy link when the browser refuses the clipboard: the link is shown so it can be copied by hand | Passed | Met the expected result. |
| LOB-03 | The lobby list updates live on every device as people join (no refresh) | Passed | time for a new joiner to show on the host: 1288, 1290, 1290 ms (polling every 1.5 s) |
| LOB-04 | Start the game: only the host can; one tap (or five) starts once; every device moves to the live screen | Passed | Met the expected result. |
| LOB-05 | Lobby survives refresh and the Back button; the title row shows code, copy and sound | Passed | Met the expected result. |
| LIVE-01 | Live layout: phone = caller, controls, ticket, ways to win, board, players; desktop = caller+controls+ticket+ways left, board+players right | Passed | Met the expected result. |
| LIVE-02 | Calling a number: the ball, count, callout, "Before" chips and board update on every device | Passed | called 30, 66, 11, 45, 25, 77, 60; both screens matched the server |
| LIVE-03 | Double tap / frantic tapping on "Call next number" calls one number per tap that the host could see | Passed | burst of 6 → 1 number; three human double-taps → 6 numbers (a second tap after the first answer is a real second call); 5 taps on a slow line → 1 |
| LIVE-04 | The voice caller says the right words; Sound off silences it at once and is remembered | Passed | 6 numbers checked on the host (single digit seen: true); e.g. "Make them wait! ... 5 and 8, 58"; player said 1 of them (it polls), always the newest |
| LIVE-05 | Dabbing: only called numbers; tap again to undo; the dab is kept on refresh | Passed | number 40: dab drawn 27 ms after the tap; undo and re-dab confirmed by the server; kept after refresh |
| LIVE-06 | Rapid tapping on the ticket ends in the right state; a dab the server refuses is rolled back with a message | Passed | Met the expected result. |
| LIVE-07 | Ticket cells are big enough to tap on small phones, and a tap near the edge never hits the neighbour | Failed → fixed (U-03) | smallest cell (w×h) by screen width: {"320":"30.7×46.0","360":"35.1×46.0","390":"38.4×46.0","412":"40.9×47.0"}; 4 edge taps × every called number × 4 widths, none hit a neighbour |
| LIVE-08 | The 90th number ends the round for everyone; the call button cannot go past 90 | Passed | Met the expected result. |
| LIVE-09 | A phone that sleeps, loses signal or switches apps catches up when it comes back | Passed | caught up 26 ms after the network returned and 27 ms after the tab was shown again |
| LIVE-10 | Polling fallback (no realtime): one request about every 1.5 s, nothing piles up, updates arrive within ~2 s | Passed | 7 polls in 12 s; a called number reached the player after 790, 1292, 1793, 1294, 793, 1303, 1290, 183 ms (average 1092 ms) |
| LIVE-11 | Ways to win and Playing show prize money: automatic split at start, a late joiner raises only open prizes | Passed | start 20/30/30/30/30/60 → after late joiner 20/40/40/40/40/120 |
| LIVE-12 | One player wins several prizes: all are listed with the total | Passed | Met the expected result. |
| LIVE-13 | iPhone Safari path for the voice: speech is unlocked inside the Join / Start / Sound-on taps | Passed | unlock utterances: 1 in Join, 1 in Sound on; first number then spoken: "Key of the door! ... 2 and 1, 21" |
| AUTO-01 | Auto call: waits one full interval after being switched on, then a number every 6 seconds; Stop stops | Failed → fixed (U-02) | switched on 8 s after the last number: numbers at 6137, 12203, 18263 ms; none in 9 s after Stop |
| AUTO-02 | Two (or three) host tabs with auto-call on still call at normal speed | Failed → fixed (U-01) | three host tabs: numbers at 4863, 10927, 17032, 22725 ms (gaps 6064, 6105, 5693); simultaneous manual taps → 1 number |
| AUTO-03 | A manual call while auto is on does not cause a double: the next automatic number waits a full interval | Passed | next automatic number 6100 ms after the manual call |
| AUTO-04 | Host goes offline with auto-call on: calling pauses; it resumes by itself when the connection returns | Passed | offline 15 s: 0 numbers; after reconnecting numbers at 1220, 7311, 13054 ms |
| AUTO-05 | Host reloads or closes the page with auto-call on: calling pauses while they are away and carries on when they return | Passed | reload → next number after 6059 ms; tab closed 12 s → 0 numbers; reopened → next after 6131 ms |
| AUTO-06 | Host tab in the background (visibility "hidden") with auto-call on | Passed | hidden for 14 s: 2 numbers at 6075, 12215 ms — calling continues while the browser keeps the page running |
| AUTO-07 | Auto-call stops by itself when the round ends (last prize won) | Passed | Met the expected result. |
| CLM-01 | Claim sheet: lists the open prizes; a claim that is not complete gets the gentle message and nothing else happens | Failed → fixed (U-04) | Met the expected result. |
| CLM-02 | A valid claim: banner on every device for 5 seconds, voice line, winner shown in Ways to win and Playing, nobody is moved away | Passed | banner appeared after {"winner":30,"host":848,"other":885} ms and left after {"winner":5018,"host":5613,"other":5904} ms; Top Line amount ₹40 |
| CLM-03 | Two phones claim the same prize at the same moment through the screen: one banner, one winner, the other is told who won | Passed | both tapped together; Asha won |
| CLM-04 | Dabs of numbers that were never called cannot help a claim; a host without a ticket has nothing to claim | Passed | Met the expected result. |
| CLM-05 | The last prize: the banner carries over to the results screen on every device | Passed | Met the expected result. |
| RES-01 | Results screen: headline, count line in normal words, payment note, winners with amounts, the right buttons for host and players | Failed → fixed (U-05) | Met the expected result. |
| RES-02 | Results with fewer than 90 numbers: the count is the real one, in plain words | Failed → fixed (U-05) | line read: "87 of 90 numbers called." |
| RES-03 | Play again: everyone returns to the lobby with a fresh ticket; nothing from the last round is replayed | Passed | Met the expected result. |
| RES-04 | Play again tapped many times (or on a slow line) starts ONE new round | Passed | Met the expected result. |
| RES-05 | Results survive a refresh; "Host my own game" starts a separate new game and the old one is still there | Passed | Met the expected result. |
| API-01 | Create a game: 201, a 5-character code from the allowed alphabet, never cached | Passed | code 9U6SC, cache-control "no-store, max-age=0" |
| API-02 | Create and act need a device token that is a UUID | Passed | Met the expected result. |
| API-03 | Create validates every field (name, game name, price, toggle, prizes, amounts) | Passed | 20 bad bodies refused with 400 + copy; 7 boundary bodies accepted |
| API-04 | Malformed, non-object and oversized bodies are refused without a server error | Passed | 13 bad bodies, all answered 400 bad_request, including a 2 MB body |
| API-05 | A visitor (not joined, or no token) gets the invite card only | Passed | visitor view keys: code, hostName, name, now, playerCount, price, prizes, round, status, version, you |
| API-06 | Game codes: case-insensitive; unknown, malformed and hostile codes answer 404 not_found | Passed | Met the expected result. |
| API-07 | Unknown actions and wrong HTTP methods are refused | Passed | Met the expected result. |
| API-08 | Only the host can start, call numbers, switch auto-call and start a new round | Passed | 4 host-only actions × 2 non-hosts × 3 stages: all 403, version never moved |
| API-09 | Actions at the wrong time are refused with 409 and friendly copy | Passed | Met the expected result. |
| API-10 | Dabbing: only called numbers on your own ticket; undo; safe to repeat; private | Passed | number 5: dab/undo/dab ok; version stayed 9 |
| API-11 | No response ever contains another player’s ticket or dabs, a device token, a token hash or the round history | Passed | 1439 responses scanned across 5 devices and 2 rounds; 8 tickets, 5 tokens and their hashes never leaked |
| API-12 | Claims are checked on the server: not yet → gentle refusal; valid → winner; already won → refusal | Passed | top line 4,11,36,74,81: refused at 0/5 and 4/5 dabs and when called-but-undabbed; accepted at 5/5; repeat claims "already won" |
| API-13 | Two devices claiming the same prize at the same instant: exactly one wins | Passed | 8 simultaneous pairs: always one winner (first request won 8×, second 0×) |
| API-14 | Replaying requests is harmless (join twice, draw with the same "after", start twice) | Failed → fixed (U-01) | join statuses 200/200/200/200/200; 30 concurrent draws produced exactly 5 numbers |
| API-15 | Rate limits answer 429 with friendly copy (create, join, notify, view) and recover per device | Passed | limits hit at create 13, join 31, notify 6 (device) and 21 (address), view 241; probe status 400 |
| API-16 | A game holds 100 players; the 101st is told it is full | Passed | 100 players; member view is 12.7 KB |
| API-17 | Duplicate names get "(2)", "(3)" — ignoring case, counting the host; unusual names are kept as typed | Failed → fixed (U-09) | duplicates numbered; Hindi, emoji, Arabic, HTML and SQL-looking names stored as plain text; blank/invisible names refused |
| API-18 | Prize amounts: ticket money is split at start; a late joiner raises only open prizes; typed amounts never change | Passed | A: start {"early5":30,"top":60,"middle":60,"bottom":60,"corners":60,"full":130} after late joiner; early5 stayed ₹30 |
| API-19 | The round ends when every prize is won, or when the 90th number is called (auto-call switches off) | Passed | first ten numbers of the 90: 43, 66, 34, 36, 56, 3, 38, 45, 31, 12 |
| API-20 | Play again: same code and people, round +1, fresh tickets, dabs and winners cleared, joining open again | Passed | round 2: fresh valid tickets for both, winners and dabs cleared, same pids |
| API-21 | All 26 ways to win: refused until the pattern is complete, accepted the moment it is (independent check) | Passed | 148 claims compared with the independent rule check; won after N numbers: {"early5":20,"early7":31,"laddoo":31,"early9":49,"bottom":49,"dinner":49,"night":49,"temp":55,"railway":77,"kings":77,"diamond":77,"middle":78,"pyramid":78,"one24":78,"breakfast":78,"bamboo":83,"corners":83,"star":83,"six":83,"queens":83,"top":85,"rpyramid":85,"lunch":85,"day":85,"full":85}; left open: lucky3 |
| API-22 | Lucky Three (3 of the first 5 numbers called) with 100 tickets in play | Passed | first five 79,32,49,24,50; player #23 held 3 of them and won; 4 of 100 tickets qualified |
| API-23 | A host without a ticket can run the game but cannot dab or claim | Passed | Met the expected result. |
| API-24 | Notify me accepts Indian mobile numbers only | Failed → fixed (U-06, U-07) | 6 valid forms saved; 12 invalid forms refused with the friendly message |
| API-25 | Security headers on pages and API; no framework banner | Failed → fixed (U-11) | 10 addresses checked: frame, nosniff, referrer headers present; no X-Powered-By |
| API-26 | No open redirect and no Host-header poisoning | Passed | 6 redirect probes and 5 forged-host probes: nothing reflected |
| API-27 | 30 people tapping the invite link in the same second all get a seat | Passed | 30 simultaneous joins in 102 ms; statuses: 200×30 |
| API-28 | What happens to a prize that only the 90th number completes (and to slow claimers) | Open | ticket had all 15 numbers dabbed before the end; claim after the 90th call → 409 "This game has finished" · OPEN: D-1: once the 90th number is called the round ends at once — a prize completed by that number, or one a slow player has not claimed yet, can never be claimed. Matches the written spec; needs a product decision (e.g. keep claims open until the host taps "Finish") |
| SEC-01 | Per-address rate limits rely on the X-Forwarded-For header | Open | 25 of 25 requests accepted with rotating X-Forwarded-For · OPEN: per-address rate limits can be bypassed by sending a made-up X-Forwarded-For header when the app is NOT behind a proxy that overwrites it (fine on Vercel; matters only if self-hosted). Per-device limits are trivially bypassed too (a new random token) — rate limiting is a speed bump, as the code comments say |
| SEC-02 | Game codes cannot be guessed in bulk: what a stranger learns from a code | Passed | 300 guesses from one device: {"404":240,"429":60} (blocked after 240 in a minute); 0 real games found; 31^5 = 28629151 codes |
| ADS-01 | With AdSense switched on (test ids), ad slots exist only in the lobby and on results — never on the live game or elsewhere | Passed | {"lobby (host)":1,"live (host)":0,"results (host)":1,"lobby (player)":1,"live (player)":0,"results (player)":1,"home (visitor)":0,"host (visitor)":0,"prizes (visitor)":0,"join (visitor)":0,"invite (visitor)":0,"finished (visitor)":0,"privacy (visitor)":0} |
| RSP-01 | No sideways scrolling and nothing cut off on any screen at 320–1920px and on a phone held sideways | Passed | 176 screen × width combinations checked, no sideways overflow |
| RSP-02 | Worst case content: 24-letter names, 32-letter game name, all 26 prizes, wide letters — at 320px and 360px | Passed | Met the expected result. |
| RSP-03 | Tap targets are at least 44px on a phone (ticket cells: 44px tall) on every screen | Failed → fixed (U-03, U-13) | 16 screens + claim sheet measured at 360px |
| RSP-04 | Text is at least 15px (small-caps labels 12px) and every input is 16px or more (no zoom jump on iPhone) | Open | OPEN: 12px text in the app-store badges on the home page — /: "Coming soon on" 12px \| "Coming soon on the" 12px |
| RSP-05 | Typing with the phone keyboard up: the field stays visible and the sticky button does not sit on top of it | Passed | Met the expected result. |
| RSP-06 | Phones with a home bar / notch: sticky bars and the bottom sheet leave room (safe-area), and screens use the dynamic viewport height | Passed | env(safe-area-inset-bottom) appears 4× in the CSS of /host |
| RSP-07 | Phone held sideways (760×360): the game is playable — claim sheet scrolls, header does not eat the screen | Passed | landscape: header 69.5px; sheet 306px tall with 25 options; last option "Full House" tapped |
| A11Y-01 | A whole game with the keyboard only: host, join, start, call, dab, claim, play again | Passed | focus order on /host: Let’s playTAMB90LA → How it works → Features → Join a game → Host a game → Back → hostName → gameName → Kitty Party → Diwali Night → Family Sunday → Teej Special → price → Deal me a ticketPlay w → Ways to winClassic · 6 → Create game & get link |
| A11Y-02 | Keyboard focus is always visible | Passed | 268 focus stops checked across 11 screens |
| A11Y-03 | Structure for screen readers: one h1, ordered headings, landmarks, named controls, live regions | Passed | Met the expected result. |
| A11Y-04 | What a screen reader hears on the ticket, the board and the ball | Passed | Met the expected result. |
| A11Y-05 | Text contrast on plum, marigold, pink, paper and green meets WCAG AA | Open | OPEN: contrast below WCAG AA on /: "COMING SOON" 3.23:1 (12px/500) · OPEN: contrast below WCAG AA on /host: "Create game & get link" 2.64:1 (21px/800) · OPEN: contrast below WCAG AA on invite: "Join game" 2.64:1 (21px/800) · OPEN: contrast below WCAG AA on lobby (host): "Share on WhatsApp" 2.69:1 (19px/800) |
| A11Y-06 | Reduced motion is respected | Passed | Met the expected result. |
| A11Y-07 | axe-core automated accessibility scan of every screen (WCAG 2.1 A + AA rules) | Open | 16 screens scanned, up to 47 rules applicable per screen; violations: color-contrast (serious) · OPEN: axe color-contrast (serious): /: <span >9/15 · NEEDS 6</span> ; <span style="transform:rotate(-1deg)">23</span> ; <span style="transform:rotate(0deg)">12</span> (+62 more) \|\| /host: <button type="submit" style="--btn-h:62px">Create game &amp; get link</button> \|\| invite: <button type="submit" style="--btn-h: 64px;"> |
| PERF-01 | Download size of each page on a cold visit (compressed) | Passed | KB over the network (total / js / css / fonts / html): / 278/163/12/79/19 · /host 294/165/12/95/6 · /host/prizes 294/165/12/95/7 · /join 284/172/12/79/5 · /g/CODE 326/188/12/79/10 · /privacy 288/168/12/79/14 · /terms 284/168/12/79/10; font cache-control: public, max-age=31536000, immutable |
| PERF-02 | Lighthouse (mobile) on /, /host and /join | Open | home: perf 97, a11y 96, best 100, seo 100, LCP 1.1 s, TBT 208 ms, CLS 0.000 \| host: perf 100, a11y 96, best 100, seo 100, LCP 0.9 s, TBT 60 ms, CLS 0.000 \| join: perf 98, a11y 100, best 100, seo 100, LCP 0.9 s, TBT 173 ms, CLS 0.000 · OPEN: Lighthouse accessibility on home: color-contrast (the contrast items reported as U-13/U-14/U-15) · OPEN: Lighthouse accessibility on host: color-contrast (the contrast items repor |
| PERF-03 | A 30-device game with auto-call for 60 seconds: response times and errors | Passed | 1198 GETs p50 4 ms, p95 13 ms, max 26 ms; 159 POSTs p50 4 ms, p95 7 ms, max 24 ms; 15 numbers called, 1 prizes won; largest view 6.2 KB; errors: 0 |
| PERF-04 | Memory store with 200 games at once (10 players each, in play) | Passed | 200 games × 10 players × 30 numbers built in 16.3 s (~503 requests/s); view p50 2.5 ms, max 7.8 ms (baseline avg 2.1 ms); server memory null → null MB |
| PERF-05 | A full house of 100 players on screen: the live game on a phone stays usable | Passed | live screen ready in 275 ms; dab painted in 9 ms; next number shown after 1933 ms; page is 8136px tall (the 100-name list is long but below the ticket and board); view 12.8 KB |
| UNIT-01 | Tickets: 2,000 generated tickets obey every rule | Passed | Met the expected result. |
| UNIT-02 | The 26 pattern checks, each with a winning and a losing ticket, and the seed data | Passed | Met the expected result. |
| UNIT-03 | Engine: create, join, start, draw, auto, mark, claim, new round, permissions, views | Passed | Met the expected result. |
| UNIT-04 | Prize money: automatic split, late joiner, amounts typed by the host | Passed | Met the expected result. |
| UNIT-05 | Server: compare-and-swap commits, retries, simultaneous claims, rate-limit windows, token hashing | Passed | Met the expected result. |
| UNIT-06 | Expired game: unusable 24 hours after the last activity; tickets and dabs erased | Passed | Met the expected result. |
| UNIT-07 | Browser data layer: optimistic dabs, rollback, never going back to an older version, action queue | Passed | Met the expected result. |
| UNIT-08 | Share helpers: link, WhatsApp text, code from a pasted link | Passed | Met the expected result. |
| UNIT-09 | Regression U-01: draw with "after" calls one number per step | Failed → fixed | Met the expected result. |
| UNIT-10 | Regression U-02: auto-call delay | Failed → fixed | Met the expected result. |
| UNIT-11 | Regression U-09: names with invisible or text-flipping characters | Failed → fixed | Met the expected result. |
| UNIT-12 | Regression U-06/U-07: Indian mobile numbers | Failed → fixed | Met the expected result. |
| UNIT-13 | Voice text for all 90 numbers against the callout seed data | Passed | Met the expected result. |
| UNIT-14 | Regression U-12: pasted prices with paise | Failed → fixed | Met the expected result. |
| UNIT-15 | Regression U-04: Full House rule text | Failed → fixed | Met the expected result. |
| NR-01 | Real Android phones (Chrome and the WhatsApp in-app browser): whole game, keyboard, back button, share sheet | Blocked | No physical devices in the test environment. Covered as far as possible by emulated Android Chrome (360 and 412 px, touch, Android user agent). |
| NR-02 | Real iPhone (Safari): the voice actually speaking after Join/Start; the notch and home bar | Blocked | No iPhone and no WebKit engine available. The code path iOS needs (speech unlocked inside the tap) is verified in LIVE-13 and LIVE-04; whether the phone then speaks must be heard on a real iPhone. |
| NR-03 | Real WhatsApp: tapping "Share on WhatsApp" opens the chat picker; the link preview shows the picture and title | Blocked | WhatsApp is not available here. Verified instead: the exact wa.me address and text (LOB-01) and the preview tags and picture of the game page (WEB-09). |
| NR-04 | Supabase store and Realtime ping (instant updates, 8-second safety polling, several server instances) | Blocked | No Supabase project in the test environment; everything was run on the in-memory store with 1.5 s polling. The database is covered by the other engineer’s SQL tests and the later admin pass. |
| NR-05 | The deployed site on Vercel: headers at the CDN, rate limits behind Vercel’s proxy, cold starts, share links on the real domain | Blocked | No deployment available. Headers, links and limits were verified on a local production build (next start). |
| NR-06 | Safari/WebKit and Firefox engines | Not run | Only Chromium is installed in the test environment and the brief forbids downloading browsers. iPhone and Android were emulated on Chromium (user agent, screen, touch). |
| NR-07 | Slow 3G / patchy mobile data in the field | Not run | Simulated only: requests delayed by 1.5–2.5 s, failed, and the device taken offline and back (HOST-07/08, JOIN-10, LIVE-06/09, AUTO-04). Real radio conditions were not available. |
| NR-08 | Real screen readers (TalkBack, VoiceOver) reading a live game | Blocked | Not available. Roles, names and live regions were verified in the page (A11Y-03, A11Y-04, A11Y-07). |
| NR-09 | Host’s phone screen locks or the browser goes to the background on a real phone with auto-call on | Blocked | A headless browser does not freeze background pages the way phones do. Verified instead: closing/reloading/offline (AUTO-04, AUTO-05) and a hidden tab that keeps running (AUTO-06). |
| NR-10 | Android "Font size: Largest" system setting | Not run | Cannot be emulated. Page zoom to 200 % was covered by testing at 640 px and 320 px widths (RSP-01), and pinch-zoom is not blocked (WEB-09). |
| NR-11 | Names and game names shown in the admin panel (HTML injection there) | Not run | The admin side is being rebuilt and is tested in the next pass. On the player side all such names render as plain text (HOST-02, API-17). |
