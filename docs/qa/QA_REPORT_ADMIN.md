# QA report — admin panel and analytics

21 November 2026 · branch `insights-and-qa` · tested by a QA lead who did not write the code.
Test plan: `docs/qa/TEST_PLAN_ADMIN.md` · every result: `docs/qa/results-admin.json` · screenshots: `docs/qa/evidence-admin/`.
The player-facing side has its own report (`docs/qa/QA_REPORT_USER.md`).

## Verdict: ready, with caveats

The admin panel can go live. The numbers it shows are right, nobody but the signed-in operator can reach it, nothing private
leaks to players, hostile names cannot attack the operator, and "Erase a device" and the 24-hour / 90-day clean-up do what
the documents say.

The caveats:

1. **It has never met the real services.** Everything was tested on this computer: the in-memory store, a local PostgreSQL
   and a stand-in for Supabase. A short check on the real site after deployment is still needed (list under "Not tested here").
2. **The Privacy Policy leaves out a few things that are stored** (latitude / longitude, postal code, the browser's full
   identification text). This is a wording decision for the owner — see "Decisions needed", D1. I would settle it before launch.
3. **Three protections only work per server.** The sign-in speed bump, sign-out and the event rate limit live in one server's
   memory. On Vercel there can be several servers, so they slow an attacker down rather than stop one. A long random
   password is what protects the panel.

Seven bugs were found; all seven are fixed and have a regression test. None was a wrong number or a data leak.

## What was tested, and how

- **Sign-in and sessions** — wrong details, upper-case email, very long and hostile input, the 6th attempt, expired and
  forged cookies, sign-out, a changed password, the panel switched off. Every admin page (15) and every admin API route (10)
  was found by reading the source folders, not from a list, and each was tried without signing in.
- **The numbers** — a dataset with known answers was loaded into a real running server: 8 hand-designed games around
  India-midnight and UTC-midnight, plus 320 generated games and about 6,600 events over 85 days. I wrote the expected values
  down first, then compared.
- **Capture** — `POST /api/t` was sent oversized, malformed, spoofed and repeated; a real browser was driven through the
  site; the tracker was blocked the way an ad blocker does.
- **Privacy and security** — every public answer was searched for IP addresses, places, device details, tokens and other
  players' tickets; `<script>`, `<img onerror>`, `javascript:` and spreadsheet-formula names were placed in every text field;
  "Erase a device" was run and every page and export re-read.
- **Database** — the three SQL files on a fresh PostgreSQL 16, each run a second time, and every table and function
  checked for "server only" by reading the database's own catalogue.
- **Look and feel** — 14 pages at 1920, 1440, 1280, 1024, 768, 390 and 360 px wide; keyboard only; printing to PDF; a forced
  failure of the data layer; timings.

For the checks that matter most I broke the behaviour once on purpose to confirm the check goes red (table in the test plan).

## Counts

| | Cases |
|---|---|
| **Total** | **132** |
| Passed | 118 |
| Failed, then fixed and re-run | 7 |
| Failed, still open | 2 |
| Blocked (needs the live services) | 3 |
| Not run | 2 |

- **Open:** small tap targets inside table rows on phones (UX-08), and the Privacy Policy wording (PRIV-01).
- **Not run:** colour contrast by measurement (UX-09) — my tool could not read the site's colour format reliably, so I only
  looked at the screenshots; the loading placeholder (UX-13) — pages answer too fast locally to see it.

Automated suites at the end of the work, all passing: 102 end-to-end admin cases, 406 unit tests (13 new), the SQL suite
(11 new checks plus a re-apply step), type check, lint, production build, and the 93-step API smoke test.

## Bugs

