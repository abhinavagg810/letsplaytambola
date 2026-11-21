-- Letsplaytambola v2 — insights: first-party analytics for the operator's admin panel.
-- Run once on an existing project (SQL Editor → paste all of it → Run). See supabase/README.md.
--
-- What it adds
--   * devices         one row per device (SHA-256 of the device token): first/last seen, latest IP address and the
--                     approximate place derived from it, browser/device details, how it first arrived, lifetime counts.
--   * device_ips      every IP address a device was seen on.
--   * participations  one row per device per game: IP, place and device at the moment the game was created / joined.
--   * events          append-only usage events (page views, funnel steps, share taps …). Names and properties are
--                     validated by the server against a whitelist before they get here.
--   * admin_audit     what the operator did (erase a device).
--   * write functions (track_batch, record_participation, record_win), read-only admin_* aggregates, the erase action,
--     and a purge: IPs, device rows and events follow the same 90-day rule as game summaries.
--
-- Security: exactly as before. Row level security is ENABLED on every new table with NO policies; every privilege is
-- revoked from anon and authenticated; only the service role (the Next.js server) can read, write or call anything.
-- IP addresses and places are only ever returned by admin_* functions.

-- ---------------------------------------------------------------- tables

create table public.devices (
  token_hash         text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  first_seen         timestamptz not null default now(),
  last_seen          timestamptz not null default now(),
  sessions           integer not null default 0,
  ip                 text check (char_length(ip) <= 64),
  country            text check (char_length(country) <= 2),
  region             text check (char_length(region) <= 3),
  city               text check (char_length(city) <= 80),
  lat                double precision,
  lon                double precision,
  timezone           text check (char_length(timezone) <= 40),
  postal             text check (char_length(postal) <= 12),
  device_type        text check (char_length(device_type) <= 16),
  os                 text check (char_length(os) <= 32),
  os_version         text check (char_length(os_version) <= 8),
  browser            text check (char_length(browser) <= 32),
  browser_version    text check (char_length(browser_version) <= 8),
  in_app             text check (char_length(in_app) <= 32),
  ua                 text check (char_length(ua) <= 400),
  language           text check (char_length(language) <= 24),
  screen_w           integer,
  screen_h           integer,
  viewport_w         integer,
  viewport_h         integer,
  dpr                integer,
  client_tz          text check (char_length(client_tz) <= 40),
  touch              boolean,
  connection         text check (char_length(connection) <= 12),
  standalone         boolean,
  first_referrer     text check (char_length(first_referrer) <= 80),
  first_utm_source   text check (char_length(first_utm_source) <= 60),
  first_utm_medium   text check (char_length(first_utm_medium) <= 60),
  first_utm_campaign text check (char_length(first_utm_campaign) <= 60),
  first_landing      text check (char_length(first_landing) <= 80),
  first_source       text check (char_length(first_source) <= 60),
  games_hosted       integer not null default 0,
  games_joined       integer not null default 0,
  prizes_won         integer not null default 0,
  amount_won         bigint not null default 0,
  last_name          text check (char_length(last_name) <= 40)
);
create index devices_last_seen_idx on public.devices (last_seen);
create index devices_first_seen_idx on public.devices (first_seen);
create index devices_short_idx on public.devices (left(token_hash, 8));

create table public.device_ips (
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  ip         text not null check (char_length(ip) <= 64),
  country    text,
  region     text,
  city       text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  hits       integer not null default 1,
  primary key (token_hash, ip)
);
create index device_ips_last_seen_idx on public.device_ips (last_seen);

create table public.participations (
  code            text not null references public.games (code) on delete cascade,
  token_hash      text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  role            text not null check (role in ('host', 'player')),
  pid             text check (char_length(pid) <= 32),
  at              timestamptz not null default now(),
  ip              text check (char_length(ip) <= 64),
  country         text,
  region          text,
  city            text,
  device_type     text,
  os              text,
  os_version      text,
  browser         text,
  browser_version text,
  in_app          text,
  primary key (code, token_hash)
);
create index participations_at_idx on public.participations (at);
create index participations_short_idx on public.participations (left(token_hash, 8));

