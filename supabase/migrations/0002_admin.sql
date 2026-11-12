-- Letsplaytambola v2 — admin panel: retention change and read-only helpers.
-- Run once on an existing project (SQL Editor → paste all of it → Run). See supabase/README.md.
--
-- What changes
--   * A game still stops working for players 24 hours after its last activity (unchanged).
--   * At that point its PRIVATE data is erased: every ticket and every dab in `players`
--     (the rows themselves stay, with code, pid and token_hash, so a device can be counted across games).
--   * The public game document (games.doc: names, numbers called, winners, prizes, times) and those
--     stripped rows are kept for 90 days after the last activity for the operator's statistics, then deleted for good.
--   * A game code is taken for as long as its row exists (so up to 90 days after the game ended).
--   * New read-only functions admin_* for the admin panel. Like everything else: service_role only.
--     Row level security stays exactly as before: enabled on every table, no policies, nothing for anon/authenticated.

-- ---------------------------------------------------------------- retention

-- When the tickets and dabs of this game were erased. NULL = not yet (the game is active, or the purge has not run).
alter table public.games add column erased_at timestamptz;
create index games_created_at_idx on public.games (created_at);

-- ADMIN_RETENTION_DAYS: how long an expired game's summary is kept. Keep in step with src/server/store/types.ts.
create function public.admin_retention_days() returns integer
language sql immutable
as $$ select 90 $$;

revoke all on function public.admin_retention_days() from public, anon, authenticated;
grant execute on function public.admin_retention_days() to service_role;

-- commit_game: same contract as before, with two differences:
--   * create: a code is free again only once its old game is past the retention period (was: 24 hours);
--   * update: an expired game (idle for 24 hours, or already erased) can no longer be written to —
--     the caller gets the usual 40001, reloads, and finds the game gone.
create or replace function public.commit_game(
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
    -- A code is free again once its old game is past the retention period.
    delete from games where code = p_code and updated_at < now() - make_interval(days => admin_retention_days());
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
       and erased_at is null and updated_at >= now() - interval '24 hours'
    returning version into v_version;
    if not found then
      raise exception 'version conflict' using errcode = '40001';
    end if;
  else
    update games set updated_at = now()
     where code = p_code and version = p_version
       and erased_at is null and updated_at >= now() - interval '24 hours'
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

-- purge_expired_games: the old version deleted whole games at 24 hours. The new one
--   1. deletes games idle for more than p_retention_days (their player rows go with them);
--   2. erases the tickets and dabs of games idle for more than 24 hours, and marks them erased.
-- Returns how many games were deleted or erased. Safe to run as often as you like.
-- The old function took no argument, so drop it first (a scheduled `select public.purge_expired_games()` keeps working).
drop function public.purge_expired_games();

create function public.purge_expired_games(p_retention_days integer default 90) returns integer
language plpgsql
set search_path = public
as $$
declare
  n_deleted integer;
  n_erased integer;
begin
  if p_retention_days is null or p_retention_days < 1 then
    raise exception 'retention must be at least 1 day' using errcode = '22023';
  end if;

  delete from games where updated_at < now() - make_interval(days => p_retention_days);
  get diagnostics n_deleted = row_count;

  -- The game row is marked first (and locked), then its player rows are stripped, in one statement:
  -- a commit that slips in between cannot bring an erased game back (commit_game checks erased_at).
  with expired as (
    update games set erased_at = now()
     where erased_at is null and updated_at < now() - interval '24 hours'
    returning code
  ), stripped as (
    update players p set ticket = '[]'::jsonb, marks = '{}', rev = p.rev + 1
      from expired e where p.code = e.code
    returning 1
  )
  select count(*) into n_erased from expired;

  return n_deleted + n_erased;
end $$;

revoke all on function public.purge_expired_games(integer) from public, anon, authenticated;
grant execute on function public.purge_expired_games(integer) to service_role;

-- ---------------------------------------------------------------- admin reads (service_role only)

-- One game as the admin sees it. Built field by field: no ticket, no marks, no token hash —
-- a device appears only as the first 8 hex characters of its stored hash.
--   p_events = false leaves out doc.events (lists and statistics do not need them).
create function public.admin_game_row(g public.games, p_events boolean default false) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'code', g.code,
    'doc', case when p_events then g.doc else g.doc || jsonb_build_object('events', '[]'::jsonb) end,
    'createdAt', floor(extract(epoch from g.created_at) * 1000)::bigint,
    'updatedAt', floor(extract(epoch from g.updated_at) * 1000)::bigint,
    'erased', g.erased_at is not null,
    'hostDevice', left(g.host_token_hash, 8),
    'devices', coalesce((select jsonb_object_agg(p.pid, left(p.token_hash, 8)) from players p where p.code = g.code), '{}'::jsonb)
  )
