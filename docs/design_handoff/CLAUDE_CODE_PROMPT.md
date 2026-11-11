# Prompt for Claude Code

Copy everything below the line into Claude Code, with this whole `design_handoff_letsplaytambola` folder in (or attached to) the repo.

---

You are building **Letsplaytambola**, a mobile + web app for hosting and playing Tambola (Housie) with family and friends in India. The audience is mainly women aged 30–70, so prioritise simplicity, large tap targets and clear copy.

Everything you need is in `design_handoff_letsplaytambola/`:
- `README.md` — the full PRD and design spec (screens, rules, data model, design tokens, motion, edge cases). Treat it as the source of truth.
- `prototype/*.dc.html` — high-fidelity HTML prototypes. Open `prototype/Tambola App.dc.html` in a browser (keep `support.js` next to it) to click through host + player side by side; click **Load sample past games** to see history/results. `prototype/TambolaPhone.dc.html` contains all screen markup and game logic (ticket generation, claim checking, auto-split, voice caller) — read its `<script>` for exact behaviour. These are **design references, not code to ship**; recreate them properly in the stack below.
- `assets/` — logo PNGs and app icon. Recreate the logo as SVG following README §8.
- `data/number-callouts.json` and `data/winning-patterns.json` — use as seed data.

**Stack (unless the repo already has one):**
- Expo (React Native + TypeScript) for iOS/Android, with Expo Router; React Native Web or a Next.js app for the web version sharing the same components/hooks.
- Supabase: Auth (phone OTP primary, Google, Apple), Postgres, Realtime channel per game, Edge Functions for server-side claim validation and draws.
- expo-contacts (hashed phone matching), expo-speech (voice caller, prefer en-IN), deep links + deferred deep linking for invites, WhatsApp share via `https://wa.me/<phone>?text=` and the system share sheet.
- Fonts: Baloo 2 (500/600/800) and JetBrains Mono (500).

**Build in this order, committing after each step:**
1. Design tokens + base components (Button, Card, Pill, Avatar, Sheet, Toggle, Stepper, Ticket, Board, Ball, Logo) matching README §7 exactly.
2. Auth + onboarding (phone OTP, Google/Apple, auto-suggested username editable later) and the profile model.
3. Home / Games / Friends / Profile tabs (bottom tabs on mobile, sidebar on web) with friends, groups, contacts-based adding and pending invites.
4. Create game (Who’s playing card, People picker, Contacts picker, seats, price, optional prizes with presets, auto-split and the “More ways to win” library of 26 patterns).
5. Lobby with WhatsApp group share + per-contact send list, invited/joined players, ticket preview.
6. Realtime play: host draw + auto-call, ball animation, callouts + TTS, dabbing, private “NEEDS n”, claims validated server-side with win/bogey broadcast, inline win banner + confetti (never navigate away), reactions, board, Prizes & winners list, Players list, Reset sheet.
7. Results (podium + winners), Settle up (record only — **no in-app payments**), Save players as group, Next round.
8. Games history + profile stats; empty, loading, error and offline/reconnect states.
9. Tests for ticket generation (3×9, 5 per row, column ranges) and every winning pattern in `winning-patterns.json`.

**Rules:**
- Match the prototype’s layout, colours, typography, copy and motion closely; where the README and prototype differ, follow the README.
- Never show another player’s ticket progress. Only the host can draw. Only called numbers can be dabbed.
- No real-money features. Label prices “Settled outside the app”.
- Minimum body text 15px, minimum tap target 44px; support Dynamic Type.
- Ask me before adding features that are not in the README.

Start by reading `README.md` and `prototype/TambolaPhone.dc.html`, then propose the project structure and data schema before writing code.
