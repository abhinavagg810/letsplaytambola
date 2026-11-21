# Test plan — admin panel and analytics capture

Scope: `/admin/**`, `/api/admin/**`, the capture pipeline (`POST /api/t`, `src/lib/track.ts`, IP / place / device parsing,
the five analytics tables in both stores), retention and "Erase a device", the SQL migrations, and the privacy text against
what is really stored. The player-facing side has its own plan: `docs/qa/TEST_PLAN.md`.

Results of the last run: `docs/qa/results-admin.json` · report: `docs/qa/QA_REPORT_ADMIN.md`.

## How the cases are run

| Layer | Command | What it uses |
|---|---|---|
| End to end (102 cases) | `npm run build && bash e2e/admin/run.sh` | Six `next start` servers on ports 8600–8605 in memory mode, Playwright (Chromium) and plain `fetch` |
| Unit / store (13 tests) | `npm test` → `src/server/admin/__tests__/qa-admin.test.ts` | The memory store with a shifted clock |
| Database (11 new checks + re-apply step) | `npm run test:sql` → `supabase/tests/qa_admin.sql`, `supabase/tests/run.sh` | Local PostgreSQL 16 |
| Review | — | Screenshots at seven widths, the Privacy Policy, `docs/ADMIN.md`, `docs/API.md` |

Only placeholder credentials are used: `admin@example.com` / `test-password-123`.

**Priorities** P0 = security, privacy or a wrong headline number · P1 = wrong data or lost capture · P2 = a page or filter
misbehaves · P3 = polish. **Types** are in the "How" column (e2e, Vitest, SQL, review).

## Seeded dataset (known numbers)

`e2e/admin/seed-data.cjs` builds the exact rows of the in-memory store and is loaded into a real server with
`node --require` (no application code is changed for it). Times are relative to "now", so the dataset always sits in the
last 90 days.

**Core — designed by hand; the expected values below were written down before the admin was opened.**

| Code | What | Created (IST) | Players | Status now |
|---|---|---|---|---|
| DWAAA | "Diwali Night", ₹50 ticket, Top Line ₹60 + Full House ₹140, 30 minutes | yesterday 21:00 | 4 | Finished |
| MXRND | "Multi Round", typed prizes ₹100 + ₹500, **two rounds** (20 and 10 minutes), a player named `<script>…</script>` | 3 days ago 10:00 | 3 | Finished (expired) |
| ABBYA | game named `=HYPERLINK("http://evil.example","x")`, host does not play, ₹20 | today 09:00 | 0 | Lobby, abandoned |
| NWNWQ | "Live Now" | 20 minutes ago | 2 | Live |
| EXPRD | created **23:59 IST**, started **00:01 IST** next day, never finished, ₹10 | 2 days ago 23:59 | 2 | Expired |
| UTCMD | created **05:29 IST = 23:59 UTC** | yesterday 05:29 | 1 | Expired (lobby) |
| ZZFST | created at **00:00:00.000 IST** on the first day of "7 days" | 6 days ago 00:00 | 1 | Expired (lobby) |
| ZZPRV | created at **23:59:59 IST** the day before — outside "7 days" | 7 days ago 23:59:59 | 2 | Finished |

Seven devices: Priya (Mumbai, Android, campaign link, two IP addresses), Meera (Delhi, iPhone inside WhatsApp, IPv6, **two
names**), Ravi (Pune, Samsung Internet), Sunita (**São Paulo**, Windows), Asha (**no place**, iPad), a hostile device (city
`"><img src=x onerror=…>`, source `=cmd|'/C calc'!A0`, referrer `javascript:alert(1)`), George (London, **hosts, never
plays**); one visitor with no device id whose session crosses India midnight; two devices whose 8-character ids collide.
143 usage events. Four Notify-me numbers.