$$;

-- A page of games: { "total": <all that match>, "rows": [admin_game_row, ...] }.
--   p_from / p_to      creation time, from inclusive, to exclusive
--   p_status           'lobby' | 'live' | 'done' | 'expired' (lobby/live but idle for 24h) | 'open' (lobby or live)
--   p_search           part of the code, the game name or the host name
--   p_device           short device id: only games this device hosted or joined
--   p_active_since     only games with activity at or after this time
--   p_sort             'created' | 'players' | 'activity';  p_desc = newest / biggest first
--   p_limit            at most 5000 rows are ever returned
create function public.admin_list_games(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_status text default null,
  p_search text default null,
  p_device text default null,
  p_active_since timestamptz default null,
  p_sort text default 'created',
  p_desc boolean default true,
  p_limit integer default 25,
  p_offset integer default 0
) returns jsonb
language sql stable
set search_path = public
as $$
  with pat as (
    -- the search text as a LIKE pattern, with % _ and \ taken literally
    select case when coalesce(btrim(p_search), '') = '' then null
                else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as p
  ), matching as (
    select g.code,
           case p_sort
             when 'players' then (case when jsonb_typeof(g.doc -> 'players') = 'array' then jsonb_array_length(g.doc -> 'players') else 0 end)::numeric
             when 'activity' then extract(epoch from g.updated_at)
             else extract(epoch from g.created_at)
           end as sort_key
      from games g, pat
     where (p_from is null or g.created_at >= p_from)
       and (p_to is null or g.created_at < p_to)
       and (p_active_since is null or g.updated_at >= p_active_since)
       and (pat.p is null or g.code ilike pat.p or g.doc ->> 'name' ilike pat.p or g.doc ->> 'hostName' ilike pat.p)
       and (p_device is null
            or left(g.host_token_hash, 8) = p_device
            or exists (select 1 from players p where p.code = g.code and left(p.token_hash, 8) = p_device))
       and (p_status is null
            or (p_status = 'done' and g.status = 'done')
            or (p_status = 'expired' and g.status <> 'done' and g.updated_at < now() - interval '24 hours')
            or (p_status in ('lobby', 'live') and g.status = p_status and g.updated_at >= now() - interval '24 hours')
            or (p_status = 'open' and g.status in ('lobby', 'live') and g.updated_at >= now() - interval '24 hours'))
  ), page as (
    select code, row_number() over (order by (case when p_desc then -sort_key else sort_key end), code) as rn
      from matching
     order by rn
     limit least(greatest(coalesce(p_limit, 25), 1), 5000)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(admin_game_row(g, false) order by page.rn) from page join games g on g.code = page.code), '[]'::jsonb)
  )
$$;

-- One game with its events, or NULL when there is no such row. Expired games are included while they are retained.
create function public.admin_get_game(p_code text) returns jsonb
language sql stable
set search_path = public
as $$
  select admin_game_row(g, true) from games g where g.code = p_code
$$;

revoke all on function public.admin_game_row(public.games, boolean) from public, anon, authenticated;
revoke all on function public.admin_list_games(timestamptz, timestamptz, text, text, text, timestamptz, text, boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.admin_get_game(text) from public, anon, authenticated;
grant execute on function public.admin_game_row(public.games, boolean) to service_role;
grant execute on function public.admin_list_games(timestamptz, timestamptz, text, text, text, timestamptz, text, boolean, integer, integer) to service_role;
grant execute on function public.admin_get_game(text) to service_role;

-- If you scheduled the hourly clean-up before (supabase/README.md, step 5) nothing needs changing:
-- `select public.purge_expired_games()` now runs the new function with the 90-day default.
