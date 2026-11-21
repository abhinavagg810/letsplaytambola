# Admin panel

A private area at `/admin` for the one person who runs Letsplaytambola. It is **switched off** until you set an email and a
password (below). It is not linked from the public site, not in the sitemap, and search engines are told to stay out.

## What it shows

A sidebar on the left (collapsible; a menu and a tab bar on phones) and a bar on top with the **date range** — Today,
Yesterday, 7 / 30 / 90 days or a custom from–to in India days — a **Compare to previous period** switch (▲▼ % on the
tiles), the time the numbers were loaded, **Refresh** and **Sign out**. The range lives in the page address
(`?range=30d&cmp=1`), so it follows you from section to section and a bookmark keeps it.

| Page | What is on it |
|---|---|
| `/admin` — **Overview** | Live now (visitors in the last 5 minutes, open games). Tiles with change vs the previous period and small trend lines: visitors, sessions, new and returning devices, page views, average time on site; games created / started / finished, completion rate, players, devices that played, average players per game, average game length, recorded prize money and ticket money, Notify-me sign-ups. Charts: visitors, sessions, games and players per day; weekday × hour heatmaps of visits and of games created. |
| `/admin/acquisition` — **Acquisition** | Sources, referrers, campaign tags (`utm_source` / `utm_medium` / `utm_campaign`), landing pages, in-app browsers (share of traffic from WhatsApp), and the invite loop: share taps → invite pages seen → joins, average joins per created game, games shared the most. |
| `/admin/funnels` — **Funnels** | Hosting (home → setup → name → create tapped → created → started → finished) and joining (invite seen → name → joined → played to the end): visitors at each step, conversion from the step before, how many left. Filter by device type and by source. Why creating / joining failed. |
| `/admin/geography` — **Geography** | Countries, Indian states and cities: visitors, sessions, games hosted, players, devices that played, share. A ranked bar list per state. |
| `/admin/technology` — **Technology** | Device type, operating system, browser, in-app browsers, screen width, language, connection. |
| `/admin/engagement` — **Engagement** | Players per game, game length, rounds per game (replay rate), prize money per game, time from create → first join → start, auto-call and sound usage, most picked / most won ways to win, claims vs valid claims and the not-valid rate per way to win, numbers called before each win (median and middle half), messages shown to people. |
| `/admin/retention` — **Retention** | Came back after day 1 / 7 / 30, returning hosts (hosted on 2+ different days), weekly cohort table. |
| `/admin/games` — **Plays** | Every game of the selected period: created, game + code, host, status, players, numbers called, round, ticket price, prizes won, **host location, host device, source**, last activity. Quick filters (Live now · With ticket price · Abandoned in lobby · Finished today), search, status, sort, show / hide columns, 25 per page, **Export CSV**. |
| `/admin/games/CODE` — **Play detail** | Facts and times (time in lobby, game length), share taps and invite views for that game, **people with IP address, city, device and source**, ways to win, numbers called, earlier rounds, and one timeline merged from the game's own events and the usage events around it. |
| `/admin/players` — **Players** | One row per *device*: id, last name used, location, latest IP address, device / OS / browser, first source, sessions, games hosted / joined, prizes won, amount, first and last seen. Search (name, city, IP, id), "only devices that played", sort, columns, **Export CSV**. |
| `/admin/players/ID` — **Player detail** | Everything about one device: activity, where and on what, how it first arrived, every IP address seen, names used, games, and its session and event history. Buttons: its events, **Erase this device**. |
| `/admin/events` — **Events** | Every usage event of the period: filter by event, device, game; 50 per page; **Export CSV**. |
| `/admin/notify` — **Notify me** | The WhatsApp numbers left on the website, with the date. **Export CSV**. |
| `/admin/privacy` — **Data & privacy** | Rows stored per table and how long each is kept, who can see what, **Erase a device**, and the audit list of erases. |

