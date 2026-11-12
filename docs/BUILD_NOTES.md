# Build notes — Letsplaytambola v2 (responsive website, no sign-up)

Read before writing anything. v1 (Expo app with accounts) lives on the git branch `v1-expo-app`; `main` is v2 only.

## Sources of truth
1. `docs/design_handoff/README.md` — **wins on conflicts** (routes, screens, rules, tokens, responsive rules, copy).
2. `docs/design_handoff/prototype/*.dc.html` — hi-fi references. Match layout, colours, type and copy closely. `Letsplaytambola Play.dc.html` holds the exact game logic in its `<script>`; `Letsplaytambola Website.dc.html` is the marketing page; `SiteHeader`/`SiteFooter`/`Logo` are shared pieces; `Mobile Preview.dc.html` shows 8 phone screens.
   To render a prototype in the sandbox: serve `docs/design_handoff/prototype/` over a local static HTTP server (not file:// — nested `<dc-import>` components load over XHR) and open it with Playwright, routing `unpkg.com/react*` and `fonts.googleapis.com` to local files — a working helper to copy/adapt is `/tmp/claude-0/-home-user-letsplaytambola/31430357-1729-5b0f-a95f-e62c081b0278/scratchpad/proto.js` (its font paths point at an old folder: take the TTFs from `node_modules/next/dist/compiled/@vercel/og` or download via `npm i @fontsource/baloo-2 @fontsource/jetbrains-mono` into a scratch folder — do not add them to the app).
3. Seed data: `docs/design_handoff/data/*.json`.

## Hard rules
- **No authentication, no accounts.** Never say "account", "log in" or "sign up" except to say it isn't needed.
- Never send another player's ticket or dabs to a browser. Only the host can start, draw, toggle auto-call, start a new round. Only called numbers can be dabbed. Claims are validated on the server. Draws happen on the server.
- No real money. The optional ticket price is information only: "Collected outside the app".
- Minimum text 15px (JetBrains Mono labels 12px as specified), inputs ≥ 16px (iOS zoom), tap targets ≥ 44px, main buttons 60–64px.
- Out of scope: accounts, friends, groups, contacts, history, payments/settle-up, native apps, chat, reactions, auto-mark. Do not add features that are not in the README.

## Stack
- **Next.js 16 (App Router) + React 19 + TypeScript**, deployed on Vercel. ⚠ Next 16 differs from older versions — read `AGENTS.md` and the relevant guide under `node_modules/next/dist/docs/` before using an API (params are async, etc.).
- Styling: plain CSS. Tokens as CSS variables in `src/app/globals.css` using the README's **OKLCH source values** (exact colours). Components use CSS Modules (needed for media queries / :hover / keyframes); small one-off styles may be inline. No Tailwind, no UI library, no icon library.
- Fonts: Baloo 2 (500/600/800) and JetBrains Mono (500) via `next/font/google` → CSS variables `--font-baloo`, `--font-mono`. (If the sandbox cannot reach Google Fonts at build time, use `next/font/local` with files from `@fontsource/*` copied into `src/fonts/` — builds must work offline and on Vercel.)
- Tests: Vitest (`npm test`). E2E checks with Playwright, which is installed globally in the sandbox (`require('playwright')`; `chromium.launch()`; do NOT install it or add it to package.json).

## Architecture (decided)
```
src/
  app/                    routes: / , /host , /host/prizes , /join , /g/[code] , /privacy , /terms , not-found
    api/games/route.ts            POST create
    api/games/[code]/route.ts     GET  view for this device
    api/games/[code]/act/route.ts POST one action
    api/notify/route.ts           POST "notify me" number
  components/             design system (Button, Pill, Input, Toggle, Card, Sheet, Toast, Ticket, Board, Ball, Avatar, Logo, SiteHeader, SiteFooter)
  features/               website/, host/, join/, game/ (Join, Lobby, Live, Results, ClaimSheet, WinBanner, voice)
  lib/                    client helpers: device token, api client, useGame hook, share links, speech
  server/                 store adapters (memory | supabase), realtime ping, rate limit, request helpers
  core/                   pure game logic shared by server and client: data, ticket, patterns, engine, types (+ tests)
supabase/migrations/      SQL schema
```
- **Identity:** a random device token (UUID) created on first visit, kept in `localStorage`, sent as the `x-device-token` header. The server stores only its SHA-256 hash. Host = the token that created the game. Players get a public `pid` (short random id) — tokens never appear in any response.
- **All reads and writes go through the Next.js API routes** (server-side, Supabase *service role* key). Browsers never talk to the database directly, so every table has RLS enabled with **no policies** (anon can read/write nothing). This is how ticket privacy and host-only actions are enforced; the same pure engine in `src/core` decides every rule.
- **Store adapter** (`src/server/store`): `memory` (default when Supabase env vars are absent — a process-global Map, so `npm run dev` gives a real multi-device game on the local network with zero setup) and `supabase` (production; needed on Vercel because serverless instances don't share memory). Optimistic concurrency by `version`: load → engine → compare-and-swap commit → retry on conflict (first valid claim wins).
- **Realtime:** after each commit the server sends a tiny "changed" ping `{v}` on Supabase Realtime Broadcast channel `g:CODE`; browsers (anon key) refetch their view on ping. Polling is always on as a fallback (fast when no realtime, slow when realtime is connected), plus refetch on focus/online/visibility. The ping carries no game data.
- **View per device:** `GET /api/games/CODE` returns the public game + `you: { role: 'host'|'player'|'visitor', pid?, ticket?, marks? }`. Visitors get the invite info only (host name, game name, player count, ways to win, price).
- **Auto-call** runs as a timer in the host's browser that calls the draw action (6s default; 4/6/8/10). If the host leaves, calling pauses and resumes when they return.
- **Expiry:** games are unusable 24h after last activity (treated as not found) and purged by a SQL function.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server only), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (realtime ping only), `NEXT_PUBLIC_SITE_URL` (share links; default from the request origin).

## Conventions
- Server Components by default; `'use client'` only where needed. Game screens are client components fed by `useGame(code)`.
- Never import `src/server/*` from client code. `src/core/*` is pure TS (no Node/DOM APIs; `rng` and `now` are passed in).
- Accessibility: real `<button>`/`<a>`/`<input>` elements with labels; visible focus rings; `aria-live` for toasts and the win banner; respects `prefers-reduced-motion`.
- Do not run git commands (the lead commits). Stay inside the files assigned to you; shared files need additive, compatible edits only — re-read a file right before editing it.
- Finish with `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` all passing for your part.
