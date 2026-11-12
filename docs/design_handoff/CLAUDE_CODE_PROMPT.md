# Prompt for Claude Code (v2 — responsive web, no sign-up)

Copy everything below the line into Claude Code, with the whole `design_handoff_letsplaytambola_web` folder in (or attached to) the repo.

---

You are building **Letsplaytambola v2**: a responsive website (mobile browser first, desktop too) where anyone can host a Tambola (Housie) game **without signing up**, share a link, and friends join by **typing their name**. The audience is mainly women aged 30–70 in India: big tap targets, plain words, high contrast.

**This replaces the earlier v1 plan.** If the repo already has v1 code (phone OTP, Google/Apple sign-in, usernames, contacts, friends, groups, profiles, an Expo app), make these changes:
1. **Remove all authentication.** Drop phone OTP, Google/Apple, usernames, the onboarding and login screens, and any auth guards. Replace them with an anonymous **device token** (UUID in localStorage, or a Supabase anonymous session) that identifies host and players.
2. **Remove** contacts access and hashed matching, friends, groups, the profile, the Games history tabs and the people pickers. Remove bottom tabs and the sidebar.
3. **Host flow** becomes: `/host` (your name, game name with quick picks, optional ticket price, "Deal me a ticket" toggle, Ways to win row) → `/host/prizes` (3 presets + all 26 patterns) → "Create game & get link" → lobby at `/g/:code`.
4. **Invite** = one short link `/g/:code` plus a 5-letter code. Share via WhatsApp `https://wa.me/?text=`, the system share sheet, or copy link. Drop the per-contact send lists.
5. **Join** = open the link, see "<Host> invited you to <Game>", type your name, tap Join, and get a ticket dealt at once. Same device + same link means you go back to your ticket.
6. Keep the realtime game, the voice caller, the 26 patterns, server-side claim checks, the win banner, results and "Play again with same people" (same link, fresh tickets).
7. Remove settle-up and payments tracking beyond the optional ticket price shown on the invite.
8. Pause the native app work. The website shows the apps as "Coming soon".
9. **Delete** the corresponding database tables, RLS policies, edge functions and env vars (OTP provider, Google/Apple keys).

**Read first:** `README.md` (source of truth: routes, screens, rules, data model, tokens, responsive rules). Then open `prototype/Mobile Preview.dc.html` in a browser (keep `support.js` beside it) to see all 8 mobile screens live. `prototype/Letsplaytambola Play.dc.html` holds the exact game logic in its `<script>` (ticket generation, pattern checks, voice). The `.dc.html` files are **design references, not code to ship**.

**Stack (unless the repo already has one):** Next.js (App Router) + TypeScript; Supabase Postgres + Realtime (one channel per game) + RPC/Edge Functions for draw, claim and join; Web Speech API for the caller; fonts Baloo 2 and JetBrains Mono via next/font. Deploy on Vercel.

**Build in this order, committing after each step:**
1. Design tokens + base components (Button, Pill, Input, Toggle, Card, Sheet, Toast, Ticket, Board, Ball, Avatar, Logo as SVG, SiteHeader with mobile menu, SiteFooter).
2. Website `/` with every section in README order, fully responsive. Hero code box → `/g/CODE`.
3. Device token, the `games / players / prizes / events` schema with RLS, and the RPCs: `create_game`, `join_game`, `start_game`, `call_next`, `set_auto`, `claim`, `new_round`.
4. `/host` and `/host/prizes`, then `/join` and the not-found screen.
5. `/g/:code`: Join → Lobby (live player list, WhatsApp share) → Live (caller, host controls, auto-call, ticket dabbing, claim sheet, win banner, board, players) → Results / Play again. Everything realtime.
6. Edge cases: reconnect and resync, host leaves (the game continues when they come back; host token only), joining a finished game, duplicate names, 24h expiry, iOS speech unlock.
7. Tests: ticket generation (3×9, 5 per row, column ranges, 1–3 per column) and every pattern in `data/winning-patterns.json`; RPC permission tests (only the host can call or start; a player can only mark their own ticket).
8. Lighthouse mobile ≥ 90; check at 360, 390, 768, 1024 and 1440px widths.

**Rules:**
- Match the prototype's layout, colours, type and copy. Where the README and the prototype differ, follow the README.
- Never show another player's ticket. Only the host can draw. Only called numbers can be dabbed. Claims are validated on the server.
- No real money. The price is labelled "Collected outside the app".
- Minimum text 15px, inputs ≥ 16px, tap targets ≥ 44px. Main buttons 60–64px.
- Ask me before adding anything not in the README.

Start by reading `README.md`, then list what you will remove or change in the existing code (if any) and propose the folder structure and schema before writing code.