create table public.events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  device      text check (device ~ '^[0-9a-f]{64}$'),
  session     text not null check (char_length(session) between 8 and 40),
  name        text not null check (char_length(name) between 1 and 32),
  code        text check (char_length(code) <= 8),
  path        text check (char_length(path) <= 80),
  props       jsonb not null default '{}'::jsonb check (jsonb_typeof(props) = 'object' and pg_column_size(props) <= 2048),
  country     text,
  region      text,
  city        text,
  device_type text,
  os          text,
  browser     text,
  in_app      text,
  source      text
);
-- Index plan: every admin query filters on a time range, and then by name (funnels, charts), game or device.
create index events_at_idx on public.events (at);
create index events_name_at_idx on public.events (name, at);
create index events_code_at_idx on public.events (code, at) where code is not null;
create index events_device_at_idx on public.events (device, at) where device is not null;
create index events_session_idx on public.events (session);
create index events_device_short_idx on public.events (left(device, 8)) where device is not null;

create table public.admin_audit (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  action text not null,
  target text not null,
  detail jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------- lock everything down

alter table public.devices        enable row level security;
alter table public.device_ips     enable row level security;
alter table public.participations enable row level security;
alter table public.events         enable row level security;
alter table public.admin_audit    enable row level security;
-- No policies on purpose: with RLS on and no policy, anon/authenticated see and change nothing.

revoke all on table public.devices, public.device_ips, public.participations, public.events, public.admin_audit from public, anon, authenticated;
grant select, insert, update, delete on table public.devices, public.device_ips, public.participations, public.events, public.admin_audit to service_role;
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------- small helpers

-- Lets the server tell "this migration has been run" from "not yet".
create function public.insights_version() returns integer language sql immutable as $$ select 3 $$;

create function public.ins_ms(t timestamptz) returns bigint language sql immutable as $$
  select floor(extract(epoch from t) * 1000)::bigint
$$;
create function public.ins_ts(ms bigint) returns timestamptz language sql immutable as $$
  select to_timestamp(ms / 1000.0)
$$;
-- Days since 1970-01-01 of the India calendar day (UTC+05:30, no daylight saving) that contains t.
create function public.ins_day(t timestamptz) returns integer language sql immutable as $$
  select floor((extract(epoch from t) * 1000 + 19800000) / 86400000)::integer
$$;
create function public.ins_day_label(d integer) returns text language sql immutable as $$
  select to_char(date '1970-01-01' + d, 'YYYY-MM-DD')
$$;
-- The funnel step an event is: its name, with the page for page views and the role for results.
create function public.ins_step(p_name text, p_props jsonb) returns text language sql immutable as $$
  select case p_name
    when 'page_view' then 'page_view:' || coalesce(p_props ->> 'page', '')
    when 'results_seen' then 'results_seen:' || coalesce(p_props ->> 'role', '')
    else p_name end
$$;
-- The value of one event for a breakdown dimension ('' = none).
create function public.ins_dim(e public.events, p_dim text) returns text language sql stable
set search_path = public
as $$
  select coalesce(case
    when p_dim = 'all' then 'all'
    when p_dim = 'name' then e.name
    when p_dim = 'step' then ins_step(e.name, e.props)
    when p_dim = 'day' then ins_day_label(ins_day(e.at))
    when p_dim = 'hourdow' then (((ins_day(e.at) + 3) % 7 + 7) % 7)::text || '-' || to_char((e.at at time zone 'UTC') + interval '330 minutes', 'HH24')
    when p_dim = 'country' then e.country
    when p_dim = 'region' then case when e.country is not null and e.region is not null then e.country || '-' || e.region end
    when p_dim = 'city' then case when e.city is not null and e.city <> '' then e.city || '|' || coalesce(e.region, '') || '|' || coalesce(e.country, '') end
    when p_dim = 'device_type' then e.device_type
    when p_dim = 'os' then e.os
    when p_dim = 'browser' then e.browser
    when p_dim = 'in_app' then e.in_app
    when p_dim = 'source' then e.source
    when p_dim = 'path' then e.path
    when p_dim = 'code' then e.code
    when p_dim = 'screen' then case when jsonb_typeof(e.props -> 'sw') = 'number' then
      case when (e.props ->> 'sw')::numeric < 360 then '0-359'
           when (e.props ->> 'sw')::numeric < 480 then '360-479'
           when (e.props ->> 'sw')::numeric < 768 then '480-767'
           when (e.props ->> 'sw')::numeric < 1024 then '768-1023'
           when (e.props ->> 'sw')::numeric < 1440 then '1024-1439'
           else '1440+' end end
    when p_dim like 'prop:%+%' then coalesce(e.props ->> split_part(substr(p_dim, 6), '+', 1), '') || ':' || coalesce(e.props ->> split_part(substr(p_dim, 6), '+', 2), '')
    when p_dim like 'prop:%' then e.props ->> substr(p_dim, 6)
  end, '')
$$;

create function public.ins_event_json(e public.events) returns jsonb language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', e.id, 'at', ins_ms(e.at), 'device', left(e.device, 8), 'session', e.session, 'name', e.name, 'code', e.code, 'path', e.path, 'props', e.props,
    'country', e.country, 'region', e.region, 'city', e.city, 'deviceType', e.device_type, 'os', e.os, 'browser', e.browser, 'inApp', e.in_app, 'source', e.source)
