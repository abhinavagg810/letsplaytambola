# API, engine and client data layer

Everything a screen needs is in `src/lib` (browser) and `src/core` (shared rules and types).
Screens should not call `fetch` themselves.

```
browser ── src/lib/useGame ── src/lib/api ──► /api/games…  (src/app/api)
                                                   │
                                     src/server/games.ts   load → engine → compare-and-swap commit → retry
                                       │            │
                              src/core/engine   src/server/store  (memory | supabase)
                                                    │
                                     after the response: realtime ping { v } on channel g:CODE
```

## Identity
- Each browser makes a random UUID once (`getDeviceToken()`, kept in `localStorage` as `lpt:token`) and sends it as the `x-device-token` header.
- The server stores only `SHA-256(token)`. The device that created a game is its **host**; a device that joined is a **player** with a public `pid`. Tokens and hashes never appear in a response.
- Who you are is decided from the header only — nothing in a request body can name another player.

## HTTP routes
All responses are JSON with `Cache-Control: no-store`. Handlers run per request (never prerendered).
Success: `{ ok: true, … }`. Failure: `{ ok: false, error, code }` where `error` is user-facing copy ready for a toast.

| Route | Body | Success | Notes |
|---|---|---|---|
| `POST /api/games` | `CreateGameInput` | `201 { ok, code }` | token required |
| `GET /api/games/:code` | – | `200 { ok, game: GameView }` | token optional (none = visitor). Not found / expired: `404 { ok:false, error, code:'not_found', notFound:true }` |
| `POST /api/games/:code/act` | `GameAction` | `200 { ok, game: GameView }` (the fresh view for this device) | token required |
| `POST /api/notify` | `{ phone }` — an Indian mobile number: 10 digits starting 6–9; spaces, dashes and a leading `+91` / `0` are ignored | `200 { ok }` | token optional. Anything else: `400 invalid` "Please type a 10-digit Indian mobile number (it starts with 6, 7, 8 or 9)" |
| `POST /api/t` | a batch of usage events (below) | `204`, no body | token optional; see “Usage events” |

`:code` is case-insensitive.

### Status codes
| Status | `code` | When |
|---|---|---|
| 400 | `invalid`, `bad_request` | bad input (empty name, uncalled number, unknown action, body not JSON or > 8 KB) |
| 401 | `no_token` | `x-device-token` missing or not a UUID |
| 403 | `forbidden` | not allowed for this device: a non-host trying start / draw / setAuto / newRound; mark or claim without a ticket |
| 404 | `not_found` | no such game, or idle for more than 24 hours |
| 409 | `state`, `full` | not possible right now (draw before start, join a finished game, new round before the end, game full) |
| 200 + `ok:false` | `not_yet`, `taken` | a claim that was checked and refused. These are normal moments in a game, so they are not HTTP errors |
| 429 | `rate_limited` | too many requests |
| 503 | `busy` | five version conflicts in a row (try again) |
| 500 | `server` | unexpected |

### Rate limits (per server instance, in memory)
| | per device | per IP address |
|---|---|---|
| create | 12 / 10 min | 40 / 10 min |
| join | 30 / 10 min | 300 / 10 min |
| other actions | 600 / min | 6000 / min |
| GET view | 240 / min | 6000 / min |
| notify | 5 / hour | 20 / hour |
| track (`/api/t`) | 120 / min | 1200 / min |

## Usage events — `POST /api/t`
First-party analytics for the operator's admin panel (`docs/ADMIN.md`). No third-party service, no cookie.

```
POST /api/t        Content-Type: text/plain (what navigator.sendBeacon sends) or application/json
{ "sid": "9f1c…",                 // random id of this browser-tab session (8–40 letters, digits, dashes)
  "tk":  "<device token>",        // optional: the same UUID as x-device-token (sendBeacon cannot set headers)
  "src": "whatsapp",              // optional: utm_source, else the referrer's host, else "direct"
  "e": [ { "n": "page_view",      // event name — must be on the server's whitelist
           "o": 1200,             // optional: how many ms ago it happened (capped at 1 hour)
           "p": "/host",          // optional: the path ("/g/K7RQ2" is stored as "/g/[code]")
           "c": "K7RQ2",          // optional: game code
           "d": { "page": "host" } } ] }   // optional: properties — only those listed for that event are kept
```
- Answers `204` with no body. `400` bad JSON or envelope · `413` body over 16 KB · `429` rate limited. At most 50 events
  of a batch are stored; the rest are dropped.
- **Whitelist:** `src/server/insights/events.ts` lists every event name and, per event, the properties it may carry with
  their type, length and allowed values. Unknown events and properties are dropped silently. Nothing free-form is stored.