Hand-computed expectations (`EXPECT` in the file): **7 days** — 7 games created, 4 started, 2 finished, completion 50%,
13 players, 7 devices that played, 1.9 players per game, average game length 20m 00s over 3 finished rounds, prize money
₹1,420, ticket money ₹220, 3 priced games, 3 Notify-me sign-ups; status Lobby 1 / Live 1 / Finished 2 / Expired 3; 3 priced,
3 abandoned. **Yesterday** — 2 / 1 / 1, 5 players. **Today** — 2 / 1 / 0, 2 players. **Previous 7 days** — 1 game, 2 players
(so +600% and +550%). Visitors for 7 days, counted by hand from the event list: 8 visitors, 17 sessions, 31 page views,
6 new + 1 returning device, 30m 24s average time on site (5 measured sessions).

**Bulk — generated with a fixed seed**: 320 games on days −15 … −85, 62 devices, about 6,500 events, 40 more Notify-me
numbers; names with Hindi, Chinese, accents, emoji, quotes, commas, 24 / 32 wide letters, and leading `=` `+` `-` `@`.
For these the expected numbers are recomputed by `verify-data.cjs` with code written independently of the application.

## Catalogue

A case with a range suffix (`-today`, `-yesterday`, `-7d`, `-30d`, `-90d`) is the same check on that date range.
Steps and expected results are spelled out in the title; the script named under "How" is the exact procedure.