$$;

-- A device as the admin sees it: no full token hash, only its first 8 characters.
create function public.ins_device_json(d public.devices) returns jsonb language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', left(d.token_hash, 8), 'firstSeen', ins_ms(d.first_seen), 'lastSeen', ins_ms(d.last_seen), 'sessions', d.sessions,
    'ip', d.ip, 'country', d.country, 'region', d.region, 'city', d.city, 'lat', d.lat, 'lon', d.lon, 'timezone', d.timezone, 'postal', d.postal,
    'deviceType', d.device_type, 'os', d.os, 'osVersion', d.os_version, 'browser', d.browser, 'browserVersion', d.browser_version, 'inApp', d.in_app, 'ua', d.ua,
    'language', d.language, 'screenW', d.screen_w, 'screenH', d.screen_h, 'viewportW', d.viewport_w, 'viewportH', d.viewport_h, 'dpr', d.dpr,
    'clientTz', d.client_tz, 'touch', d.touch, 'connection', d.connection, 'standalone', d.standalone)
  || jsonb_build_object(
    'firstReferrer', d.first_referrer, 'firstUtmSource', d.first_utm_source, 'firstUtmMedium', d.first_utm_medium, 'firstUtmCampaign', d.first_utm_campaign,
    'firstLanding', d.first_landing, 'firstSource', d.first_source,
    'gamesHosted', d.games_hosted, 'gamesJoined', d.games_joined, 'prizesWon', d.prizes_won, 'amountWon', d.amount_won, 'lastName', d.last_name)
$$;

create function public.ins_participation_json(p public.participations) returns jsonb language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'code', p.code, 'device', left(p.token_hash, 8), 'role', p.role, 'pid', p.pid, 'at', ins_ms(p.at), 'ip', p.ip,
    'country', p.country, 'region', p.region, 'city', p.city, 'deviceType', p.device_type, 'os', p.os, 'osVersion', p.os_version,
    'browser', p.browser, 'browserVersion', p.browser_version, 'inApp', p.in_app,
    'source', (select d.first_source from devices d where d.token_hash = p.token_hash))
$$;

-- ---------------------------------------------------------------- writes (called by the API routes, after the response)

-- p_ctx: what the server read from the request HEADERS:
--   { tokenHash, at (epoch ms), ip, country, region, city, lat, lon, timezone, postal,
--     deviceType, os, osVersion, browser, browserVersion, inApp, ua, language }
create function public.ins_touch_device(p_ctx jsonb) returns void
language plpgsql
set search_path = public
as $$
declare
  v_hash text := p_ctx ->> 'tokenHash';
  v_at timestamptz := coalesce(ins_ts((p_ctx ->> 'at')::bigint), now());
  v_ip text := p_ctx ->> 'ip';
begin
  if v_hash is null then return; end if;
  insert into devices (token_hash, first_seen, last_seen) values (v_hash, v_at, v_at)
  on conflict (token_hash) do update
    set first_seen = least(devices.first_seen, v_at), last_seen = greatest(devices.last_seen, v_at);
  if v_ip is not null then
    -- the address and the place derived from it always move together
    update devices
       set ip = v_ip, country = p_ctx ->> 'country', region = p_ctx ->> 'region', city = p_ctx ->> 'city',
           lat = (p_ctx ->> 'lat')::double precision, lon = (p_ctx ->> 'lon')::double precision,
           timezone = p_ctx ->> 'timezone', postal = p_ctx ->> 'postal'
     where token_hash = v_hash;
    insert into device_ips (token_hash, ip, country, region, city, first_seen, last_seen, hits)
    values (v_hash, v_ip, p_ctx ->> 'country', p_ctx ->> 'region', p_ctx ->> 'city', v_at, v_at, 1)
    on conflict (token_hash, ip) do update
      set last_seen = greatest(device_ips.last_seen, v_at), hits = device_ips.hits + 1,
          country = excluded.country, region = excluded.region, city = excluded.city;
  end if;
  if p_ctx ->> 'ua' is not null then
    update devices
       set device_type = p_ctx ->> 'deviceType', os = p_ctx ->> 'os', os_version = p_ctx ->> 'osVersion', browser = p_ctx ->> 'browser',
           browser_version = p_ctx ->> 'browserVersion', in_app = p_ctx ->> 'inApp', ua = left(p_ctx ->> 'ua', 400)
     where token_hash = v_hash;
  end if;
  if p_ctx ->> 'language' is not null then
    update devices set language = p_ctx ->> 'language' where token_hash = v_hash;
  end if;
