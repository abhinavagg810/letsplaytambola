-- Letsplaytambola v2 — schema.
--
-- Security model
--   * Browsers never talk to the database. Every read and write goes through the Next.js API
--     routes, which use the SERVICE ROLE key. So every table has row level security ENABLED with
--     NO policies, and all privileges are revoked from the `anon` and `authenticated` roles:
--     the anon key (which ships to browsers for the Realtime "changed" ping) can read and write nothing.
--   * games.doc is the PUBLIC game document (no tickets, no marks, no device tokens).
--     Tickets and marks live in `players`, one row per player; the API only ever returns a row
--     to the device whose token hash matches.
--   * Device tokens are never stored: only their SHA-256 hash (hex).
--   * Writes go through commit_game(), a compare-and-swap on games.version, so two requests
--     that read the same version cannot both win (first valid claim wins; the other retries).

-- ---------------------------------------------------------------- tables

create table public.games (
  code            text primary key check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  doc             jsonb not null,
  version         integer not null default 1 check (version >= 1),
  status          text not null check (status in ('lobby', 'live', 'done')),
  host_token_hash text not null check (host_token_hash ~ '^[0-9a-f]{64}$'),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index games_updated_at_idx on public.games (updated_at);

create table public.players (
  code       text not null references public.games (code) on delete cascade,
  pid        text not null check (char_length(pid) between 1 and 32),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  ticket     jsonb not null,
  marks      integer[] not null default '{}',
  -- +1 on every change to this row: stops two quick taps from overwriting each other.
  rev        integer not null default 1,
  joined_at  timestamptz not null default now(),
  primary key (code, pid),
  unique (code, token_hash)
);

create table public.notify_numbers (
  phone      text primary key check (phone ~ '^[0-9]{10}$'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- lock everything down

alter table public.games          enable row level security;
alter table public.players        enable row level security;
alter table public.notify_numbers enable row level security;
-- No policies on purpose: with RLS on and no policy, anon/authenticated see and change nothing.

revoke all on table public.games, public.players, public.notify_numbers from public, anon, authenticated;
grant select, insert, update, delete on table public.games, public.players, public.notify_numbers to service_role;

-- ---------------------------------------------------------------- commit_game: compare-and-swap write

-- p_version  the version the caller read. NULL = create a new game (p_doc and p_host_token_hash required).
-- p_doc      the new public document, or NULL when only private player state changed (a dab):
--            then the version is checked but not increased.
-- p_players  json array of player rows to write:
--              { "pid", "token_hash", "ticket", "marks": [..], "rev": null }   -> insert (a join)
--              { "pid", "ticket", "marks": [..], "rev": 3 }                    -> update, only if rev is still 3
-- Returns the game's version after the write.
-- Raises SQLSTATE 40001 when the game or a player row changed since the caller read it (reload and retry),
-- 23505 when the code is taken (create) or this device already has a seat (join).
create function public.commit_game(
  p_code text,
  p_version integer,
  p_doc jsonb,
  p_players jsonb default '[]'::jsonb,
  p_host_token_hash text default null
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_version integer;
  r jsonb;
  n integer;
begin
  if p_version is null then
    if p_doc is null or p_host_token_hash is null then
      raise exception 'a new game needs a document and a host' using errcode = '22023';
    end if;
    -- A code is free again once its old game has expired.
    delete from games where code = p_code and updated_at < now() - interval '24 hours';
    insert into games (code, doc, version, status, host_token_hash)
    values (p_code, p_doc || jsonb_build_object('version', 1), 1, p_doc ->> 'status', p_host_token_hash);
    v_version := 1;
  elsif p_doc is not null then
    update games
       set doc = p_doc || jsonb_build_object('version', version + 1),
           status = p_doc ->> 'status',
           version = version + 1,
           updated_at = now()
     where code = p_code and version = p_version
    returning version into v_version;
    if not found then
      raise exception 'version conflict' using errcode = '40001';
    end if;
  else
    update games set updated_at = now()
     where code = p_code and version = p_version
    returning version into v_version;
    if not found then
      raise exception 'version conflict' using errcode = '40001';
    end if;
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    if jsonb_typeof(r -> 'rev') = 'number' then
      update players
         set ticket = r -> 'ticket',
             marks = array(select jsonb_array_elements_text(r -> 'marks')::integer),
             rev = rev + 1
       where code = p_code and pid = r ->> 'pid' and rev = (r ->> 'rev')::integer;
      get diagnostics n = row_count;
      if n = 0 then
        raise exception 'player conflict' using errcode = '40001';
      end if;
    else
      insert into players (code, pid, token_hash, ticket, marks)
      values (p_code, r ->> 'pid', r ->> 'token_hash', r -> 'ticket',
              array(select jsonb_array_elements_text(r -> 'marks')::integer));
    end if;
  end loop;

  return v_version;
end $$;

revoke all on function public.commit_game(text, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.commit_game(text, integer, jsonb, jsonb, text) to service_role;

-- ---------------------------------------------------------------- expiry

-- Deletes games with no activity for 24 hours (their players go with them). Returns how many.
create function public.purge_expired_games() returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  delete from games where updated_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.purge_expired_games() from public, anon, authenticated;
grant execute on function public.purge_expired_games() to service_role;

-- To purge every hour, enable the pg_cron extension (Dashboard → Database → Extensions → pg_cron),
-- then run this once in the SQL editor:
-- select cron.schedule('purge-expired-games', '17 * * * *', $$select public.purge_expired_games()$$);
