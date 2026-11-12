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

## Layout

| Path | What |
|---|---|
| `src/app/` | Routes: `/`, `/host`, `/host/prizes`, `/join`, `/g/[code]`, `/privacy`, `/terms`, and the API under `/api` |
| `src/components/` | Design system (see `docs/COMPONENTS.md`) |
| `src/features/` | Website, host setup, join, game (join card, lobby, live, results) |
| `src/core/` | Game rules: tickets, 26 winning patterns, engine, tests |
| `src/server/` | Game storage (memory or Supabase), realtime ping, rate limits |
| `src/lib/` | Browser helpers: device token, API client, live game hook, sharing, caller voice |
| `supabase/` | Database schema, tests, setup guide |
| `docs/` | Design handoff, build notes, API reference |

## Rules the code enforces

- A player's ticket and dabs are never sent to anyone else. Browsers never talk to the database; the server decides every rule.
- Only the host can start, call numbers, switch auto-call and start a new round. Only called numbers can be dabbed. Claims are checked on the server.
- No payments. An optional ticket price is shown for information only.
- Games are removed 24 hours after the last activity.
