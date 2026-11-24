# Letsplaytambola

A free website for playing Tambola (Housie) with family and friends. No sign-up: anyone hosts a game, shares one link,
and players join by typing their name. Works on phones and desktops.

The earlier mobile-app version (with accounts) is kept on the branch `v1-expo-app`.

## Run it on your computer

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. With no settings, games are kept in the server's memory — enough to play a real game
with several browsers or phones on the same Wi-Fi (they are lost when the server restarts).

To test from phones on your Wi-Fi, run the production build and open `http://<your computer's IP>:3000` on each phone:

```bash
npm run build
```

```bash
npm start
```

## Put it on the internet

1. Create a Supabase project and its tables — follow `supabase/README.md` (about 10 minutes).
2. Import this repo in Vercel (framework: Next.js, default settings) and add the environment variables listed in `.env.example`.
3. Deploy. Without Supabase the deployed site cannot keep games, because Vercel's servers do not share memory.

## Pages

| Address | What |
|---|---|
| `/` | Home page |
| `/host`, `/host/prizes`, `/join`, `/g/CODE` | Host setup, ways to win picker, join with a code, the game |
| `/how-to-play` | Guide: how to play Tambola (Housie) and how to host a game here |
| `/ways-to-win` | Guide: all 26 patterns with a picture of each (from `src/core/data.ts` + `miniCells()`) |
| `/tambola-number-calls` | Guide: the 90 number calls the caller uses, printable |
| `/about` | About us: the Letsplaytambola team, Delhi, India |
| `/contact` | Contact us: the email address and a message form (stored for Admin → Messages) |
| `/privacy`, `/terms` | Privacy Policy and Terms of Use (draft for a lawyer's review) |

The content pages are static Server Components with no ads. The contact email is one setting, `NEXT_PUBLIC_CONTACT_EMAIL`
(`.env.example`); without it the placeholder `hello@letsplaytambola.com` is shown — make sure the mailbox you show works.
The contact form stores messages only once `supabase/migrations/0004_contact.sql` has been run (`supabase/README.md`); before
that it tells people their message was not sent and shows the email address instead.

## Admin panel

`/admin` is a private area for the person who runs the site: an analytics dashboard (visitors, where they come from and
where they are, devices, funnels, engagement, retention), the list of plays, play and player details with IP address and
approximate location, an events explorer, the "Notify me" numbers, the contact-form Messages, and a Data & privacy page with "Erase a device".
It is switched off until you set `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
How to switch it on, what it shows, what is captured and how it is protected: `docs/ADMIN.md`.
With Supabase, run `supabase/migrations/0003_insights.sql` once for the analytics and `0004_contact.sql` once for the contact form (`supabase/README.md`).

## Check it

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run test:sql
```

`npm run test:sql` needs a local PostgreSQL. `npm run smoke` plays a whole game through the API against a running server.

### End-to-end tests (real browsers)

`npm run e2e` plays the site the way people do — several "phones" at once (separate browser contexts with Android and
iPhone settings), plus the API checks. About 110 cases, 3–4 minutes. It needs a **running** server and Playwright:

```bash
npm install -g playwright && npx playwright install chromium   # once per computer; Playwright is deliberately not in package.json
```

```bash
npm run build && npx next start -p 3000
```

```bash
BASE_URL=http://localhost:3000 npm run e2e
```

- `npm run e2e -- live` runs the spec files whose name contains "live"; `npm run e2e -- CLM- LIVE-07` runs cases by id.
- Results and screenshots of failures go to `e2e/.results/` (not committed). `E2E_HEADED=1` shows the browsers.
- Run it against a server in memory mode with rate limits ON (the default). Each simulated device sends its own
  `X-Forwarded-For` so the per-address limits behave as they would with real phones.
- The cases, what each one checks and the last full results are in `docs/qa/` (`TEST_PLAN.md`, `QA_REPORT_USER.md`).

## Layout

| Path | What |
|---|---|
| `src/app/` | Routes: `/`, `/host`, `/host/prizes`, `/join`, `/g/[code]`, the content pages above, `/privacy`, `/terms`, and the API under `/api` |
| `src/components/` | Design system (see `docs/COMPONENTS.md`) |
| `src/features/` | Website (with `website/guide/`: the content pages and the contact form), host setup, join, game (join card, lobby, live, results) |
| `src/core/` | Game rules: tickets, 26 winning patterns, engine, tests |
| `src/server/` | Game storage (memory or Supabase), realtime ping, rate limits, admin sign-in and statistics (`admin/`) |
| `src/lib/` | Browser helpers: device token, API client, live game hook, sharing, caller voice |
| `supabase/` | Database schema, tests, setup guide |
| `e2e/` | End-to-end suite: `run.mjs` (runner), `lib.mjs` (helpers), `specs/*.spec.mjs` |
| `docs/` | Design handoff, build notes, API reference, admin guide, QA plan and report (`docs/qa/`) |

## Rules the code enforces

- A player's ticket and dabs are never sent to anyone else. Browsers never talk to the database; the server decides every rule.
- Only the host can start, call numbers, switch auto-call and start a new round. Only called numbers can be dabbed. Claims are checked on the server.
- No payments. An optional ticket price is shown for information only.
- Games stop working 24 hours after the last activity, and their tickets and dabs are erased then. A summary of each game (no tickets) is kept for 90 days for the admin panel, then deleted.
- For the operator only, the server records each visitor's IP address and the approximate location it points to, device details and usage events (first-party, no outside analytics). They are never part of a public page or API answer, are deleted after 90 days, and one device can be erased on request. The Privacy Policy (`/privacy`) says so.