Every chart has a **Chart / Table** switch and a **CSV** button with the same numbers; every table has an export. The pages
print cleanly (Ctrl/Cmd + P): the frame is left out and each chart's table is printed under it.

Things to know when reading the numbers:

- **A "player" / "visitor" / "device" is a browser on a device, not a person.** Nobody signs up, so there are no accounts.
  A device is shown as a short anonymous id (the first 8 characters of a scrambled code). The same person on two devices is
  two rows; a family sharing a phone is one row with several names. Clearing the browser's site data gives a new id.
- **Game numbers come from the games themselves** (created, started, finished, players, wins, money) — as before, and never
  double counted with events. **Visitor numbers come from usage events** sent by the browser (below).
- **Location is approximate.** It is the place the hosting provider (Vercel) derives from the IP address: city level at
  best, often the mobile operator's hub city, wrong behind VPNs. It is not GPS. On your own computer it is "Unknown".
- **Events can be missing.** Visitors with an ad blocker or strict privacy settings may send none; the last few seconds of a
  visit are sent when the tab is closed and can be lost. Read event numbers as "at least". Crawlers and link-preview
  fetchers (Googlebot, WhatsApp's preview, headless browsers) are not counted at all.
- **WhatsApp traffic is under-reported.** On Android, WhatsApp usually opens links in the normal browser with no trace of
  where the tap came from; such visits count as "Direct". iPhone WhatsApp and campaign-tagged links are recognised.
- **Funnels** count a visitor at a step only if they also did every step before it in the period, so the numbers only go
  down. The table view shows how many did each step at all.
- **Money is "recorded only".** The ticket price and prize amounts are notes the host typed; the app never handles payments.
- **All times are India time (IST).** A "day" is an India calendar day.
- **Status:** Lobby, Live, Finished, or **Expired** — a game left in the lobby or mid-game with no activity for 24 hours.
  "Abandoned in lobby" = never started and nothing happened for over an hour.
- **Tickets and dabs are never shown** — the admin has no page, export or API that returns them.
- Game statistics read at most the newest 5,000 games of the period (a note appears if that is hit). Aggregate numbers are
  cached on the server for 30 seconds; **Refresh** asks for fresh ones.

## What is captured

Everything is first-party: the browser talks only to this site's own server (`POST /api/t`, `docs/API.md`). There is no
third-party analytics service and no cookie.

| What | Where from | Stored in |
|---|---|---|
| IP address | Request headers (`x-forwarded-for` first hop, else `x-real-ip`) — never from anything the browser types | `devices.ip` (latest), `device_ips` (every one seen), `participations.ip` (at create / join) |
| Approximate location: country, region, city, latitude / longitude, time zone, postal code | Vercel's `x-vercel-ip-*` headers | `devices`, `device_ips`, `participations`, and country / region / city on every event |
| Device type, OS + version, browser + version, in-app browser (WhatsApp, Instagram, Facebook …) | The `User-Agent` header, parsed by `src/server/insights/ua.ts` | `devices`, `participations`, events |
| Language | The `Accept-Language` header | `devices.language`, `session_start` events |
| Screen and window size, pixel ratio, time zone, touch, connection type, installed to home screen | Sent once per browser-tab session by `src/lib/track.ts` | `devices`, `session_start` events |
| Referrer (host name only), `utm_source` / `utm_medium` / `utm_campaign`, landing page | Same | `devices.first_*` (first touch, never overwritten), `session_start` events, `source` on every event |
| Usage events | `track()` calls in the browser | `events` |
| Lifetime counts, last name used | Worked out by the server on create / join / win | `devices` |

**Events recorded** (the server's whitelist is `src/server/insights/events.ts`; anything else is dropped, and each
property is checked for type, length and allowed values): `session_start`, `session_end` (time on site), `page_view`
(home, host setup, ways to win, join, privacy, terms, and a game page by what it shows: invite / lobby / live / results /
not found), `cta_host`, `cta_join`, `cta_code`, `cta_notify`, `host_name_typed`, `host_preset`, `host_amount_typed`,
`host_price_set`, `host_create_tap`, `host_created`, `host_create_failed` (+ reason), `share_whatsapp`, `share_copy`,
`share_header_copy`, `join_name_typed`, `join_tap`, `join_ok`, `join_failed` (+ reason), `game_not_found`, `game_start`,
`first_call`, `auto_on` / `auto_off`, `mute_on` / `mute_off`, `claim_open`, `claim_valid` (+ prize, numbers called),
`claim_invalid` (+ prize, reason), `new_round`, `results_seen` (+ role), `host_own_tap`, `toast` (the *kind* of message
shown — never its text), `offline` / `online`. Nothing a person types is recorded, and never a ticket or a dab.

## Switch it on

Three settings. The first two are required; with either one missing every `/admin` page says "Admin is not set up" and
every admin API answers 404.

| Name | What to put |
|---|---|
| `ADMIN_EMAIL` | The email you will type to sign in. |
| `ADMIN_PASSWORD` | A long random password that you use nowhere else (a password manager can make one; 20+ characters). |
| `ADMIN_SESSION_SECRET` | Optional. Another long random string, used to sign the sign-in cookie. |

**Never write the real values into any file in this repository, an issue, a chat or a screenshot.** The examples below are placeholders.

### On your computer
1. Create a file called `.env.local` in the project folder (it is ignored by git) and add:
   ```
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD=change-me
   ```
   (Use your own email and a real password instead of these placeholders.)
2. Start the site (`npm run dev`) and open <http://localhost:3000/admin>.

### On Vercel
1. Run the SQL files your Supabase project has not had yet, once each, in the Supabase **SQL Editor**:
   `supabase/migrations/0002_admin.sql` (the admin panel) and `supabase/migrations/0003_insights.sql` (IP / location,
   devices, events). The exact steps are in `supabase/README.md`.
2. Vercel → your project → **Settings → Environment Variables**.
3. Add `ADMIN_EMAIL` with your email. Environment: **Production**.
4. Add `ADMIN_PASSWORD` with your password. Tick **Sensitive** (Vercel then never shows the value again). Environment: **Production**.
5. Optional: add `ADMIN_SESSION_SECRET` (long random string), also **Sensitive**.
6. **Redeploy** (Deployments → the latest one → ⋯ → Redeploy). Settings only reach the site on a new deployment.
7. Open `https://<your site>/admin` and sign in.

### Change the password
Change `ADMIN_PASSWORD` in Vercel (or `.env.local`) and redeploy (restart). Everyone signed in is signed out at once,
because the password is part of the key that signs sessions. Changing `ADMIN_SESSION_SECRET` also signs everyone out.

### Switch it off
Delete `ADMIN_EMAIL` or `ADMIN_PASSWORD` and redeploy.

## Retention — what is kept, and for how long

| When | What happens |
|---|---|
| While a game is active | Everything the game needs is stored, including each player's ticket and dabs (only ever sent to that player's own device). |
| 24 hours after the last activity | The game stops working for players (link and code answer "can't find game"). Its **tickets and dabs are erased**. |
| Up to 90 days after the last activity | A **summary** stays for the admin: game name, the names people typed, numbers called, who won what, ticket price, times, and an anonymous device identifier per seat. The game's code is not given to a new game during this time. |
| After 90 days | The summary and the device identifiers are **deleted for good**. |
| IP addresses, places, device rows, events | Kept **90 days** after they were last touched (a device: after it was last seen; an event: after it happened), then **deleted for good** by the same clean-up. |
| Audit lines (erases) | Kept. They hold a short device id and counts only. |