| ID | Severity | Area | What happened | How to reproduce | Status | Fix | Regression test |
|---|---|---|---|---|---|---|---|
| A01 | S3 | Sign-out | Signing out only cleared the cookie in the browser. A copy of the cookie kept working for up to 12 hours. | Sign in, copy the `lpt_admin` cookie, sign out, call `/api/admin/games` with the copy → 200 | Fixed | Sign-out now ends the session on the server too (`src/server/admin/auth.ts`, logout route). Per server — see Risks. | AUTH-07; `qa-admin.test.ts` |
| A02 | S3 | Error state | When the data could not be read, the whole screen became a bare "This page couldn't load — ERROR 4197202511": no menu, no explanation. | Make any analytics read fail and open any admin page | Fixed | New `src/app/admin/(panel)/error.tsx`: the message appears inside the admin frame with **Try again**; other sections stay usable. | UX-01 |
| A03 | S4 | Sign-in page | Opening `/admin/login` while signed in answered 200 and relied on the page redirecting itself. | Signed in, request `/admin/login` | Fixed | A real redirect to `/admin` (`src/proxy.ts`). | AUTH-14, UX-06 |
| A04 | S4 | Geography | Countries outside a built-in list of 33 showed as a code ("BR"). | A visitor from Brazil → Geography | Fixed | Any country is now named ("Brazil") (`src/server/client-info.ts`). | `qa-admin.test.ts` |
| A05 | S4 | Capture | The 16 KB limit of `/api/t` counted characters, not bytes; a body sent in pieces with accented text could be up to about three times larger. | Send 8,400 × "é" without a Content-Length | Fixed | Counts bytes (`src/app/api/t/route.ts`). | CAP-02 |
| A06 | S4 | Geography | "1 visitors". | A place with one visitor | Fixed | Singular / plural. | — (wording) |
| A07 | S4 | Overview | With "Compare to previous period" on, the Notify-me tile alone showed no change. | Overview → switch compare on | Fixed | The tile shows its change like the others. | Seen in the page dump (DATA-04) |

Severity: S1 = data loss or a leak · S2 = wrong numbers or a blocked task · S3 = a real weakness with a workaround · S4 = cosmetic.

## Are the numbers right?

Yes, for everything below. Each figure was checked against at least one independent source.

- **Written down by hand first, then matched on the page:** all Overview game tiles for 7 days, Today and Yesterday; the
  compare percentages (+600%, +550%, −50%, "new" when the earlier period was zero); visitors, sessions, page views, new and
  returning devices and average time on site for 7 days; the plays status and quick-filter totals; countries and Indian
  states; both funnels step by step; every Engagement tile and histogram for 7 days; the two newest retention cohorts.
- **Recomputed by my own code from the raw rows, for Today / Yesterday / 7 / 30 / 90 days:** every Overview tile; the
  games-per-day and visitors-per-day tables day by day; device type, operating system, browser and in-app tables; the
  sources table and WhatsApp share; both funnels; players-per-game histogram, median and replay rate; retention after day
  1 / 7 / 30, hosts and returning hosts.