- **IP address, place and device are taken from the request headers only** (`src/server/client-info.ts`,
  `src/server/insights/ua.ts`): `x-forwarded-for` (first hop) / `x-real-ip`, Vercel's `x-vercel-ip-country`,
  `-country-region`, `-city` (URL-encoded), `-latitude`, `-longitude`, `-timezone`, `-postal-code`, `user-agent`,
  `accept-language`. Nothing in the body can set them. Without those headers (local development) they are null.
- Requests from crawlers and link-preview fetchers are answered `204` and not stored; events from `/admin` pages neither.
- The write happens after the response (`after()`); if the database has not been given migration 0003 it is skipped.
- **Creating and joining a game** also record, for the admin only, the IP address, place and device of that request
  (`participations`). This is never part of any response: the views below are unchanged.

Browser side (`src/lib/track.ts`): `track(name, props?)` queues an event and returns at once; batches go out every 4
seconds, when 20 events wait, and when the tab is hidden or closed (`navigator.sendBeacon`, else `fetch` with
`keepalive`). It never throws and does nothing on the server, on `/admin`, or when the request is blocked.
`<TrackPageViews />` in the root layout starts a session and counts page views; `src/lib/api.ts` reports the funnel
steps that go through the API (create, join, start, first call, auto-call, claims, new round) and what a game page shows.

## Types (`src/core/types.ts`)
```ts
type RuleId = 'early5' | 'early7' | … | 'full';          // the 26 ids in data/winning-patterns.json
type Ticket = number[][];                                // 3 rows × 9 columns, 0 = blank
type GameStatus = 'lobby' | 'live' | 'done';
type AutoSetting = 0 | 4 | 6 | 8 | 10;                   // 0 = off, else seconds between numbers

interface CreateGameInput {
  hostName: string;        // 1–24 characters after trimming
  name?: string;           // ≤ 32; empty → "Tambola Night"
  price?: number;          // whole rupees 0–99999; 0 = none
  hostPlays?: boolean;     // "Deal me a ticket", default true
  prizes: RuleId[];        // ≥ 1, no repeats, display order
  amounts?: Partial<Record<RuleId, number>>; // optional prize money typed per way to win (whole rupees, 0–999999). If any is given the amounts are fixed; otherwise ticket money is split at start
}

type GameAction =
  | { type: 'join'; name: string }             // visitor → player; ticket dealt at once
  | { type: 'start' }                          // host; lobby → live; needs ≥ 1 player
  | { type: 'draw'; after?: number }           // host; live; the server picks the number. `after` = numbers the sender has seen:
                                               //   the draw happens only if exactly that many are called (safe for double taps, retries, two host tabs)
  | { type: 'setAuto'; auto: AutoSetting }     // host; live
  | { type: 'mark'; n: number; on?: boolean }  // own ticket; called numbers only; no `on` = toggle
  | { type: 'claim'; prizeId: string }         // anyone with a ticket; live; checked on the server
  | { type: 'newRound' };                      // host; done → lobby, same code, fresh tickets

interface Prize { id: string; rule: RuleId; label: string; winnerPid: string | null; winnerName: string | null; wonAt: number | null }
interface PublicPlayer { pid: string; name: string; color: string; joinedAt: number }
type GameEvent = { seq: number; at: number } & (
  | { kind: 'join'; pid: string; name: string }
  | { kind: 'start' }
  | { kind: 'call'; n: number }
  | { kind: 'win'; pid: string; name: string; prizeId: string; label: string }
  | { kind: 'round'; round: number });

interface GameDoc {                // public: no tickets, no marks, no tokens
  code: string; name: string; hostName: string;
  hostPid: string | null;          // set when the host also plays
  price: number; status: GameStatus;
  called: number[];                // this round, in call order
  auto: AutoSetting; round: number;
  prizes: Prize[]; players: PublicPlayer[];
  events: GameEvent[];             // the last 30, oldest first
  seq: number;                     // seq of the newest event
  createdAt: number; updatedAt: number;
  version: number;                 // +1 on every public change (marks do not change it)
}

// What a device gets:
type GameView = MemberView | VisitorView;

interface MemberView extends GameDoc {          // host and players
  playerCount: number;
  now: number;                                  // server clock when the view was made
  you:
    | { role: 'host'; name: string; pid?: string; ticket?: Ticket; marks?: number[] }  // ticket only if the host plays
    | { role: 'player'; name: string; pid: string; ticket: Ticket; marks: number[] };
}

interface VisitorView {                         // not joined: only what the Join card shows
  code: string; name: string; hostName: string; price: number; status: GameStatus; round: number;
  playerCount: number;
  prizes: { id: string; rule: RuleId; label: string }[];
  version: number; now: number;
  you: { role: 'visitor' };
}
```
`view.you.role` does not narrow the whole view in TypeScript — use `isMember(view)` / `isVisitor(view)` from `@/core`.

