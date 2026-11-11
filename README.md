# Letsplaytambola

Host and play Tambola (Housie) with family and friends — one codebase for iOS, Android and web.

- **App**: Expo SDK 58, React Native, TypeScript, Expo Router (web via React Native Web)
- **Backend**: Supabase (Auth with phone OTP / Google / Apple / guest, Postgres with row-level security, Realtime, one Edge Function)
- **Game rules**: `packages/game-core` — pure TypeScript shared by the app and the server

## Run it

```bash
npm install
```

```bash
npm run web
```

With no environment variables the app runs in **demo mode**: everything is stored on the device, the OTP code is `123456`,
and on web each browser tab can be a different person (open the invite link in a second tab to play against yourself).

For the real backend, copy `.env.example` to `.env`, fill in the Supabase URL and anon key, and follow `supabase/README.md`.

## Check it

```bash
npm test
```

```bash
npm run typecheck
```

```bash
bash supabase/tests/run.sh
```

The last one needs a local PostgreSQL; it applies the migrations and proves the privacy rules (nobody can read another
player's ticket) and that "Delete my account" removes one person's data and nobody else's.

All the scripts:

| Script | What it does |
|---|---|
| `npm run web` / `ios` / `android` | Start the app in development |
| `npm run build:web` | Export the website to `dist/` (what Vercel/Netlify deploy) |
| `npm test`, `npm run typecheck` | Unit tests (Jest), TypeScript |
| `npm run test:sql` | The database test above (`bash supabase/tests/run.sh`) |
| `npm run check:functions` | Type-check the Supabase Edge Function (needs [Deno](https://deno.com)) |
| `npm run test:functions` | Run the Edge Function's handler tests against a mocked database (needs Deno) |
| `npm run sync:core` | Copy the shared game rules into the Edge Function folder (the two scripts above and `deploy:functions` do this first) |
| `npm run deploy:functions` | Deploy the Edge Function to your Supabase project |
| `npm run assets` | Regenerate icons and splash from the designer's artwork (Python 3 + Pillow; only when the artwork changes) |

## Going live

**[`docs/RELEASE.md`](docs/RELEASE.md)** is the step-by-step launch checklist: Supabase, SMS codes in India, Google/Apple
sign-in, the website, links that open the app, store builds and the store forms, and a pre-launch test.

## Privacy policy, terms, deleting an account

- `/privacy` and `/terms` are public pages of the app (`app/privacy.tsx`, `app/terms.tsx`; the text lives in
  `src/features/legal/`). They are linked from the sign-in screen and from Profile, and `/privacy` is the URL to give the
  app stores. **The text is a draft and must be reviewed by a lawyer before launch** — see `docs/RELEASE.md` section 12.
- Profile → *Delete my account* removes the account for good (`Backend.deleteAccount()`; on Supabase the
  `delete_my_account()` function in `supabase/migrations/0002_delete_account.sql`). Games the person played stay in
  their friends' history under the name "Deleted player".

## Layout

| Path | What |
|---|---|
| `app/` | Routes (thin). `/g/[code]` is the shared invite link: landing → lobby → play → results. `/privacy`, `/terms` are public |
| `src/features/` | Screens: auth, home (tabs), friends, create, game, legal |
| `src/ui/`, `src/theme/` | Base components and design tokens |
| `src/backend/` | `Backend` interface with two implementations: `local` (demo) and `supabase` |
| `packages/game-core/` | Tickets, 26 winning patterns, auto-split, game engine, results maths, tests |
| `supabase/` | Migrations, Edge Function `game`, RLS tests, setup guide |
| `docs/RELEASE.md` | Going-live checklist (hosting, stores, legal) |
| `docs/design_handoff/` | Original PRD, prototypes, assets and seed data |
| `docs/ADS.md` | Plan for Google ads (not switched on) |

## Product rules that the code enforces

- A player's ticket and progress are never sent to anyone else (separate owner-only table; views are projected per viewer).
- Only the host draws. Only called numbers can be dabbed. Claims are checked on the server.
- No real-money features: ticket price and prizes are recorded only and settled outside the app.