- **Page = export = raw rows:** plays (total, every status, both quick filters, and the sum of players equals the Overview),
  players (every device's sessions, games hosted and joined), events (also filtered by event, device and game), Notify-me.
- **Day boundaries:** games and events at 23:59 and 00:00 India time, and either side of UTC midnight, land on the right
  India day; a session that crosses midnight counts in both days.
- **Database twin:** the SQL versions of the aggregates give the same answers as the TypeScript ones on a seeded dataset
  (214 comparisons, existing test, re-run).

Two things to know when reading the pages (correct, but easy to misread):

- Geography counts **players by the day they joined**; the Overview counts them **by the day the game was created**. A join
  just after midnight into a game created just before it shows in one and not the other (14 against 13 in my dataset).
- The server does not remove duplicate events. The site's own tracker never re-sends, so this does not happen in practice.

## Not tested here

- **A real Supabase project** — its API layer, the real public key being refused, the hourly clean-up schedule.
- **Real Vercel headers** — the visitor's address and place were simulated. On Vercel they cannot be faked by a visitor; on
  another host they could.
- **Real traffic and real phones** — WhatsApp's built-in browser, Samsung Internet and iPad were tested as identification
  strings, not as devices.
- **Retention in real time** — 24 hours and 90 days were tested with a moved clock and back-dated rows.

Suggested check after deployment (10 minutes): sign in; open a game from a phone on mobile data; see the visit, city and
device appear; export one CSV; erase that device; run `select public.purge_expired_games();` once in Supabase.

## Risks

1. **Per-server protections on Vercel** (caveat 3). To end every session everywhere for certain, change `ADMIN_PASSWORD` or
   `ADMIN_SESSION_SECRET` and redeploy.
2. **The short device id can collide.** A device is shown and erased by the first 8 characters of its code. Two devices can
   share them: unlikely below about 10,000 devices in 90 days (roughly 1 in 100), likely beyond 65,000. When it happens the
   device page shows one of the two and "Erase" removes both. Tested and confirmed (ERASE-06).
3. **Exports hold personal data** — names, phone numbers, IP addresses, places. They are safe to open in a spreadsheet, but
   the files themselves must be kept private.
4. **Erasing a device that is in a game still being played** renames that player to "Erased player" for the others at once,
   and keeps the seat until the game expires; a second erase 24 hours later cuts the last link. The panel says so.
5. **Speed is unmeasured on the real database.** In memory every page answered in under 70 ms with 328 games and 6,641
   events. On Supabase it depends on SQL that could not be timed here.

## Recommendations

| | Priority | What |
|---|---|---|
| R1 | Before launch | Decide the Privacy Policy wording (D1). |
| R2 | Before launch | Do the 10-minute live check above. |
| R3 | Soon | Use 12 characters for the device id (D2). |
| R4 | Soon | Schedule the hourly clean-up in Supabase (`supabase/README.md`, step 5) so retention does not depend on traffic. |
| R5 | Later | On phones, make the copy buttons and links inside table rows at least 24 px tall. |
| R6 | Later | Sort the Technology and Acquisition tables by sessions (the first number shown) instead of by visitors. |
| R7 | Later | At 1440 px the Plays table needs a sideways scroll with its default columns; narrow the Game column or hide one column by default. |
| R8 | Later | Add `npm run e2e:admin` (`bash e2e/admin/run.sh`) to `package.json` and to whatever runs before a release. |

## Decisions needed

- **D1 — Privacy Policy.** The site stores latitude / longitude and postal code (derived from the IP address by the host)
  and the browser's full identification text. The policy says "city, region and country" and "browser and device details",
  and says Supabase stores "game data and Notify-me numbers" although it also holds the usage records. Either name these in
  the policy, or stop storing latitude / longitude and postal code — no admin page shows them. I did not change legal text.
- **D2 — Device id length.** 8 characters (today) or 12? Longer removes the collision risk; old links to device pages would change.
- **D3 — Notify-me numbers and erasure.** A phone number is not linked to a device, so "Erase a device" does not remove it;
  today it is deleted by hand in Supabase (`docs/ADMIN.md`). Is that acceptable, or should the panel get a delete button?
- **D4 — Sign-out on several servers.** Accept "best effort" (today), or store signed-out sessions in the database so
  sign-out is immediate everywhere?
- **D5 — Players by join day or by game day** (see "Are the numbers right?"): keep both and explain it on the page, or use one rule?

## Files

**Added**
- `docs/qa/TEST_PLAN_ADMIN.md`, `docs/qa/QA_REPORT_ADMIN.md`, `docs/qa/results-admin.json`, `docs/qa/evidence-admin/` (30 screenshots)
- `e2e/admin/` — the end-to-end suite with its own small runner (`run.sh`; why it is separate from `e2e/run.mjs` is in its `README.md`)
- `src/server/admin/__tests__/qa-admin.test.ts` — 13 tests
- `supabase/tests/qa_admin.sql` — lock-down read from the database catalogue
- `src/app/admin/(panel)/error.tsx` — the error message inside the admin frame

**Changed**
- `src/server/admin/auth.ts`, `src/app/api/admin/logout/route.ts`, `src/proxy.ts` — A01, A03
- `src/app/api/t/route.ts` — A05
- `src/server/client-info.ts` — A04
- `src/app/admin/(panel)/geography/page.tsx`, `src/app/admin/(panel)/page.tsx` — A06, A07
- `supabase/tests/run.sh` — re-apply step and the new SQL file
- `docs/ADMIN.md` — sign-out and the error message
- `eslint.config.mjs` (allows the suite's CommonJS files), `.gitignore` (the suite's output folder)