end $$;

-- One accepted POST /api/t. p_events: [{ name, at (epoch ms), code, path, props }, …] — already validated by the server.
-- Returns how many events were stored.
create function public.track_batch(p_ctx jsonb, p_session text, p_source text, p_events jsonb) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_hash text := p_ctx ->> 'tokenHash';
  r jsonb;
  n integer := 0;
begin
  perform ins_touch_device(p_ctx);
  for r in select * from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    if v_hash is not null and r ->> 'name' = 'session_start' then
      update devices
         set sessions = sessions + 1,
             screen_w = coalesce((r #>> '{props,sw}')::integer, screen_w), screen_h = coalesce((r #>> '{props,sh}')::integer, screen_h),
             viewport_w = coalesce((r #>> '{props,vw}')::integer, viewport_w), viewport_h = coalesce((r #>> '{props,vh}')::integer, viewport_h),
             dpr = coalesce((r #>> '{props,dpr}')::integer, dpr), client_tz = coalesce(r #>> '{props,tz}', client_tz),
             touch = coalesce((r #>> '{props,touch}')::boolean, touch), connection = coalesce(r #>> '{props,conn}', connection),
             standalone = coalesce((r #>> '{props,pwa}')::boolean, standalone)
       where token_hash = v_hash;
      -- first touch: written once, never overwritten
      update devices
         set first_referrer = r #>> '{props,ref}', first_utm_source = r #>> '{props,utm_source}', first_utm_medium = r #>> '{props,utm_medium}',
             first_utm_campaign = r #>> '{props,utm_campaign}', first_landing = r #>> '{props,landing}', first_source = coalesce(p_source, 'direct')
       where token_hash = v_hash and first_source is null;
    end if;
    insert into events (at, device, session, name, code, path, props, country, region, city, device_type, os, browser, in_app, source)
    values (coalesce(ins_ts((r ->> 'at')::bigint), now()), v_hash, p_session, r ->> 'name', r ->> 'code', r ->> 'path', coalesce(r -> 'props', '{}'::jsonb),
            p_ctx ->> 'country', p_ctx ->> 'region', p_ctx ->> 'city', p_ctx ->> 'deviceType', p_ctx ->> 'os', p_ctx ->> 'browser', p_ctx ->> 'inApp', p_source);
    n := n + 1;
  end loop;
  return n;
end $$;

-- A game was created (p_role 'host') or joined ('player') from this request. Counted once per device per game.
create function public.record_participation(p_ctx jsonb, p_code text, p_role text, p_pid text, p_name text) returns void
language plpgsql
set search_path = public
as $$
declare
  v_hash text := p_ctx ->> 'tokenHash';
begin
  if v_hash is null or not exists (select 1 from games where code = p_code) then return; end if;
  perform ins_touch_device(p_ctx);
  insert into participations (code, token_hash, role, pid, at, ip, country, region, city, device_type, os, os_version, browser, browser_version, in_app)
  values (p_code, v_hash, p_role, p_pid, coalesce(ins_ts((p_ctx ->> 'at')::bigint), now()), p_ctx ->> 'ip', p_ctx ->> 'country', p_ctx ->> 'region', p_ctx ->> 'city',
          p_ctx ->> 'deviceType', p_ctx ->> 'os', p_ctx ->> 'osVersion', p_ctx ->> 'browser', p_ctx ->> 'browserVersion', p_ctx ->> 'inApp')
  on conflict (code, token_hash) do nothing;
  if not found then return; end if;
  update devices
     set games_hosted = games_hosted + (case when p_role = 'host' then 1 else 0 end),
         games_joined = games_joined + (case when p_role = 'host' then 0 else 1 end),
         last_name = left(p_name, 40)
   where token_hash = v_hash;
end $$;

create function public.record_win(p_token_hash text, p_amount integer) returns void
language sql
set search_path = public
as $$
  update devices set prizes_won = prizes_won + 1, amount_won = amount_won + greatest(coalesce(p_amount, 0), 0) where token_hash = p_token_hash
$$;

-- ---------------------------------------------------------------- retention

-- IPs, device rows and events follow the same rule as game summaries: gone p_retention_days after they were last touched.
-- Returns how many rows were deleted.
create function public.purge_insights(p_retention_days integer default 90) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_cutoff timestamptz;
  n integer := 0;
  k integer;
begin
  if p_retention_days is null or p_retention_days < 1 then
    raise exception 'retention must be at least 1 day' using errcode = '22023';
  end if;
  v_cutoff := now() - make_interval(days => p_retention_days);
  delete from events where at < v_cutoff;                get diagnostics k = row_count; n := n + k;
  delete from devices where last_seen < v_cutoff;        get diagnostics k = row_count; n := n + k;
  delete from device_ips where last_seen < v_cutoff;     get diagnostics k = row_count; n := n + k;
  delete from participations where at < v_cutoff;        get diagnostics k = row_count; n := n + k;
  return n;
end $$;

-- purge_expired_games: as in 0002, and now it also runs purge_insights — so the hourly clean-up (pg_cron or the app)
-- needs no change. Still returns how many GAMES were deleted or erased.
create or replace function public.purge_expired_games(p_retention_days integer default 90) returns integer
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

  perform purge_insights(p_retention_days);
  return n_deleted + n_erased;
end $$;

-- ---------------------------------------------------------------- admin reads (service_role only). Each returns ONE json value.

-- Events grouped by one dimension: [{ key, events, sessions, devices }], most devices first.
--   p_dim: all | name | step | day | hourdow | country | region | city | device_type | os | browser | in_app | source | path | code | screen
--          | prop:<property> | prop:<property>+<property> (two properties joined with ':')
--   p_limit: default 500, at most 3000
create function public.admin_event_breakdown(
  p_from timestamptz, p_to timestamptz, p_dim text,
  p_names text[] default null, p_device_type text default null, p_source text default null, p_code text default null, p_limit integer default 500
) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'events', x.events, 'sessions', x.sessions, 'devices', x.devices)
                            order by x.devices desc, x.events desc, x.key collate "C"), '[]'::jsonb)
    from (
      select s.key, count(*) as events, count(distinct s.session) as sessions, count(distinct s.actor) as devices
        from (
          select ins_dim(e, p_dim) as key, e.session, coalesce(e.device, 's:' || e.session) as actor
            from events e
           where e.at >= p_from and e.at < p_to
             and (p_names is null or e.name = any (p_names))
             and (p_device_type is null or e.device_type = p_device_type)
             and (p_source is null or e.source = p_source)
             and (p_code is null or e.code = p_code)
        ) s
       group by s.key
       order by devices desc, events desc, s.key collate "C"
       limit least(greatest(coalesce(p_limit, 500), 1), 3000)
    ) x
$$;

-- A funnel: for each step, visitors who did it at all ("any") and who did it and every earlier step ("kept").
create function public.admin_funnel(
  p_from timestamptz, p_to timestamptz, p_steps text[],
  p_device_type text default null, p_source text default null, p_code text default null
) returns jsonb
language sql stable
set search_path = public
as $$
  with ev as (
    select coalesce(e.device, 's:' || e.session) as actor, ins_step(e.name, e.props) as step
      from events e
     where e.at >= p_from and e.at < p_to
       and (p_device_type is null or e.device_type = p_device_type)
       and (p_source is null or e.source = p_source)
       and (p_code is null or e.code = p_code)
  ), per as (
    select actor, array_agg(distinct step) as steps from ev where step = any (p_steps) group by actor
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'step', p_steps[k],
           'any', (select count(*) from per where steps @> array[p_steps[k]]),
           'kept', (select count(*) from per where steps @> p_steps[1:k])) order by k), '[]'::jsonb)
    from generate_series(1, coalesce(array_length(p_steps, 1), 0)) k
$$;

create function public.admin_traffic_totals(p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable
set search_path = public
as $$
  with ev as (
    select * from events where at >= p_from and at < p_to
  ), sess as (
    select session, max(case when name = 'session_end' and jsonb_typeof(props -> 'ms') = 'number' then (props ->> 'ms')::bigint end) as ms
      from ev group by session
  )
  select jsonb_build_object(
    'visitors', (select count(distinct coalesce(device, 's:' || session)) from ev),
    'sessions', (select count(*) from sess),
    'events', (select count(*) from ev),
    'pageViews', (select count(*) from ev where name = 'page_view'),
    'newDevices', (select count(*) from devices where first_seen >= p_from and first_seen < p_to),
    'returningDevices', (select count(*) from devices d where d.first_seen < p_from and exists (select 1 from ev where ev.device = d.token_hash)),
    'timedSessions', (select count(ms) from sess),
    'sessionMs', (select coalesce(sum(ms), 0) from sess))
$$;

-- Games hosted, tickets held and devices by where (or on what) people created / joined: [{ key, games, players, devices }].
--   p_dim: country | region | city | device_type | os | browser
create function public.admin_participation_breakdown(p_from timestamptz, p_to timestamptz, p_dim text) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', x.key, 'games', x.games, 'players', x.players, 'devices', x.devices)
                            order by x.devices desc, x.players desc, x.games desc, x.key collate "C"), '[]'::jsonb)
    from (
      select s.key,
             count(*) filter (where s.role = 'host') as games,
             count(*) filter (where s.pid is not null and s.pid <> '') as players,
             count(distinct s.token_hash) as devices
        from (
          select p.role, p.pid, p.token_hash, coalesce(case p_dim
                   when 'country' then p.country
                   when 'region' then case when p.country is not null and p.region is not null then p.country || '-' || p.region end
                   when 'city' then case when p.city is not null and p.city <> '' then p.city || '|' || coalesce(p.region, '') || '|' || coalesce(p.country, '') end
                   when 'device_type' then p.device_type
                   when 'os' then p.os
                   when 'browser' then p.browser end, '') as key
            from participations p
           where p.at >= p_from and p.at < p_to
        ) s
       group by s.key
       order by devices desc, players desc, games desc, s.key collate "C"
       limit 500
    ) x
$$;

-- Weekly cohorts (week of first visit × weeks since), day-1/7/30 return rates and returning hosts. India calendar.
create function public.admin_retention(p_now timestamptz, p_weeks integer default 8) returns jsonb
language sql stable
set search_path = public
as $$
  with t as (
    select ins_day(p_now) as today, (ins_day(p_now) + 3) / 7 as this_week
  ), act as (
    select distinct device, ins_day(at) as day from events where device is not null
  ), dev as (
    select token_hash, ins_day(first_seen) as first_day from devices
  ), host_days as (
    select token_hash, count(distinct ins_day(at)) as days from participations where role = 'host' group by token_hash
  ), rates as (
    select n,
           (select count(*) from dev, t where dev.first_day <= t.today - n) as eligible,
           (select count(*) from dev, t where dev.first_day <= t.today - n
               and exists (select 1 from act a where a.device = dev.token_hash and a.day >= dev.first_day + n)) as returned
      from unnest(array[1, 7, 30]) n
  )
  select jsonb_build_object(
    'cohorts', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'week', ins_day_label(w * 7 - 3),
               'size', (select count(*) from dev where (dev.first_day + 3) / 7 = w),
               'active', (select jsonb_agg((select count(distinct a.device) from act a join dev d on d.token_hash = a.device
                                             where (d.first_day + 3) / 7 = w and (a.day + 3) / 7 = w + k) order by k)
                            from generate_series(0, t.this_week - w) k)) order by w), '[]'::jsonb)
        from t, generate_series(t.this_week - greatest(coalesce(p_weeks, 8), 1) + 1, t.this_week) w),
    'd1', (select jsonb_build_object('eligible', eligible, 'returned', returned) from rates where n = 1),
    'd7', (select jsonb_build_object('eligible', eligible, 'returned', returned) from rates where n = 7),
    'd30', (select jsonb_build_object('eligible', eligible, 'returned', returned) from rates where n = 30),
    'hosts', (select count(*) from host_days),
    'returningHosts', (select count(*) from host_days where days >= 2))
