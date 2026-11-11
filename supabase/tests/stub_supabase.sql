-- Just enough of a Supabase project to apply the migrations on plain PostgreSQL:
-- the three API roles, auth.users + auth.uid(), the extensions schema and the realtime publication.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin execute format('alter database %I set search_path = "$user", public, extensions', current_database()); end $$;
set search_path = "$user", public, extensions;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  raw_user_meta_data jsonb,
  is_anonymous       boolean not null default false,
  phone              text unique,
  phone_confirmed_at timestamptz,
  email              text
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Supabase grants everything in `public` to the API roles by default and relies on RLS.
-- Mirror that, so the tests prove the migration is safe even with those wide defaults.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create publication supabase_realtime;
