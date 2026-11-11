# Build notes for contributors (read before writing a screen)

**Product**: Letsplaytambola — host/play Tambola (Housie) with family & friends in India. Audience: women 30–70. Simplicity, big tap targets, clear copy.

## Sources of truth
1. `docs/design_handoff/README.md` — PRD + design spec. **Wins on conflicts.**
2. `docs/design_handoff/prototype/TambolaPhone.dc.html` — hi-fi prototype. Script (logic + all copy strings) is lines 814–1432.
   `docs/design_handoff/prototype/markup-condensed.txt` is the same file's markup (lines 1–813) with colours replaced by token names
   (BG, SURF, SURF2, LINE, CREAM, MUTED, MARI, PINK, TEAL, INK, PAPER, WA) — read the section for your screen and match it closely
   (sizes, spacing, radii, copy). Section starts: login 48, invite 68, home 93, username 162, games 178, friends 193, profile 257,
   create 279, prizes 339, lobby 415, play 468, results 565, settle 598, tab bar 627, sign-in sheet 638, reset sheet 659,
   lobby invite sheet 671, add-friend sheet 688, people picker 707, contacts picker 743, toast 778.

## Hard rules
- Never show another player's ticket or progress. Only the host draws. Only called numbers can be dabbed. No real-money features: prices/prizes are *recorded* only — show "Settled outside the app" where price appears; no payment buttons, no "mark paid".
- **Design fidelity is exact** (owner's instruction, supersedes the earlier 15px rule): use the prototype's exact font sizes, weights, colours, spacing, radii and copy — including its 12–14px secondary text. **Minimum tap target 44px** still applies: keep the prototype's visual size and extend the touch area with `hitSlop`.
- Do not add features that are not in the README.
- README overrides prototype: sign-in is phone + OTP first (then Google, Apple); guests join from a link with just a name and skip the username step; host's own ticket is not a cost in host's net.

## Stack & conventions
- Expo SDK 58, React Native 0.88, React 19, Expo Router, TypeScript strict. One codebase for iOS, Android and web (React Native Web) — everything must work on web too. No extra dependencies without a strong reason (not installed: reanimated, gesture-handler, zustand, any icon library). Animations use React Native's built-in `Animated`. `boxShadow` string styles work on all platforms in this RN version.
- Path aliases: `@/…` → `src/…`, `@core/…` → `packages/game-core/src/…` (import core files WITH the `.ts` extension, e.g. `import { RULES } from '@core/data.ts'`).
- Theme: `src/theme/tokens.ts` (`C` colours, `F` fonts, `R` radii, `MOTION`, `CONTENT_MAX`, `PLAY_MAX`, `WIDE`). Never hard-code brand colours.
- UI kit: `import { … } from '@/ui'` — `T` (text; props size, w 500|600|800, color, mono, center, lh), `Eyebrow`, `Btn` (variants primary|teal|cream|whatsapp|black|outline|ghost|ink|dashed; h; lip), `LinkBtn`, `IconBtn`, `BackBtn`, `Avatar`, `Faces`, `initial()`, `first()`, `Toggle`, `Stepper`, `Input`, `Chip`, `Card`, `Row`, `Empty`, `LiveDot`, `CardIn`, `Sheet` (bottom sheet; `height` fraction; `light`), `toast(msg)`, `Logo`, `MiniTicket`, `TicketView`, `Screen` (scroll container with `footer` for sticky CTAs), `HandleCopy`, `copyText`. Read these files first; extend the kit rather than duplicating styles (small additive changes are fine).
- Data: only through `backend` from `@/backend` (interface in `src/backend/types.ts`). Game mutations: `backend.act(code, action)` → on `{ok:false,error}` call `toast(error)`. Game rules live in `packages/game-core` (`data.ts`, `ticket.ts`, `patterns.ts`, `autosplit.ts`, `engine.ts`, `stats.ts`) — never re-implement rules in UI code.
- State: `src/state/session.ts` (`useUser()`, `session`, `refreshUser()`, `setPendingCode(code|null)` — the invite code survives reloads: sessionStorage on web, AsyncStorage on native), `src/state/settings.ts` (`settings`, `setSetting` — `muted`, `autoDab`), `src/state/invites.ts`, tiny store helper `src/lib/store.ts`.
- Helpers: `src/lib/links.ts` (`gameLink`, `parseCode`, `openWhatsApp(text, phone?)`, `shareSheet`), `src/lib/speech.ts` (`say`, `hush`), `src/lib/ads.tsx` (`<AdSlot placement>` — renders nothing for now; place only where docs/ADS.md says).
- Routes (Expo Router, `app/`): `/sign-in`, `/username`, `/(tabs)` (index, games, friends, profile), `/new`, `/prizes`, `/g/[code]` (invite landing → lobby → play → results, chosen in `app/g/[code]/index.tsx`), `/g/[code]/settle`. Route files stay thin; screens live in `src/features/*`.
- Live game view: `useGame(code, uid)` (`src/features/game/useGame.ts`) subscribes and also refetches when the app returns to the foreground, the tab becomes visible or the browser comes back online; call `resyncGame(code)` to force a fresh copy. A render crash is caught by the boundary in `app/_layout.tsx` ("Something went wrong" / "You’re offline" + "Try again").
- Money: `formatINR` from `@core/stats.ts`. Accessibility: `accessibilityLabel`/`accessibilityRole` on every pressable.
- Do not run git commands. Do not edit files outside your assignment except small additive changes to `src/ui/*` (tell the lead).
- Finish by running `npx tsc --noEmit -p .` and fixing every error in your files.