| ID | Area | Title — what is done and what must happen | Priority | How (type) | Last result |
|---|---|---|---|---|---|
| DATA-01 | Data correctness | Overview game KPIs for 7 days match the hand-computed expectations | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-02 | Data correctness | Overview for Today and Yesterday match the hand-computed expectations (IST day boundaries: 23:59 / 00:00 / 05:29) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-03-7d | Data correctness | Overview (7d): every game and visitor tile equals an independent recomputation from the raw rows | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-03-30d | Data correctness | Overview (30d): every game and visitor tile equals an independent recomputation from the raw rows | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-03-90d | Data correctness | Overview (90d): every game and visitor tile equals an independent recomputation from the raw rows | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-03-today | Data correctness | Overview (today): every game and visitor tile equals an independent recomputation from the raw rows | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-03-yesterday | Data correctness | Overview (yesterday): every game and visitor tile equals an independent recomputation from the raw rows | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-04 | Data correctness | Compare to previous period: deltas equal (cur-prev)/prev; from zero shows "new"; no NaN/Infinity anywhere | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-05 | Data correctness | Geography (7d): countries and Indian states — visitors, games hosted, devices; unknown place; URL-decoded "São Paulo" | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-06-7d | Data correctness | Technology (7d): device type / OS / browser / in-app tables equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-07-7d | Data correctness | Acquisition (7d): sources table and WhatsApp share equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-08-7d | Data correctness | Funnels (7d): hosting and joining steps (closed-funnel "kept" and "did at all") equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-09-7d | Data correctness | Engagement (7d): players-per-game histogram, medians and replay rate equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-10-7d | Data correctness | Plays (7d): page total = CSV rows = raw count; every status / quick filter total matches; CSV totals match the overview | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-06-30d | Data correctness | Technology (30d): device type / OS / browser / in-app tables equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-07-30d | Data correctness | Acquisition (30d): sources table and WhatsApp share equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-08-30d | Data correctness | Funnels (30d): hosting and joining steps (closed-funnel "kept" and "did at all") equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-09-30d | Data correctness | Engagement (30d): players-per-game histogram, medians and replay rate equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-10-30d | Data correctness | Plays (30d): page total = CSV rows = raw count; every status / quick filter total matches; CSV totals match the overview | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-06-90d | Data correctness | Technology (90d): device type / OS / browser / in-app tables equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-07-90d | Data correctness | Acquisition (90d): sources table and WhatsApp share equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-08-90d | Data correctness | Funnels (90d): hosting and joining steps (closed-funnel "kept" and "did at all") equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-09-90d | Data correctness | Engagement (90d): players-per-game histogram, medians and replay rate equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-10-90d | Data correctness | Plays (90d): page total = CSV rows = raw count; every status / quick filter total matches; CSV totals match the overview | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-06-today | Data correctness | Technology (today): device type / OS / browser / in-app tables equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-07-today | Data correctness | Acquisition (today): sources table and WhatsApp share equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-08-today | Data correctness | Funnels (today): hosting and joining steps (closed-funnel "kept" and "did at all") equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-09-today | Data correctness | Engagement (today): players-per-game histogram, medians and replay rate equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-10-today | Data correctness | Plays (today): page total = CSV rows = raw count; every status / quick filter total matches; CSV totals match the overview | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-06-yesterday | Data correctness | Technology (yesterday): device type / OS / browser / in-app tables equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-07-yesterday | Data correctness | Acquisition (yesterday): sources table and WhatsApp share equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-08-yesterday | Data correctness | Funnels (yesterday): hosting and joining steps (closed-funnel "kept" and "did at all") equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-09-yesterday | Data correctness | Engagement (yesterday): players-per-game histogram, medians and replay rate equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-10-yesterday | Data correctness | Plays (yesterday): page total = CSV rows = raw count; every status / quick filter total matches; CSV totals match the overview | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-11 | Data correctness | Plays status and quick-filter totals for 7 days match the hand-computed expectations | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-12 | Data correctness | Retention: day-1 / day-7 / day-30 return rates, hosts and returning hosts equal the recomputation | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-13 | Data correctness | Players: page total = CSV rows = raw device rows; "only devices that played"; lifetime counters; a device with two names; a host who never played | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-14-7d | Data correctness | Events (7d): page total = CSV rows = raw count (CSV capped at 5,000); filters by name / device / game | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-14-30d | Data correctness | Events (30d): page total = CSV rows = raw count (CSV capped at 5,000); filters by name / device / game | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-14-90d | Data correctness | Events (90d): page total = CSV rows = raw count (CSV capped at 5,000); filters by name / device / game | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-14-today | Data correctness | Events (today): page total = CSV rows = raw count (CSV capped at 5,000); filters by name / device / game | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-14-yesterday | Data correctness | Events (yesterday): page total = CSV rows = raw count (CSV capped at 5,000); filters by name / device / game | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| DATA-15 | Data correctness | Notify me: page rows = CSV rows = raw count, newest first | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-01 | Auth & session | Wrong password / wrong email / both: 401 with the same generic message, no cookie | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-02 | Auth & session | Email is case-insensitive and trimmed; the password is exact (no trim, case-sensitive) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-03 | Auth & session | Very long inputs and SQL / HTML injection strings are refused cleanly (401, JSON, nothing reflected) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-04 | Auth & session | Brute force: 5 failures from one address, then the 6th try — even with the right password — is 429; another address is not affected | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-05 | Auth & session | Session token: forged-clock expiry, far-future expiry, tampered payload, wrong key, garbage and oversized cookies are all refused (pages redirect, API 401) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-06 | Auth & session | Session cookie flags: HttpOnly, SameSite=Lax, Secure (production build), Path=/, Max-Age 12 h | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-07 | Auth & session | Sign out clears the cookie AND the signed-out session can no longer be replayed | P0 | e2e/admin (Playwright + fetch against next start) | failed-then-fixed |
| AUTH-08 | Auth & session | Changing ADMIN_PASSWORD signs everyone out (a cookie from the old password is refused by a server with a new one) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-09 | Auth & session | Admin switched off (no env): every admin page (15) says "not set up" and every admin API (10 routes) answers 404 | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-10 | Auth & session | Without a cookie every admin API route (POST /api/admin/erase, GET /api/admin/events.csv, GET /api/admin/games/DWAAA, GET /api/admin/games, GET /api/admin/games.csv, POST /api/admin/login, POST /api/admin/logout, GET /api/admin/notify.csv, GET /api/admin/players.csv, POST /api/admin/refresh) answers 401 — except sign-in | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-11 | Auth & session | Without a cookie every admin page (15: /admin/acquisition /admin/engagement /admin/events /admin/funnels /admin/games/DWAAA /admin/games /admin/geography /admin/notify /admin /admin/players/aaaa0001 /admin/players /admin/privacy /admin/retention /admin/technology /admin/login) redirects (307) to /admin/login and sends no content | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-12 | Auth & session | CSRF: every state-changing admin API refuses a missing Origin, a foreign Origin, Origin "null" and a non-JSON body — even with a valid session | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-13 | Auth & session | Never cached, never indexed: admin pages and APIs send no-store + X-Robots-Tag noindex; pages carry a robots meta; robots.txt disallows /admin; the sitemap has no admin URL | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-14 | Auth & session | Sign-in page: signed-in visit goes to /admin; wrong methods are refused; failure answers take ≥ 400 ms whatever was wrong | P0 | e2e/admin (Playwright + fetch against next start) | failed-then-fixed |
| AUTH-15 | Auth & session | Security headers on admin responses: X-Frame-Options SAMEORIGIN, frame-ancestors self, nosniff | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-01 | Capture pipeline | A valid batch is answered 204 (no body, no-store) and stored: name, properties, game code, masked path, session, short device id | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-02 | Capture pipeline | Limits: a body over 16 KB is 413 (with and without Content-Length); nothing is stored | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-03 | Capture pipeline | More than 50 events in one batch: the first 50 are stored, the rest dropped | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-04 | Capture pipeline | Whitelist: unknown event names, extra properties, wrong types, bad enum values and over-long strings are dropped; nothing free-form is stored | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-05 | Capture pipeline | Device token: header wins; body "tk" works (sendBeacon); a missing or malformed token stores the events with no device | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-06 | Capture pipeline | Bad requests: malformed JSON, a non-object, a missing / bad session id, events not a list → 400; GET, PUT, DELETE → 405 | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-07 | Capture pipeline | Crawlers and link-preview fetchers are answered 204 and not stored (Googlebot, WhatsApp preview, facebookexternalhit, headless Chrome, curl) | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-08 | Capture pipeline | IP and place come from headers only: body values ignored; first X-Forwarded-For hop; IPv6; IPv4-mapped; garbage → x-real-ip → none; URL-encoded city decoded; markup stripped | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-09 | Capture pipeline | Rate limit: the 121st batch from one device within a minute is 429 and not stored; another device on another address is unaffected | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-10 | Capture pipeline | Events sent from /admin paths are dropped by the server | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-11 | Capture pipeline | Event time: "o" (age) is honoured up to 1 hour; negative, absurd and non-numeric ages cannot post-date or back-date an event | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-12 | Capture pipeline | Order and duplicates: events of a batch keep their order; the server has no de-duplication (a batch sent twice is stored twice) — documented | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-13 | Capture pipeline | Game facts are not double counted with events: one real game + five fake "host_created" / "game_start" / "join_ok" events still count as one game with one player | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| SEC-01 | Privacy & security | Public responses (create, view as host / player / visitor, every action, notify) carry no IP, place, user-agent, token or token hash, and no other player's ticket or dabs | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| SEC-03 | Privacy & security | Stored XSS: <script>, "><img onerror>, javascript: and formula strings in player / game names, city, source, UTM and referrer render inert on 26 admin pages (no script ran, no dialog, no console error, no raw markup in the HTML) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| SEC-02 | Privacy & security | Admin pages, JSON and CSV exports never contain a ticket, dabs, a device token or a full token hash (only the 8-character id) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| SEC-04 | Privacy & security | CSV exports: every row has the header's column count; no cell starts with = + - @ tab or CR (formula injection) in the plays, players, events and notify exports; values with commas, quotes, emoji and Unicode survive a round trip | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| SEC-05 | Privacy & security | Chart "CSV" buttons (made in the browser) are defused the same way | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| RANGE-01 | Date range | Custom ranges: one day; inverted from/to is swapped; a future range is pulled back to today; more than 90 days is capped at the oldest kept day; rubbish falls back to 7 days | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| RANGE-02 | Date range | The date range and compare switch follow the operator through every sidebar link, survive Back / Forward, and a deep link opens the same view | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| PLAYS-01 | Plays table | Plays search: code, part of a name, any letter case, Unicode, emoji, quotes, %, _, <script>, SQL text — each returns exactly the rows a plain substring match gives, and the page never errors | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| PLAYS-02 | Plays table | Plays sort (created / players / activity × both directions) is truly ordered over ALL pages; pages do not overlap or skip; page past the end, page 0, -1 and "abc" behave | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| PLAYS-03 | Plays table | Plays column picker hides / shows columns and remembers the choice after a reload; quick filters and the status filter give the right totals on the page | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| DETAIL-01 | Detail pages | Play detail for a lobby, a live, a finished, an expired and a two-round game shows the right status, facts, people (with IP / place / device) and earlier rounds; unknown and malformed codes give a clear "not found" | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| DETAIL-02 | Detail pages | Player detail: a device with two names lists both; a host who never played shows hosted 1 / joined 0; every IP seen is listed; unknown, short and malformed ids give a clear "not found" | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| EVENTS-01 | Events explorer | Events explorer: 50 per page, pages do not overlap, last page is partial, filters combine, invalid filters are ignored (not an error) | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| UX-01 | UI / UX | When an aggregate query throws, every admin page still answers with a helpful message inside the admin frame (not a blank or crash page), and the API answers a JSON 500 | P2 | e2e/admin (Playwright + fetch against next start) | failed-then-fixed |
| UX-02 | UI / UX | Keyboard only: Tab reaches the sidebar, range buttons, Refresh, Sign out and the page's controls in a sensible order; every focused control shows a visible focus ring; chart Table switch works with Enter | P3 | e2e/admin (Playwright + fetch against next start) | pass |
| UX-03 | UI / UX | Charts are accessible: each chart has a text alternative or table twin with the same numbers, the Chart/Table switch exposes aria-pressed, tables have column headers; one <h1> per page; the page has a <main> and labelled navigation | P3 | e2e/admin (Playwright + fetch against next start) | pass |
| UX-04 | UI / UX | Print: the page renders to PDF without the sidebar / top bar / buttons, and every chart's numbers are printed as a table | P3 | e2e/admin (Playwright + fetch against next start) | pass |
| UX-05 | UI / UX | Admin pages send no analytics: visiting all of them makes no request to /api/t, and they load nothing from another site | P3 | e2e/admin (Playwright + fetch against next start) | pass |
| UX-06 | UI / UX | Signed-in visit to /admin/login lands on /admin; sign-out button returns to the sign-in page and Back does not show admin data again | P3 | e2e/admin (Playwright + fetch against next start) | pass |
| PERF-01 | Performance | Server time of every admin page with 328 games / 6641 events (memory mode): none over 1.5 s | P2 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-14 | Capture pipeline | The raw device token sent in the beacon body ("tk") is hashed at once: it is never echoed, never in any admin page / export / JSON, and never in the server log — only the 8-character id derived from its hash appears | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| SEC-06 | Privacy & security | Names typed on the player side — <img src=x onerror=…>, "=…", "+…", "-…", "@…" — created through the real public API: inert on the plays list, play detail, players list, player detail and events pages, and defused in the plays and players exports | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| CAP-15 | Capture pipeline | A real browser visit: session_start + page views are batched (not one request per event); closing the tab sends session_end through sendBeacon; with /api/t blocked (ad blocker) hosting and joining a game still work with no page error | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| MIG-08 | Migrations & database | Deployed before migration 0003 (a stand-in database that only has 0001 + 0002): creating a game and POST /api/t still work; every admin page answers 200 with the "Run migration 0003" notice and no crash; erase answers a clear 409; nothing is retried in a loop | P1 | e2e/admin (Playwright + fetch against next start) | pass |
| ERASE-01 | Erase a device | Erase cannot be triggered cross-site or without a session: foreign Origin 403, form post 415, no cookie 401 — and the device is still there afterwards | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| ERASE-02 | Erase a device | Bad ids are refused with 400 and nothing changes: empty, 7 and 9 characters, non-hex, a full hash, SQL / wildcard text, a number, an array | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| ERASE-03 | Erase a device | Erasing a device that does not exist answers found:false with zero counts and removes nothing | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| ERASE-04 | Erase a device | Erase "bbbb0002" (Meera: 4 games, 2 names): the answer's counts equal the raw rows; device row, IPs, events and per-game place/device are gone; names become "Erased player" everywhere incl. earlier rounds; expired games lose the device link, the still-open game keeps the seat | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| ERASE-05 | Erase a device | Idempotent: erasing the same id again removes nothing more (only the seat in the still-open game is reported), and other people's data is untouched | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| ERASE-06 | Erase a device | Two devices whose 8-character ids collide ("12345678"): erase removes BOTH (documented limitation of the short id) | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| ERASE-07 | Erase a device | Audit: every erase (also "not found" ones) leaves one line with the id and counts — and no name, IP or place | P0 | e2e/admin (Playwright + fetch against next start) | pass |
| AUTH-04b | Auth & session | Sign-in block lifts after 15 minutes (shifted clock) | P0 | Vitest src/server/admin/__tests__/qa-admin.test.ts | pass |
| AUTH-05b | Auth & session | A session expires at exactly 12 h (shifted clock) | P0 | Vitest qa-admin.test.ts | pass |
| RET-01 | Retention | Retention, memory store: tickets and dabs erased at 24 h; game summary, devices, IPs, events, participations deleted at 90 days, not a minute earlier | P0 | Vitest qa-admin.test.ts (mutation-checked) | pass |
| RET-02 | Retention | A device seen again keeps its row; its old events and old IP still expire | P0 | Vitest qa-admin.test.ts | pass |
| RET-03 | Retention | Retention, PostgreSQL: purge at 24 h / 90 days for games and for the five analytics tables; retention argument | P0 | npm run test:sql (security.sql, insights.sql) on local PostgreSQL 16 | pass |
| ERASE-08 | Erase a device | Erase in the memory store: counts, anonymised names, seat kept while the game is open and cut after expiry, audit, other people untouched | P0 | Vitest qa-admin.test.ts (mutation-checked) | pass |
| ERASE-09 | Erase a device | Erase in PostgreSQL (admin_erase_device): same behaviour | P0 | npm run test:sql (insights.sql) | pass |
| MIG-01 | Migrations & database | Migrations 0001 → 0002 → 0003 apply on a fresh PostgreSQL 16 | P1 | npm run test:sql | pass |
| MIG-02 | Migrations & database | Each migration run a second time stops with "already exists" and changes no table, function or grant | P1 | npm run test:sql (new step in run.sh: schema fingerprint before / after) | pass |
| MIG-03 | Migrations & database | Every table in public (read from pg_catalog): RLS on, no policy | P0 | supabase/tests/qa_admin.sql (mutation-checked) | pass |
| MIG-04 | Migrations & database | anon / authenticated hold no privilege on any table, view or sequence | P0 | supabase/tests/qa_admin.sql (mutation-checked) | pass |
| MIG-05 | Migrations & database | No function executable by anon / authenticated / PUBLIC; all by service_role; SECURITY DEFINER functions pin search_path | P0 | supabase/tests/qa_admin.sql (mutation-checked) | pass |
| MIG-06 | Migrations & database | As anon in practice: every table reads empty or refused, no function runs | P0 | supabase/tests/qa_admin.sql | pass |
| MIG-07 | Migrations & database | 0001 + 0002 alone still pass their own checks (0003 not yet run) | P1 | npm run test:sql | pass |
| MIG-09 | Migrations & database | SQL aggregates equal the TypeScript aggregates on a seeded dataset (214 comparisons) | P1 | npm run test:sql (insights_parity.sql) | pass |
| DATA-05b | Data correctness | Countries outside the built-in list are named ("Brazil", not "BR") | P1 | Vitest qa-admin.test.ts; BUG-A04 | failed-then-fixed |
| DATA-04b | Data correctness | Compare switch: the Notify-me tile shows its change like every other tile | P1 | inspection + e2e dump; BUG-A07 | failed-then-fixed |
| CAP-02b | Capture pipeline | Body limit counts bytes, also for chunked multi-byte bodies | P1 | e2e/admin/verify-capture.cjs CAP-02; BUG-A05 | failed-then-fixed |
| UX-12 | UI / UX | Geography tiles: "1 visitor" not "1 visitors" | P3 | inspection; BUG-A06 | failed-then-fixed |
| UX-07 | UI / UX | Layout at 1920 / 1440 / 1280 / 1024 / 768 / 390 / 360 on 14 pages: no sideways page scroll, no clipped headings or tiles, no text under 11 px, no console error | P3 | e2e/admin/ui.cjs + screenshots reviewed | pass |
| UX-08 | UI / UX | Phone: every control at least 24 px tall | P3 | e2e/admin/ui.cjs — small copy buttons and links inside table rows (11–120 per page) are under 24 px; recommendation R5 | failed-open |
| UX-09 | UI / UX | Colour contrast of text | P3 | Automatic measurement was not reliable with the OKLCH colours; screenshots were reviewed by eye only (light text on dark navy throughout) | not-run |
| UX-10 | UI / UX | Sticky table header stays in place while the plays table scrolls | P3 | Playwright probe | pass |
| UX-11 | UI / UX | Empty states on every page with no data | P3 | All 14 pages rendered on an empty store (MIG-08 run and port 8603); wording read in the source, not screenshot-reviewed page by page | pass |
| UX-13 | UI / UX | Loading skeleton while a page gathers its numbers | P3 | Pages answer in under 70 ms locally, the skeleton never stays long enough to observe; source read only | not-run |
| PRIV-01 | Privacy text | Privacy Policy lists everything that is stored | P1 | Review of src/app/privacy/page.tsx against the stored columns: latitude / longitude, postal code and the raw User-Agent text are stored but not named; Supabase is described as storing only games and Notify-me numbers. Needs decision D1 | failed-open |
| PRIV-02 | Privacy text | docs/API.md and the Privacy Policy describe the device token in the beacon body correctly (hashed, never stored raw) | P1 | Review + CAP-14 | pass |
| LIVE-01 | Live environment | Real Supabase project (PostgREST, RLS with the real anon key, pg_cron) | P3 | No Supabase project in the sandbox; covered by local PostgreSQL + a stand-in API | blocked |
| LIVE-02 | Live environment | Real Vercel geo headers and X-Forwarded-For behaviour | P3 | Needs a Vercel deployment; headers were simulated | blocked |
| LIVE-03 | Live environment | Retention over real days; hourly clean-up on a schedule | P3 | Tested with a shifted clock and back-dated rows only | blocked |