$$;

-- The events explorer: { total, rows }, newest first.  p_device = short device id (8 characters).
create function public.admin_list_events(
  p_from timestamptz default null, p_to timestamptz default null, p_name text default null, p_device text default null,
  p_code text default null, p_session text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language sql stable
set search_path = public
as $$
  with matching as (
    select e.* from events e
     where (p_from is null or e.at >= p_from) and (p_to is null or e.at < p_to)
       and (p_name is null or e.name = p_name)
       and (p_device is null or left(e.device, 8) = p_device)
       and (p_code is null or e.code = p_code)
       and (p_session is null or e.session = p_session)
  ), page as (
    select * from matching order by at desc, id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(ins_event_json(page.*::events) order by page.at desc, page.id desc) from page), '[]'::jsonb))
$$;

-- The devices table: { total, rows }.
--   p_search: part of the short id, the last name used, the city or the IP address.  p_sort: lastSeen | firstSeen | sessions | hosted | joined | won | amount
create function public.admin_list_devices(
  p_search text default null, p_played boolean default false, p_sort text default 'lastSeen', p_desc boolean default true,
  p_limit integer default 25, p_offset integer default 0
) returns jsonb
language sql stable
set search_path = public
as $$
  with q as (
    select nullif(lower(btrim(coalesce(p_search, ''))), '') as s
  ), matching as (
    select d.*,
           (case p_sort
              when 'firstSeen' then extract(epoch from d.first_seen)
              when 'sessions' then d.sessions
              when 'hosted' then d.games_hosted
              when 'joined' then d.games_joined
              when 'won' then d.prizes_won
              when 'amount' then d.amount_won
              else extract(epoch from d.last_seen) end)::numeric as sort_key
      from devices d, q
     where (not coalesce(p_played, false) or d.games_hosted + d.games_joined > 0)
       and (q.s is null
            or position(q.s in left(d.token_hash, 8)) > 0
            or position(q.s in lower(coalesce(d.last_name, ''))) > 0
            or position(q.s in lower(coalesce(d.city, ''))) > 0
            or position(q.s in coalesce(d.ip, '')) > 0)
  ), page as (
    select token_hash, row_number() over (order by (case when p_desc then -sort_key else sort_key end), token_hash collate "C") as rn
      from matching
     order by rn
     limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(ins_device_json(d) order by page.rn) from page join devices d on d.token_hash = page.token_hash), '[]'::jsonb))
