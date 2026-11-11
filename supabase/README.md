# Supabase backend

Production data layer for Letsplaytambola. The app talks to it through `src/backend/supabase.ts`;
with no Supabase env vars set the app runs in demo mode instead (`src/backend/local.ts`).

```
migrations/0001_init.sql   schema, row-level security, RPCs, realtime
migrations/0002_delete_account.sql   delete_my_account() — "Delete my account" in the app
functions/game/index.ts    the ONLY write path for games (runs packages/game-core)
functions/_shared/core/    git-ignored copy of packages/game-core/src (npm run sync:core)
tests/                     RLS smoke test against a plain local PostgreSQL
```

## How it fits together

- **Privacy.** `games.doc` (the public `GameDoc`) is readable by the game's members. Each player's
  ticket and dabs are one row in `tickets`, readable only by that player (`user_id = auth.uid()`),
  and never published to Realtime. The host's phone-contact invites live in `game_contacts` (host only).
- **Writes.** Clients have no insert/update/delete rights on `games`, `tickets`, `game_members`,
  `game_invites`, `game_contacts`. The `game` Edge Function verifies the caller's JWT, loads the doc and
  only the tickets the action needs, runs `applyAction` from the shared engine, and persists everything
  in one transaction through `commit_game()`.
- **Simultaneous claims.** `commit_game` only writes if `games.version` is still the one that was
  loaded (and each ticket's `rev` likewise). The loser gets SQLSTATE 40001, the function reloads and
  re-runs the engine (max 5 tries), which now answers "Full House already went to Asha".
- **Realtime.** Clients subscribe to `postgres_changes` on `games` filtered by code (RLS applies), then
  fetch their own ticket. They refetch on every (re)subscribe, so a player who was offline catches up.
- **Contact matching.** The device sends `sha256(digits)`; the server compares
  `hmac(that, secret)` against `profile_phones`, which clients cannot read. Hashes are written by a
  trigger from the **verified** `auth.users.phone` — a client cannot claim someone else's number.
  When an invited contact verifies their phone, `pending_invites` rows turn into friendships both ways.

## Setup

1. **Create a project** at <https://supabase.com/dashboard> (region: Mumbai `ap-south-1` for Indian players).
   Install the CLI (`npm i -g supabase` or `brew install supabase/tap/supabase`), then from the repo root:

   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

2. **Auth providers** — Dashboard → Authentication → Sign In / Providers:
   - **Phone**: enable, pick an SMS provider (see "SMS in India" below). OTP length 6, expiry 300 s.
   - **Anonymous sign-ins**: enable (guests who join from an invite link). Turn on CAPTCHA or keep the
     default rate limit to stop abuse.
   - **Google**: enable; create OAuth credentials in Google Cloud (Web client). Authorised redirect URI:
     `https://<project-ref>.supabase.co/auth/v1/callback`.
   - **Apple**: enable. Client IDs = your iOS bundle id `com.letsplaytambola.app` (native sign-in) plus a
     Services ID for web/Android OAuth; add the Apple secret key for the OAuth flow.
   - Authentication → **URL Configuration**: Site URL = your web URL (`EXPO_PUBLIC_WEB_URL`); add redirect
     URLs `https://<your-web-domain>/**`, `http://localhost:8081/**` and `letsplaytambola://**` (native).

3. **Database**

   ```sh
   supabase db push
   ```

   This applies `migrations/0001_init.sql` and `0002_delete_account.sql`. It needs the `citext` and `pgcrypto` extensions (created in
   the `extensions` schema, which is where Supabase keeps them).

4. **HMAC secret for phone hashes.** The migration inserts a random secret, so nothing is required. If
   you want to control it (e.g. the same value across staging/prod), set it **before the first user
   signs up** — changing it later orphans every stored hash. SQL editor:

   ```sql
   update public.app_secrets set value = '<64 random hex chars>' where name = 'phone_hmac';
   -- e.g. generate one with:  select encode(extensions.gen_random_bytes(32), 'hex');
   ```

5. **Deploy the Edge Function**

   ```sh
   npm run deploy:functions      # = npm run sync:core && supabase functions deploy game
   ```

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform; there are no other
   secrets. `config.toml` sets `verify_jwt = true`. Re-run this command whenever
   `packages/game-core` changes — the function bundles a copy of it.

6. **Realtime.** The migration adds `games` to the `supabase_realtime` publication. Check
   Dashboard → Database → Publications shows `games` (and only `games`) enabled.

7. **Point the app at it** — copy `.env.example` to `.env`:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
   ```

   Restart `expo start` (env vars are inlined at build time). Never ship the service-role key.

## SMS in India (DLT)

Indian carriers drop A2P SMS that isn't registered under TRAI's DLT rules. Before launch:

1. Register your business as a **Principal Entity** on a DLT portal (Jio, Airtel, Vi, BSNL — any one).
2. Register a 6-character **Header / Sender ID** (e.g. `TAMBLA`) and an OTP **content template**, e.g.
   `Your Letsplaytambola code is {#var#}. Do not share it with anyone.` (category: Transactional/OTP).
3. Use a provider that passes the DLT entity + template IDs: **Twilio** (built into Supabase Auth —
   check the dashboard's current provider list), or an Indian gateway such as **MSG91** through the
   *Send SMS* auth hook. Set the Supabase SMS template
   (Authentication → Phone) to exactly the approved text with `{{ .Code }}` in place of `{#var#}` —
   a mismatch is silently blocked by the carrier.
4. Approval usually takes 2–7 working days; plan for it. International numbers don't need DLT.

## Test OTP numbers

Authentication → Phone → **Test phone numbers and OTPs** lets you pin codes without sending SMS, e.g.

```
919810011001=123456, 919810011014=123456
```

Use these for development, CI and App Store / Play review accounts (give reviewers a test number and
its code). They are valid until the date you set there.

## Testing the SQL locally

No Docker needed — any PostgreSQL (tested on 16) with `citext` and `pgcrypto` available:

```sh
supabase/tests/run.sh
```

It creates a throwaway database, applies `tests/stub_supabase.sql` (API roles, `auth.users`,
`auth.uid()`, the realtime publication, Supabase's wide default grants), applies the migrations and
runs `tests/rls_smoke.sql`, which fails loudly unless: players can't read each other's tickets,
non-members can't read a game, members can, clients can't write game state (with and without table
grants), `peek_game` works signed-out, and pending invites turn into friendships.

The Edge Function has its own check (needs Deno — `npm i -g deno`):

```sh
npm run test:functions
```

It type-checks `functions/game/index.ts` and runs `functions/game/handler_test.ts`, which drives the real
request handler against an in-memory fake of the database API (auth, create, join, host-only actions,
retry after a lost race). Neither test talks to a real Supabase project or covers the client in
`src/backend/supabase.ts`; test those against a real project (or `supabase start`, which needs Docker)
with two test phone numbers.
