# Supabase setup (about 10 minutes)

The website works without Supabase on your own computer (games live in memory). To put it on the
internet (Vercel) you need a Supabase project, because Vercel's servers do not share memory.
Supabase stores the games and sends the instant "something changed" signal to every phone.

## 1. Create the project
1. Go to <https://supabase.com>, sign in, **New project**.
2. Name: `letsplaytambola`. Region: **Mumbai (ap-south-1)** (closest to players in India). Set any database password and keep it safe.
3. Wait until the project says it is ready (1–2 minutes).

## 2. Create the tables
Easiest way — the SQL editor:
1. In the project, open **SQL Editor → New query**.
2. Open the file `supabase/migrations/0001_init.sql` from this repo, copy **all** of it, paste it in, press **Run**.
3. You should see "Success. No rows returned". Under **Table Editor** there are now three tables: `games`, `players`, `notify_numbers`.
   Each shows "RLS enabled" with no policies — that is on purpose: nobody can read them except our own server.

Or, with the Supabase CLI: `supabase link --project-ref <your-project-ref>` then `supabase db push`.

Run it only once. (To start again from scratch: `drop table public.players, public.games, public.notify_numbers cascade; drop function public.commit_game, public.purge_expired_games;` and run the file again.)

## 3. Copy four values into Vercel
In Supabase open **Project Settings → API** (the keys may be on a page called **API Keys**):

| Vercel variable name | Where to find the value |
|---|---|
| `SUPABASE_URL` | "Project URL", looks like `https://abcdefgh.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** key (also called the *secret* key). Click "Reveal". **Keep this private.** |
| `NEXT_PUBLIC_SUPABASE_URL` | the same Project URL again |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **anon** key (also called the *publishable* key) |

In Vercel: **Project → Settings → Environment Variables**, add the four names and values (plus
`NEXT_PUBLIC_SITE_URL`, e.g. `https://letsplaytambola.com`), then **redeploy** — the `NEXT_PUBLIC_…`
values are baked in when the site is built. For local work put the same lines in a file called `.env.local` (see `.env.example`).

Never put the service_role key in a variable whose name starts with `NEXT_PUBLIC_`.

## 4. Realtime — nothing to switch on
The instant updates use Supabase Realtime **Broadcast** on a public channel called `g:<game code>`.
Broadcast works on every project as it comes:
- You do **not** need to enable "Realtime" on any table (we do not use Postgres Changes / replication).
- You do **not** need to add any policy.
- Only check this if updates feel slow (1–2 seconds instead of instant): **Project Settings → Realtime**
  (or **Realtime → Settings**) → **"Allow public access"** must be **on**. It is on by default.

The signal only says "version N is out" — it carries no game data. Each phone then asks our server
for its own view. If Realtime is ever down the game still works: phones also check every few seconds.

## 5. Clean up old games automatically (recommended)
Games stop working 24 hours after the last activity. To also delete them from the database every hour:
1. **Database → Extensions**, search `pg_cron`, switch it on.
2. **SQL Editor**, run:
   ```sql
   select cron.schedule('purge-expired-games', '17 * * * *', $$select public.purge_expired_games()$$);
   ```
To check it: `select * from cron.job;`. To run a clean-up by hand: `select public.purge_expired_games();`.

## 6. The "Notify me" numbers
WhatsApp numbers typed on the website's "Coming soon" section are in the `notify_numbers` table
(**Table Editor → notify_numbers**, or `select * from notify_numbers order by created_at;`).

## How it is kept safe
- Browsers never talk to the database. Everything goes through the website's own server routes, which use the service_role key.
- All three tables have row level security switched on with **no policies**, and all rights are removed from the `anon` and `authenticated` roles, so the public (anon) key can read and write nothing.
- A player's ticket and dabs are in the `players` table and are only ever sent to the device that owns them. Device tokens are stored only as SHA-256 hashes.
- Writes go through one database function, `commit_game`, which refuses a write if the game changed in the meantime — so when two people claim the same prize at the same instant, exactly one wins.

## Tests (for developers)
`npm run test:sql` applies the migration to a throwaway database on a local PostgreSQL 16 and checks that:
anon and authenticated can neither read nor change any table nor call the functions; the service role can;
a stale version is rejected; a purge removes only expired games. Over TCP:
`PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres npm run test:sql`.