The 90 days is one constant: `ADMIN_RETENTION_DAYS` in `src/server/store/types.ts`, matched by `admin_retention_days()` and
the defaults of `purge_expired_games(p_retention_days)` and `purge_insights(p_retention_days)` in `supabase/migrations/`.
Change them together, and the Privacy Policy with them.

The clean-up runs by itself about once an hour while the site is in use, and every hour regardless if you schedule it
(`supabase/README.md`, step 5). The Privacy Policy (`/privacy`) says the same thing in plain words — if you change the
retention or what the admin shows, update it.

### Erase a device (a person asks for their data to be deleted)

1. Find the device: **Players** → search by the name they used, their city or — if they tell you the game — open the play
   and look at **People**. Open the device's page.
2. **Erase this device…** (or **Data & privacy** → type the 8-character id) → confirm.

What it does, in one step: deletes the device row, every IP address and event recorded for it and its place / device
details in games; replaces the names it typed with "Erased player" in every stored game summary; and, for games that have
already expired, replaces the stored device code so nothing links to it any more. A game that is **still being played**
keeps the seat so the game can go on — erase again after it has expired (24 hours) to cut that last link; the result tells
you when this applies. Every erase leaves one line in the audit list (device id and counts — nothing else).
The request goes to `POST /api/admin/erase`, which needs the session, a JSON body and a same-site `Origin`.

