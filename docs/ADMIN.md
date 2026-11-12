# Admin panel

A private area at `/admin` for the one person who runs Letsplaytambola. It is **switched off** until you set an email and a
password (below). It is not linked from the public site, not in the sitemap, and search engines are told to stay out.

## What it shows

| Page | What is on it |
|---|---|
| `/admin` — **Dashboard** | Switch between Today / 7 days / 30 days / 90 days. Totals (games created, started, finished; players; unique devices; average players per game; average numbers called per finished game; share of games with a ticket price; recorded pot; Notify-me sign-ups), games per day, players per day, busiest hours, most picked ways to win, most won, and the games open right now. |
| `/admin/games` — **Plays** | Every game of the last 90 days: created, code, name, host, status, players, numbers called, round, ticket price, prizes won, last activity. Search (code, game name, host), filter by status and date, sort, 25 per page, **Export CSV** of the current filter. |
| `/admin/games/CODE` — **Play detail** | The game's facts and times, ways to win with winner / amount / time, the players (name, role, joined at, prizes, device), the numbers in call order and on a board, earlier rounds, and a timeline of the latest 30 events. A **Refresh** button while the game is open. |
| `/admin/players` — **Players** | One row per *device*: names used, games joined and hosted, prizes won, recorded amount, first and last seen. Search by name, sort, 25 per page. |
| `/admin/players/ID` — **Player detail** | The names a device used and its games, linking to each play. |
| `/admin/notify` — **Notify me** | The WhatsApp numbers left on the website, with the date. **Export CSV**. |

Things to know when reading the numbers:

- **A "player" is a browser on a device, not a person.** Nobody signs up, so there are no accounts. A device is shown as a
  short anonymous id (the first 8 characters of a scrambled code). The same person on two devices is two rows; a family
  sharing a phone is one row with several names. Clearing the browser's site data gives a device a new id.
- **Money is "recorded only".** The ticket price is a note the host typed; the app never handles payments. "Recorded pot" =
  ticket price × players, for rounds that were started.
- **All times are India time (IST).** A "day" on the dashboard is an India calendar day; ranges count whole days ending today.
- **Status:** Lobby, Live, Finished, or **Expired** — a game left in the lobby or mid-game with no activity for 24 hours.
- **Rounds.** When a host taps "Play again", the round that just ended is remembered (times, numbers called, winners) and
  counted in "games finished", "average numbers called", "most won" and the pot. Games played before this version have no
  such record and no exact start/finish time.
- **Tickets and dabs are never shown** — the admin has no page, export or API that returns them, and they are erased when a
  game expires (see Retention).
- The dashboard and the Players page read at most the newest 5,000 games of the period (a note appears if that is hit).

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
1. If your Supabase project was created before the admin panel existed, first run `supabase/migrations/0002_admin.sql`
   once in the Supabase **SQL Editor** — the exact steps are in `supabase/README.md`.
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

The 90 days is one constant: `ADMIN_RETENTION_DAYS` in `src/server/store/types.ts`, matched by `admin_retention_days()` and
the default of `purge_expired_games(p_retention_days)` in `supabase/migrations/0002_admin.sql`. Change all three together,
and the Privacy Policy with them.

The clean-up runs by itself about once an hour while the site is in use, and every hour regardless if you schedule it
(`supabase/README.md`, step 5). The Privacy Policy (`/privacy`) says the same thing in plain words — if you change the
retention or what the admin shows, update it.

**Removing one game on request.** The panel has no delete button. If someone asks you to erase a game before the 90 days are
up, run this in the Supabase SQL Editor with the game's code: `delete from public.games where code = 'K7RQ2';`
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
- **Every admin page and every admin API route checks the cookie on the server on every request.** A check in front of the
  pages (`src/proxy.ts`) additionally turns a signed-out visit into a real redirect to the sign-in page; it is a
  convenience, not the lock.
- **CSRF:** the two state-changing routes (sign in, sign out) accept JSON only and require an `Origin` header that matches
  the site. Everything else in the admin is read-only.
- **Never cached, never indexed:** admin responses are `no-store`; pages carry `noindex, nofollow`; `/admin` is disallowed
  in `robots.txt`.
- **Database:** the admin reads through SQL functions that return no ticket, no dabs and no full device hash, and that only
  the server's service role may run. The public (anon) key can still read and write nothing — `npm run test:sql` proves it.
- **Exports** (CSV) contain names people typed and phone numbers. Keep the files private and delete them when done. Cells
  that a spreadsheet could read as a formula are defused with a leading `'`.

## Admin API (for reference)

All need the session cookie, except sign-in. All answer `404` when the admin is switched off and `401` when not signed in.

| Method and path | What |
|---|---|
| `POST /api/admin/login` `{ "email", "password" }` | Sign in. `200 { ok: true }` + cookie · `401` generic error · `429` too many tries. JSON + same-origin only. |
| `POST /api/admin/logout` `{}` | Sign out (clears the cookie). JSON + same-origin only. |
| `GET /api/admin/games?q=&status=&from=&to=&sort=&dir=&page=` | One page (25) of plays as JSON. `status`: `lobby`, `live`, `done`, `expired`. `from`/`to`: `YYYY-MM-DD` (India days). `sort`: `created`, `players`, `activity`. |
| `GET /api/admin/games/CODE` | One play as JSON: the public game document, short device ids, computed facts. No tickets, no dabs. |
| `GET /api/admin/games.csv?…` | The same filter as a CSV file, every page, up to 5,000 rows. |
| `GET /api/admin/notify.csv` | The Notify-me numbers as a CSV file. |

## Where the code is

| Path | What |
|---|---|
| `src/server/admin/auth.ts` | Credentials check, session token, sign-in rate limit, CSRF checks (pure, unit-tested) |
| `src/server/admin/guard.ts` | `requireAdmin()` for pages, `requireAdminApi()` for routes |
| `src/server/admin/stats.ts`, `time.ts`, `queries.ts` | Statistics from game summaries, India time, URL filters and CSV |
| `src/server/store/*` | `adminListGames`, `adminGamesInRange`, `adminGetGame`, `adminListNotifyNumbers`, `adminCountNotifyNumbers`, `purge` in both the memory and the Supabase store |
| `src/app/admin/**`, `src/app/api/admin/**`, `src/features/admin/**` | Pages, API routes, components and styles |
| `src/proxy.ts` | The redirect in front of the admin pages |
| `supabase/migrations/0002_admin.sql`, `supabase/tests/security.sql` | Retention change, admin SQL functions, and their tests |