$$;

-- One device with every IP address it was seen on, or NULL.
create function public.admin_get_device(p_device text) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'device', ins_device_json(d),
    'ips', coalesce((select jsonb_agg(jsonb_build_object('ip', i.ip, 'country', i.country, 'region', i.region, 'city', i.city,
                                        'firstSeen', ins_ms(i.first_seen), 'lastSeen', ins_ms(i.last_seen), 'hits', i.hits)
                                      order by i.last_seen desc, i.ip collate "C")
                       from device_ips i where i.token_hash = d.token_hash), '[]'::jsonb))
    from devices d where left(d.token_hash, 8) = p_device
   order by d.token_hash limit 1
$$;

-- One game's people (IP, place, device at create / join) and its analytics events, oldest first (at most 500).
create function public.admin_game_insights(p_code text) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'participations', coalesce((select jsonb_agg(ins_participation_json(p) order by p.at, p.token_hash collate "C") from participations p where p.code = p_code), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(ins_event_json(e.*::events) order by e.at, e.id)
                          from (select * from events where code = p_code order by at, id limit 500) e), '[]'::jsonb))
$$;

-- code → the host's participation, for the plays table.
create function public.admin_game_hosts(p_codes text[]) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(p.code, ins_participation_json(p)), '{}'::jsonb)
    from participations p where p.role = 'host' and p.code = any (p_codes)
