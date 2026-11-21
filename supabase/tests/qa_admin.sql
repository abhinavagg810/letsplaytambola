-- QA checks for the admin / analytics side (docs/qa/TEST_PLAN_ADMIN.md, cases MIG-*). Run by tests/run.sh on a database with
-- every migration applied (and each one re-applied once, which must fail cleanly and change nothing).
-- Nothing here relies on a list of names: every table, view, sequence and function is read from pg_catalog,
-- so an object added by a later migration is covered automatically.

-- MIG-03: every table in public has row level security ON and NO policy.
select t.ok(count(*) >= 8, 'found the tables to check (' || count(*) || ')') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p');
select t.ok(not exists (
  select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity), 'every table in public has row level security enabled');
select t.ok(not exists (select 1 from pg_policies where schemaname = 'public'), 'no table in public has a policy (so anon / authenticated can read and write nothing)');

-- MIG-04: anon and authenticated hold no privilege on any table, view or sequence in public.
select t.ok(coalesce(string_agg(c.relname || ':' || r.rolname || ':' || p.priv, ', '), '') = '', 'anon / authenticated have no privilege on any table or view: ' || coalesce(string_agg(c.relname || ':' || r.rolname || ':' || p.priv, ', '), 'none'))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and has_table_privilege(r.rolname, c.oid, p.priv);
select t.ok(coalesce(string_agg(c.relname || ':' || r.rolname, ', '), '') = '', 'anon / authenticated cannot use any sequence: ' || coalesce(string_agg(c.relname || ':' || r.rolname, ', '), 'none'))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname = 'public' and c.relkind = 'S' and (has_sequence_privilege(r.rolname, c.oid, 'USAGE') or has_sequence_privilege(r.rolname, c.oid, 'SELECT') or has_sequence_privilege(r.rolname, c.oid, 'UPDATE'));

-- MIG-05: no function in public can be run by anon, authenticated or PUBLIC; every one can be run by service_role.
select t.ok(count(*) >= 20, 'found the functions to check (' || count(*) || ')') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';
select t.ok(coalesce(string_agg(p.proname || ':' || r.rolname, ', '), '') = '', 'no function is executable by anon / authenticated: ' || coalesce(string_agg(p.proname || ':' || r.rolname, ', '), 'none'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname = 'public' and has_function_privilege(r.rolname, p.oid, 'EXECUTE');
select t.ok(coalesce(string_agg(p.proname, ', '), '') = '', 'no function is executable by PUBLIC: ' || coalesce(string_agg(p.proname, ', '), 'none'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE');
select t.ok(coalesce(string_agg(p.proname, ', '), '') = '', 'service_role can run every function: ' || coalesce(string_agg(p.proname, ', '), 'all'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and not has_function_privilege('service_role', p.oid, 'EXECUTE');
-- SECURITY DEFINER functions must pin their search_path (otherwise a caller could shadow a table).
select t.ok(coalesce(string_agg(p.proname, ', '), '') = '', 'every SECURITY DEFINER function sets its own search_path: ' || coalesce(string_agg(p.proname, ', '), 'all'))
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- MIG-06: and in practice — as anon, every table reads as empty or is refused, and no admin function runs.
insert into public.notify_numbers (phone) values ('9000000001') on conflict do nothing;
set role anon;
do $$
declare r record; n bigint; ran int := 0;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' loop
    begin
      execute format('select count(*) from public.%I', r.relname) into n;
      if n <> 0 then raise exception 'FAILED: anon can read % rows of %', n, r.relname; end if;
    exception when insufficient_privilege then null;
    end;
  end loop;
  for r in select p.oid::regprocedure as sig, p.proname, p.pronargs from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.pronargs = 0 loop
    begin
      execute format('select public.%I()', r.proname);
      ran := ran + 1;
    exception when insufficient_privilege then null;
              when others then if sqlstate <> '42501' then null; end if;
    end;
  end loop;
  if ran <> 0 then raise exception 'FAILED: anon could run % zero-argument functions', ran; end if;
end $$;
reset role;
select t.ok(true, 'as anon: every table reads as empty or is refused, and no zero-argument function runs');
delete from public.notify_numbers where phone = '9000000001';
