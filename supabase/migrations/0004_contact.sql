-- Letsplaytambola v2 — the contact form (/contact): messages people send to the team, read in Admin → Messages.
-- Run once, AFTER 0003_insights.sql (SQL Editor → paste all of it → Run). See supabase/README.md.
--
-- What it adds
--   * contact_messages  one row per message: when, topic, the name and reply-to the person typed (both optional), the message,
--                       the site page they came from, read / unread, and — like the rest of the analytics — the IP address,
--                       approximate place and device of the request (from its headers, never from the form).
--   * save_contact_message (the server's write), admin_list_contact / admin_contact_unread / admin_set_contact_read /
--     admin_delete_contact (the admin's reads and actions; a delete writes a line in admin_audit), contact_version().
--   * purge_contact: messages are deleted 90 days after they were received. purge_expired_games() now runs it too, so the
--     hourly clean-up (the app's own, or pg_cron) needs no change.
--
-- Security: exactly as before. Row level security is ENABLED with NO policies; every privilege is revoked from anon and
-- authenticated; only the service role (the Next.js server) can read, write or call anything.
--
-- Run it a second time and it stops at the first line with `relation "contact_messages" already exists`, changing nothing.

create table public.contact_messages (
  id              bigint generated always as identity primary key,
  created_at      timestamptz not null default now(),
  topic           text not null check (topic in ('help', 'feedback', 'remove', 'business', 'other')),
  name            text check (char_length(name) between 1 and 60),
  reply_to        text check (char_length(reply_to) between 1 and 80),
  message         text not null check (char_length(message) between 10 and 2000),
  page            text check (char_length(page) <= 80),
  read_at         timestamptz,
  token_hash      text check (token_hash ~ '^[0-9a-f]{64}$'),
  ip              text check (char_length(ip) <= 64),
  country         text check (char_length(country) <= 2),
  region          text check (char_length(region) <= 3),
  city            text check (char_length(city) <= 80),
  lat             double precision,
  lon             double precision,
  timezone        text check (char_length(timezone) <= 40),
  postal          text check (char_length(postal) <= 12),
  device_type     text check (char_length(device_type) <= 16),
  os              text check (char_length(os) <= 32),
  os_version      text check (char_length(os_version) <= 8),
  browser         text check (char_length(browser) <= 32),
  browser_version text check (char_length(browser_version) <= 8),
  in_app          text check (char_length(in_app) <= 32),
  ua              text check (char_length(ua) <= 400),
  language        text check (char_length(language) <= 24)
);
-- Newest first (the list, the purge), the unread count, the topic filter.
create index contact_messages_created_idx on public.contact_messages (created_at desc, id desc);
create index contact_messages_unread_idx on public.contact_messages (created_at) where read_at is null;
create index contact_messages_topic_idx on public.contact_messages (topic, created_at desc);

alter table public.contact_messages enable row level security;
-- No policies on purpose: with RLS on and no policy, anon/authenticated see and change nothing.
revoke all on table public.contact_messages from public, anon, authenticated;
grant select, insert, update, delete on table public.contact_messages to service_role;
revoke all on all sequences in schema public from public, anon, authenticated;
grant usage, select on all sequences in schema public to service_role;

create function public.contact_version() returns integer language sql immutable as $$ select 4 $$;

-- ---------------------------------------------------------------- the server's write

-- p_ctx: the request context the server worked out from the headers (same shape as for track_batch). Returns the new id.
create function public.save_contact_message(p_ctx jsonb, p_topic text, p_name text, p_reply_to text, p_message text, p_page text) returns bigint
language sql
set search_path = public
as $$
  insert into contact_messages (topic, name, reply_to, message, page, token_hash, ip, country, region, city, lat, lon, timezone, postal,
                                device_type, os, os_version, browser, browser_version, in_app, ua, language)
  values (p_topic, nullif(p_name, ''), nullif(p_reply_to, ''), p_message, p_page, p_ctx ->> 'tokenHash', p_ctx ->> 'ip', p_ctx ->> 'country', p_ctx ->> 'region',
          p_ctx ->> 'city', (p_ctx ->> 'lat')::double precision, (p_ctx ->> 'lon')::double precision, p_ctx ->> 'timezone', p_ctx ->> 'postal',
          p_ctx ->> 'deviceType', p_ctx ->> 'os', p_ctx ->> 'osVersion', p_ctx ->> 'browser', p_ctx ->> 'browserVersion', p_ctx ->> 'inApp',
          left(p_ctx ->> 'ua', 400), p_ctx ->> 'language')
  returning id
$$;

-- ---------------------------------------------------------------- admin reads and actions (service_role only)

-- One message as the admin sees it: no full device hash, no raw user agent, no coordinates.
create function public.contact_json(m public.contact_messages) returns jsonb language sql stable set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'createdAt', ins_ms(m.created_at), 'topic', m.topic, 'name', m.name, 'replyTo', m.reply_to, 'message', m.message, 'page', m.page,
    'readAt', case when m.read_at is null then null else ins_ms(m.read_at) end, 'device', left(m.token_hash, 8),
    'ip', m.ip, 'country', m.country, 'region', m.region, 'city', m.city, 'deviceType', m.device_type, 'os', m.os, 'osVersion', m.os_version,
    'browser', m.browser, 'browserVersion', m.browser_version, 'inApp', m.in_app, 'language', m.language)
$$;

-- { total, unread, rows: [...] }, newest first. p_status: null | 'read' | 'unread'. p_search: plain text (no wildcards).
create function public.admin_list_contact(
  p_topic text default null, p_search text default null, p_status text default null, p_limit integer default 50, p_offset integer default 0
) returns jsonb
language sql stable
set search_path = public
as $$
  with matched as (
    select m.* from contact_messages m
     where (p_topic is null or m.topic = p_topic)
       and (p_status is null or (p_status = 'unread') = (m.read_at is null))
       and (coalesce(p_search, '') = ''
            or strpos(lower(coalesce(m.name, '')), lower(p_search)) > 0
            or strpos(lower(coalesce(m.reply_to, '')), lower(p_search)) > 0
            or strpos(lower(m.message), lower(p_search)) > 0)
  ), page as (
    select id from matched order by created_at desc, id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from matched),
    'unread', (select count(*) from contact_messages where read_at is null),
    'rows', coalesce((select jsonb_agg(contact_json(m) order by m.created_at desc, m.id desc) from contact_messages m join page p on p.id = m.id), '[]'::jsonb))
$$;

create function public.admin_contact_unread() returns integer language sql stable set search_path = public as $$
  select count(*)::integer from contact_messages where read_at is null
$$;

-- Mark read (true) / unread (false). Returns false when there is no such message.
create function public.admin_set_contact_read(p_id bigint, p_read boolean) returns boolean
language plpgsql
set search_path = public
as $$
begin
  update contact_messages set read_at = case when p_read then coalesce(read_at, now()) else null end where id = p_id;
  return found;
end $$;

-- Delete one message for good; the audit line keeps its id and topic, never what it said. False when there is no such message.
create function public.admin_delete_contact(p_id bigint) returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_topic text;
begin
  delete from contact_messages where id = p_id returning topic into v_topic;
  if not found then return false; end if;
  insert into admin_audit (action, target, detail) values ('delete_message', p_id::text, jsonb_build_object('topic', v_topic));
  return true;
end $$;

-- ---------------------------------------------------------------- retention

-- Messages are deleted p_retention_days after they were received. Returns how many were deleted.
create function public.purge_contact(p_retention_days integer default 90) returns integer
language plpgsql
set search_path = public
as $$
declare
  n integer;
begin
  if p_retention_days is null or p_retention_days < 1 then
    raise exception 'retention must be at least 1 day' using errcode = '22023';
  end if;
  delete from contact_messages where created_at < now() - make_interval(days => p_retention_days);
  get diagnostics n = row_count;
  return n;
end $$;

-- purge_expired_games: exactly as in 0003, and now it also runs purge_contact. Still returns how many GAMES were deleted or erased.
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
  perform purge_contact(p_retention_days);
  return n_deleted + n_erased;
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
