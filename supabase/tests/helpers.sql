-- Test helpers shared by insights.sql and insights_parity.sql (security.sql carries its own copy).
create schema if not exists t;
grant usage on schema t to anon, authenticated, service_role;
create or replace function t.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  return 'ok   ' || msg;
end $$;
-- Passes only when the statement is refused with one of the given SQLSTATEs.
create or replace function t.refused(stmt text, msg text, states text[] default array['42501']) returns text language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = any (states) then return 'ok   ' || msg || ' (' || sqlstate || ')'; end if;
    raise exception 'FAILED: % — wrong error % %', msg, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % — the statement was allowed', msg;
end $$;
-- Passes only when two json values are equal; shows both when they are not.
create or replace function t.same(got jsonb, want jsonb, msg text) returns text language plpgsql as $$
begin
  if coalesce(got, 'null'::jsonb) is distinct from want then
    raise exception E'FAILED: %\n  SQL gave:   %\n  TS expects: %', msg, left(got::text, 1500), left(want::text, 1500);
  end if;
  return 'ok   ' || msg;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;