## Rules the engine enforces (`src/core/engine.ts`)
| Action | Who | When | Refusals (copy) |
|---|---|---|---|
| create | anyone | – | `Type your name first` · `Pick at least one way to win` · bad price / unknown or repeated pattern |
| join | not the host | lobby or live | `Type your name to join` · done: `This game has finished — ask <host> to start another round` · `This game is full` (100 seats) |
| start | host | lobby | `Share the link — no one has joined yet` |
| draw | host | live | – (the 90th number ends the game and switches auto-call off) |
| setAuto | host | live | `Auto call can be 4, 6, 8 or 10 seconds` |
| mark | ticket holder, own ticket | live | `<n> hasn’t been called yet` · `<n> isn’t on your ticket` |
| claim | ticket holder | live | `Not yet for <prize> — keep playing!` (no state change, no ping) · `<winner> already won <prize>` |
| newRound | host | done | `Finish this round first` |

Any host-only action from someone else: `Only the host can do that` (403).

Decisions worth knowing:
- **One player may win several prizes** (as in the prototype — there is no "one prize each" rule).
- **Draw is safe to repeat.** The screens always send `{ type: 'draw', after: called.length }`. If another tab or an earlier tap already called the next number the server answers `200` with the current view and calls nothing. Auto-call waits one full interval after it is switched on (or after the host's page opens), then one interval after each number.
- **Names** are trimmed, inner white space is collapsed, and invisible or text-flipping characters (control characters, zero-width space, direction overrides, half an emoji) are removed; a name with nothing visible is refused.
- **A pattern can be picked once per game.** The prototype's picker is a set of toggles; "add again for Second House" in the Full House rule text is not supported in v2.
- **Duplicate names**: compared without regard to case; the second "Meera" is shown as "Meera (2)", the third "Meera (3)". If the host plays, their name counts.
- **A claim counts only dabs of called numbers** (`marks ∩ called`), checked on the server against the claimant's own ticket.
- **Joining twice from the same device** is harmless: you get your existing seat back.
- **A host who chose not to play cannot take a ticket later** in that game.
- **The game ends** when every prize has a winner or all 90 numbers are called.
- **New round**: same code and players, round + 1, called numbers and winners cleared, a fresh ticket for everyone, marks cleared. People can join again once it is back in the lobby.
- **Avatar colours** go by join order and wrap after six.
- **Marks are private**: dabbing changes neither `version` nor anything other devices receive.
- **Expiry**: 24 hours after the last activity. Activity = any action, or a host/player having the game open (counted at most every 30 minutes). A visitor looking at the invite does not count. An expired game answers 404 to everyone; its tickets and dabs are erased, and its public document is kept for 90 days for the operator's admin panel (`docs/ADMIN.md`) before it is deleted. Its code is not handed out again during that time.
- **Server-only fields**: the stored document also has `startedAt`, `finishedAt` (current round) and `history` (a short record of earlier rounds: times, numbers called, winners). `history` is never part of a view sent to a browser.

## Concurrency
Every write is a compare-and-swap on the game's `version` (and, for ticket rows, a per-row `rev`):
load → run the engine → commit only if nothing changed in between → otherwise reload and run the engine
again (up to 5 times). So two claims for the same prize at the same instant resolve as first-wins;
the second is re-checked against the new state and gets "… already won …".

## Realtime
After a commit that changed the public document, the server posts `{ v: version }` as event `changed`
on Supabase Realtime Broadcast channel `g:CODE` (HTTP endpoint `/realtime/v1/api/broadcast`, sent after
the response with `after()`; no websocket on the server). Browsers subscribed with the anon key refetch
`GET /api/games/CODE`. The ping carries no game data. Without Supabase env vars this is a no-op and
browsers poll.

## Browser helpers (`src/lib`)
```ts
// device.ts — SSR-safe (defaults on the server)
getDeviceToken(): string
getSavedName(): string
saveName(name: string): void
isMuted(): boolean
setMuted(muted: boolean): void
subscribeMuted(onChange: () => void): () => void

// useMuted.ts ('use client')
useMuted(): [muted: boolean, setMuted: (muted: boolean) => void]   // off stops the voice; on unlocks speech

// api.ts — never throw
type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string; code: ApiErrorCode; status: number; notFound?: boolean }
createGame(input: CreateGameInput): Promise<ApiResult<{ code: string }>>
getGame(code: string, signal?: AbortSignal): Promise<ApiResult<{ game: GameView }>>
act(code: string, action: GameAction): Promise<ApiResult<{ game: GameView }>>
notifyMe(phone: string): Promise<ApiResult>

// useGame.ts ('use client')
useGame(code: string): {
  game: GameView | null | undefined;     // undefined = loading, null = not found
  error: string | null;                  // set while the server cannot be reached (last view stays)
  act(action: GameAction): Promise<{ ok: true } | { ok: false; error: string; code: ApiErrorCode }>;
  refresh(): Promise<void>;
  realtime: boolean;                     // realtime connected
  serverNow(): number;                   // server clock, for "is this win less than 5s old?"
}

// useAutoCall.ts ('use client') — mount once on the live screen; only does anything for the host
useAutoCall(game: GameView | null | undefined, act: UseGame['act'], serverNow: UseGame['serverNow']): void

// share.ts
gameUrl(code: string): string            // NEXT_PUBLIC_SITE_URL or window.location.origin + /g/CODE
displayUrl(url: string): string          // without https://
inviteText(gameName: string, code: string): string
whatsappUrl(text: string): string        // https://wa.me/?text=…
canShareNative(): boolean
shareNative(data: { title?: string; text?: string; url?: string }): Promise<'shared' | 'cancelled' | 'unavailable'>
copy(text: string): Promise<boolean>
normaliseCode(input: string): string     // accepts a code or a pasted link; '' if nothing usable

// track.ts — first-party usage events (see “Usage events”); never throw, no-ops on the server
track(name: string, props?: Record<string, string | number | boolean | null | undefined>): void   // props.code = game code
flush(closing?: boolean): void           // send what is queued now (true = with sendBeacon)
trackPage(pathname: string): void        // a page view of a normal page
trackGameView(code, view | null): void   // what a game page shows: invite / lobby / live / results / not found
trackToast(message: string): void        // records the KIND of message shown, never its text
startTracking(): void                    // once, from <TrackPageViews />

// speech.ts — no-ops without speech support or when muted
speechSupported(): boolean
unlockSpeech(): void                     // call inside a tap (Join, Start, Sound on) — needed on iOS
speakNumber(n: number): void             // "Two fat ladies! ... 8 and 8, 88"; interrupts the previous number
speakWin(name: string, prize: string): void   // "Meera wins Top Line!", 1.2s later
speak(text: string, opts?: { interrupt?: boolean }): void
stopSpeech(): void
```

How `useGame` stays current: initial fetch; the view returned by each `act`; the realtime ping (when
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set — supabase-js is loaded lazily, only
on a game page); polling every 1.5s without realtime and every 8s with it (paused while the tab is hidden);
a refetch on focus, online and when the tab becomes visible. An older `version` never replaces a newer one.
Actions run one at a time in the order made. `mark` is optimistic: the dab shows at once and is undone if
the server refuses; a number that has not been called is refused locally with the server's own words.
All components calling `useGame` with the same code share one connection.

Useful from `@/core`: `RULES`, `RULE_GROUPS`, `PRESETS`, `matchPreset`, `prizeSummary`, `ruleDesc`,
`ruleName`, `CALLOUTS`, `calloutFor`, `AVATAR_COLORS`, `GAME_NAME_IDEAS`, `DEFAULT_GAME_NAME`,
`AUTO_SECONDS`, `latestWin(doc)`, `winText(name, prize)`, `checkPattern`, `patternNumbers`, `isMember`, `isVisitor`, `COPY`.

## Stores (`src/server/store`)
| | memory | supabase |
|---|---|---|
| Used when | `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are not both set | both set |
| Keeps games | in the Node process (`globalThis`, survives dev hot reload, lost on restart) | Postgres (`supabase/migrations/0001_init.sql`) |
| Good for | `npm run dev`, a game on the home Wi-Fi, tests | production / Vercel |

Interface: `create` (unique code), `load` (null when missing or expired), `commit` (compare-and-swap → `'ok' | 'conflict'`), `touch`, `saveNotifyNumber`, `purge`, the admin reads, and the insights (`trackBatch`, `recordParticipation`, `recordWin`, the aggregates, `eraseDevice` — see `src/server/store/types.ts`).

## Tests
- `npm test` — Vitest: tickets (2,000 seeded), all 26 patterns (checked against `data/winning-patterns.json`), engine flow and permissions, per-device views, the memory store and service (conflict retries, simultaneous claims, expiry), the `useGame` session logic, share helpers.
- `npm run test:sql` — the migrations on a local PostgreSQL: roles, row level security, compare-and-swap, purge; the analytics tables (lock-down, writes, 90-day purge, erase a device) and SQL ↔ TypeScript parity of every aggregate on a seeded dataset.
- `npm run smoke` — plays a whole game over HTTP against a running server (`BASE_URL`, default `http://localhost:8200`).

## Admin API
The operator's admin panel has its own routes under `/api/admin/*` (sign-in, plays / players / events as CSV, erase a device, "Notify me" CSV).
They need the admin session cookie and are documented in `docs/ADMIN.md`. They answer 404 when the admin is switched off.