## Checks that were made able to fail

For the checks that matter most, the behaviour was broken once on purpose to see the check go red, then restored:

| Check | What was broken | Result |
|---|---|---|
| Session revocation (AUTH-07) | the "is it signed out?" line removed | test failed |
| Erase (ERASE-08) | IP rows no longer deleted | test failed |
| Retention (RET-01) | events not purged; tickets not erased | tests failed |
| CSV formula defusing (SEC-04) | only `=` and `@` defused | test failed |
| Database lock-down (MIG-03…05) | `grant select … to anon`; RLS disabled; a function granted; a policy added | check failed each time |
| Data checks (DATA-*) | first run compared in the wrong order | 8 checks failed until corrected |
| Auth guard (AUTH-05) | includes a validly signed control token that must be accepted, so "refused" is meaningful | — |
| Leak checks (SEC-01, SEC-02, CAP-14) | each has a control: the admin view must contain the IP / city / short id that the public answers must not | — |
| XSS (SEC-03, SEC-06) | each requires the payload to be visible as text on several pages, so an empty page cannot pass | — |

## Not covered here

A real Supabase project, real Vercel geo headers, real traffic and real multi-day retention (cases LIVE-01…03, "blocked");
colour contrast by measurement (UX-09); the loading skeleton (UX-13).