**Removing one game on request.** The panel has no delete button for a whole game. Run this in the Supabase SQL Editor with
the game's code: `delete from public.games where code = 'K7RQ2';` (its participations go with it).
To remove a Notify-me number: `delete from public.notify_numbers where phone = '9810011001';`

## How it is protected

- **Credentials live only in environment variables** on the server. They are never sent to the browser, logged, or stored
  anywhere else.
- **Sign-in** compares SHA-256 digests with a constant-time comparison (the email without regard to case). Every failure
  gives the same message, "Email or password is not right", after the same short wait.
- **Brute force:** after 5 failed tries from one network address, sign-in from that address is refused for 15 minutes.
  This counter lives in the server's memory; on Vercel each server instance counts on its own, so treat it as a speed
  bump — **a long random password is what really protects the panel.**
- **Session:** a cookie (`HttpOnly`, `Secure` in production, `SameSite=Lax`) holding only an expiry time and an
  HMAC-SHA256 signature. It lasts 12 hours. The signing key is SHA-256 of the password together with
  `ADMIN_SESSION_SECRET` (or, if that is not set, the Supabase service key).
- **Sign out** clears the cookie and also ends that session on the server, so a copied cookie cannot be replayed afterwards.
  (That list lives in the server's memory, like the brute-force counter: on Vercel treat it as best effort. To end every
  session everywhere for certain, change `ADMIN_PASSWORD` or `ADMIN_SESSION_SECRET` and redeploy.)
- **If a page's numbers cannot be loaded** (the database does not answer), the page says so inside the admin frame with a
  **Try again** button; the other sections keep working.
- **Every admin page and every admin API route checks the cookie on the server on every request.** A check in front of the
  pages (`src/proxy.ts`) additionally turns a signed-out visit into a real redirect to the sign-in page; it is a
  convenience, not the lock.
- **CSRF:** every state-changing route (sign in, sign out, refresh, erase a device) accepts JSON only and requires an
  `Origin` header that matches the site. Everything else in the admin is read-only.
- **IP addresses and places are admin-only.** They are written after the response has been sent and are never part of any
  public page or API answer; `npm test` serialises every public view and response and checks for them.
- **Never cached, never indexed:** admin responses are `no-store`; pages carry `noindex, nofollow`; `/admin` is disallowed
  in `robots.txt`.
- **Database:** the admin reads through SQL functions that return no ticket, no dabs and no full device hash, and that only
  the server's service role may run. The five analytics tables have row level security with no policies, like the rest.
  The public (anon) key can still read and write nothing — `npm run test:sql` proves it.
- **Exports** (CSV) contain names people typed, phone numbers, IP addresses and places. Keep the files private and delete them when done. Cells
  that a spreadsheet could read as a formula are defused with a leading `'`.

## Admin API (for reference)

All need the session cookie, except sign-in. All answer `404` when the admin is switched off and `401` when not signed in.

