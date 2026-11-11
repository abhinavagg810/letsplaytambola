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

The last one needs a local PostgreSQL; it applies the migration and proves the privacy rules (nobody can read another player's ticket).

## Layout

| Path | What |
|---|---|
| `app/` | Routes (thin). `/g/[code]` is the shared invite link: landing → lobby → play → results |
| `src/features/` | Screens: auth, home (tabs), friends, create, game |
| `src/ui/`, `src/theme/` | Base components and design tokens |
| `src/backend/` | `Backend` interface with two implementations: `local` (demo) and `supabase` |
| `packages/game-core/` | Tickets, 26 winning patterns, auto-split, game engine, results maths, tests |
| `supabase/` | Migration, Edge Function `game`, RLS tests, setup guide |
| `docs/design_handoff/` | Original PRD, prototypes, assets and seed data |
| `docs/ADS.md` | Plan for Google ads (not switched on) |

## Product rules that the code enforces

- A player's ticket and progress are never sent to anyone else (separate owner-only table; views are projected per viewer).
- Only the host draws. Only called numbers can be dabbed. Claims are checked on the server.
- No real-money features: ticket price and prizes are recorded only and settled outside the app.