$$;

create function public.admin_table_counts() returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'games', (select count(*) from games), 'players', (select count(*) from players), 'notify_numbers', (select count(*) from notify_numbers),
    'devices', (select count(*) from devices), 'device_ips', (select count(*) from device_ips), 'participations', (select count(*) from participations),
    'events', (select count(*) from events), 'admin_audit', (select count(*) from admin_audit))
$$;

create function public.admin_list_audit(p_limit integer default 50) returns jsonb
language sql stable
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'at', ins_ms(a.at), 'action', a.action, 'target', a.target, 'detail', a.detail) order by a.at desc, a.id desc), '[]'::jsonb)
    from (select * from admin_audit order by at desc, id desc limit least(greatest(coalesce(p_limit, 50), 1), 200)) a
$$;

-- ---------------------------------------------------------------- plays table: two more filters

-- admin_list_games gains p_priced and p_abandoned (the admin's quick filters). A function's argument list cannot be
-- extended in place, so the old one is dropped and created again; everything else about it is unchanged.
drop function public.admin_list_games(timestamptz, timestamptz, text, text, text, timestamptz, text, boolean, integer, integer);

-- A page of games: { "total": <all that match>, "rows": [admin_game_row, ...] }.
--   p_from / p_to      creation time, from inclusive, to exclusive
--   p_status           'lobby' | 'live' | 'done' | 'expired' (lobby/live but idle for 24h) | 'open' (lobby or live)
--   p_search           part of the code, the game name or the host name
--   p_device           short device id: only games this device hosted or joined
--   p_active_since     only games with activity at or after this time
--   p_sort             'created' | 'players' | 'activity';  p_desc = newest / biggest first
--   p_limit            at most 5000 rows are ever returned
--   p_priced           true = only games with a ticket price
--   p_abandoned        true = only games left in the lobby with no activity for more than 60 minutes
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
  p_offset integer default 0,
  p_priced boolean default null,
  p_abandoned boolean default null
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
       and (not coalesce(p_priced, false) or (jsonb_typeof(g.doc -> 'price') = 'number' and (g.doc ->> 'price')::numeric > 0))
       and (not coalesce(p_abandoned, false) or (g.status = 'lobby' and g.updated_at < now() - interval '60 minutes'))
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

-- ---------------------------------------------------------------- erase a device (the operator's answer to a deletion request)

-- p_arr: a json array of objects. Wherever p_pid_key names one of p_pids, p_name_key is overwritten.
create function public.ins_anon(p_arr jsonb, p_pids text[], p_pid_key text, p_name_key text) returns jsonb
language sql immutable
as $$
  select coalesce((select jsonb_agg(case when t.e ->> p_pid_key = any (p_pids) then t.e || jsonb_build_object(p_name_key, 'Erased player') else t.e end order by t.ord)
                     from jsonb_array_elements(case when jsonb_typeof(p_arr) = 'array' then p_arr else '[]'::jsonb end) with ordinality t(e, ord)), '[]'::jsonb)
$$;

-- Deletes the device row, its IP addresses, its events and its participations; replaces the names it typed in every
-- stored game document with "Erased player"; cuts the link between the device and games that have expired (their stored
-- token hash is replaced by a random one). Games still being played keep the seat so the game goes on.
-- p_device = short device id (8 hex characters). Writes one admin_audit line. Returns the counts.
create function public.admin_erase_device(p_device text) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  g record;
  v_pids text[];
  v_host boolean;
  v_doc jsonb;
  n_games integer := 0;
  n_active integer := 0;
  n_devices integer;
  n_ips integer;
  n_events integer;
  n_parts integer;
  v_result jsonb;
begin
  if p_device is null or p_device !~ '^[0-9a-f]{8}$' then
    raise exception 'a device id is 8 hex characters' using errcode = '22023';
  end if;

  for g in
    select code, doc, host_token_hash, (erased_at is null and updated_at >= now() - interval '24 hours') as active
      from games
     where left(host_token_hash, 8) = p_device
        or exists (select 1 from players p where p.code = games.code and left(p.token_hash, 8) = p_device)
     for update
  loop
    v_pids := array(select pid from players where code = g.code and left(token_hash, 8) = p_device);
    v_host := left(g.host_token_hash, 8) = p_device;
    v_doc := g.doc
      || jsonb_build_object('players', ins_anon(g.doc -> 'players', v_pids, 'pid', 'name'),
                            'prizes', ins_anon(g.doc -> 'prizes', v_pids, 'winnerPid', 'winnerName'),
                            'events', ins_anon(g.doc -> 'events', v_pids, 'pid', 'name'));
    if v_host then v_doc := v_doc || jsonb_build_object('hostName', 'Erased player'); end if;
    if jsonb_typeof(g.doc -> 'history') = 'array' then
      v_doc := v_doc || jsonb_build_object('history', coalesce((
        select jsonb_agg(t.r || jsonb_build_object('prizes', ins_anon(t.r -> 'prizes', v_pids, 'winnerPid', 'winnerName')) order by t.ord)
          from jsonb_array_elements(g.doc -> 'history') with ordinality t(r, ord)), '[]'::jsonb));
    end if;
    -- The document changes, its version does not: a move made at the same instant simply retries.
    update games set doc = v_doc where code = g.code;
    n_games := n_games + 1;
    if g.active then
      n_active := n_active + 1;
    else
      update players set token_hash = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex')
       where code = g.code and left(token_hash, 8) = p_device;
      if v_host then
        update games set host_token_hash = encode(sha256(convert_to(gen_random_uuid()::text, 'UTF8')), 'hex') where code = g.code;
      end if;
    end if;
  end loop;

  delete from events where left(device, 8) = p_device;                get diagnostics n_events = row_count;
  delete from participations where left(token_hash, 8) = p_device;    get diagnostics n_parts = row_count;
  delete from device_ips where left(token_hash, 8) = p_device;        get diagnostics n_ips = row_count;
  delete from devices where left(token_hash, 8) = p_device;           get diagnostics n_devices = row_count;

  v_result := jsonb_build_object('found', (n_games + n_events + n_parts + n_ips + n_devices) > 0, 'devices', n_devices, 'ips', n_ips,
                                 'events', n_events, 'participations', n_parts, 'games', n_games, 'activeGames', n_active);
  insert into admin_audit (action, target, detail) values ('erase_device', p_device, v_result - 'found');
  return v_result;
end $$;

-- ---------------------------------------------------------------- function privileges: service_role only

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