| Method and path | What |
|---|---|
| `POST /api/admin/login` `{ "email", "password" }` | Sign in. `200 { ok: true }` + cookie · `401` generic error · `429` too many tries. JSON + same-origin only. |
| `POST /api/admin/logout` `{}` | Sign out (clears the cookie). JSON + same-origin only. |
| `GET /api/admin/games?q=&status=&quick=&from=&to=&sort=&dir=&page=` | One page (25) of plays as JSON. `status`: `lobby`, `live`, `done`, `expired`. `quick`: `live`, `priced`, `abandoned`. `from`/`to`: `YYYY-MM-DD` (India days). `sort`: `created`, `players`, `activity`. |
| `GET /api/admin/games/CODE` | One play as JSON: the public game document, short device ids, computed facts, and `insights` (people's IP / place / device, usage events). No tickets, no dabs. |
| `GET /api/admin/games.csv?…` | The same filter as a CSV file, every page, up to 5,000 rows. |
| `GET /api/admin/notify.csv` | The Notify-me numbers as a CSV file. |
| `GET /api/admin/players.csv?q=&played=&sort=&dir=` | The devices table as a CSV file (with latest IP address and location), up to 5,000 rows. |
| `GET /api/admin/events.csv?range=&from=&to=&name=&device=&code=&session=` | The events explorer's filter as a CSV file, up to 5,000 rows. |
| `POST /api/admin/refresh` `{}` | Forget the 30-second cache of aggregates. JSON + same-origin only. |
| `POST /api/admin/erase` `{ "device": "3fa9c1d2" }` | Erase one device (above). `200 { ok, result: { found, devices, ips, events, participations, games, activeGames } }`. JSON + same-origin only. |

## Where the code is

| Path | What |
|---|---|
| `src/server/admin/auth.ts`, `guard.ts` | Credentials check, session token, sign-in rate limit, CSRF checks; `requireAdmin()` for pages, `requireAdminApi()` for routes |
| `src/server/admin/range.ts`, `cache.ts`, `labels.ts`, `exports.ts`, `queries.ts` | The global date range, the 30-second aggregate cache, key → words, URL filters and CSV |
| `src/server/admin/stats.ts`, `gameStats.ts`, `time.ts` | Statistics from game summaries, India time |
| `src/server/client-info.ts` | IP address and place from request headers |
| `src/server/insights/ua.ts`, `events.ts`, `record.ts` | User-Agent parser, the event whitelist and validation, request → store glue |
| `src/server/insights/aggregate.ts`, `types.ts` | Every aggregate in TypeScript (the memory store runs these; SQL twins in migration 0003) |
| `src/server/store/*` | The `insights…` methods of both stores, `purge`, `eraseDevice` |
| `src/lib/track.ts`, `src/lib/TrackPageViews.tsx`, `src/app/api/t/route.ts` | The browser side of the usage events and the endpoint that takes them |
| `src/app/admin/**`, `src/app/api/admin/**`, `src/features/admin/**` | Pages, API routes, components (`Chrome`, `charts`, `client`, `bits`) and styles (`ui.module.css`) |
| `src/proxy.ts` | The redirect in front of the admin pages |
| `supabase/migrations/0002_admin.sql`, `0003_insights.sql`, `supabase/tests/*` | Retention, admin SQL functions, analytics tables and aggregates, and their tests |

## If the site is deployed before migration 0003 has been run

Nothing breaks. Games work exactly as before; the analytics writes are dropped quietly (one warning in the server log);
every admin page shows a notice — **"Run migration 0003 to switch the analytics on"** — and the visitor, place, device,
funnel and event sections are empty, while the game numbers (from the games themselves) are complete. The Players page
falls back to the devices known from games. The two quick filters "With ticket price" and "Abandoned in lobby" and
"Erase a device" say they need the migration. Run `supabase/migrations/0003_insights.sql` (`supabase/README.md`) and the
notice disappears within a minute; recording starts from that moment (nothing is back-filled).
