-- Security and concurrency tests. Run by supabase/tests/run.sh after stub_supabase.sql + the migration.
-- Every check raises on failure (psql runs with ON_ERROR_STOP), so reaching the end means it passed.
\set h1 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
\set h2 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
\set h3 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

create schema t;
grant usage on schema t to anon, authenticated, service_role;
create function t.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  return 'ok   ' || msg;
end $$;
-- Passes only when the statement is refused with one of the given SQLSTATEs.
create function t.refused(stmt text, msg text, states text[] default array['42501']) returns text language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate = any (states) then return 'ok   ' || msg || ' (' || sqlstate || ')'; end if;
    raise exception 'FAILED: % — wrong error % %', msg, sqlstate, sqlerrm;
  end;
  raise exception 'FAILED: % — the statement was allowed', msg;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;
\pset tuples_only on
\pset format unaligned

-- ------------------------------------------------------------ shape
select t.ok((select count(*) = 3 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
                and c.relname in ('games', 'players', 'notify_numbers')),
            'row level security is enabled on games, players and notify_numbers');
select t.ok((select count(*) = 0 from pg_policies where schemaname = 'public'), 'there are no policies at all');
select t.ok((select count(*) = 3 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r'), 'no other tables exist in public');

-- ------------------------------------------------------------ the service role (the Next.js server) can work
set role service_role;
select t.ok(commit_game('K7RQ2', null,
  '{"code":"K7RQ2","name":"Diwali Night","hostName":"Priya","status":"lobby","version":1,"players":[{"pid":"p1","name":"Priya"}]}',
  jsonb_build_array(jsonb_build_object('pid', 'p1', 'token_hash', :'h1', 'ticket', '[[1,0,0],[0,0,0],[0,0,0]]'::jsonb, 'marks', '[]'::jsonb, 'rev', null)),
  :'h1') = 1, 'service_role creates a game (version 1)');
select t.ok((select version = 1 and status = 'lobby' and host_token_hash = :'h1' and doc ->> 'hostName' = 'Priya' from games where code = 'K7RQ2'),
            'service_role reads the game back');
select t.ok((select count(*) = 1 from players where code = 'K7RQ2' and pid = 'p1' and token_hash = :'h1' and rev = 1), 'the host''s ticket row was written');
select t.refused($$select commit_game('K7RQ2', null, '{"status":"lobby"}', '[]', repeat('a', 64))$$,
                 'creating a game with a code in use is refused', array['23505']);
select t.refused($$select commit_game('K7RQ3', null, null, '[]', repeat('a', 64))$$, 'a new game needs a document', array['22023']);
select t.refused($$select commit_game('k7rq3', null, '{"status":"lobby"}', '[]', repeat('a', 64))$$, 'codes must use the game alphabet', array['23514']);
select t.refused($$select commit_game('K7RQ3', null, '{"status":"lobby"}', '[]', 'not-a-hash')$$, 'the host token must be a SHA-256 hash', array['23514']);

-- a join: version 1 -> 2
select t.ok(commit_game('K7RQ2', 1,
  '{"code":"K7RQ2","status":"lobby","version":2,"players":[{"pid":"p1"},{"pid":"p2"}]}',
  jsonb_build_array(jsonb_build_object('pid', 'p2', 'token_hash', :'h2', 'ticket', '[[2,0,0],[0,0,0],[0,0,0]]'::jsonb, 'marks', '[]'::jsonb, 'rev', null))) = 2,
  'a commit with the current version succeeds and returns the next version');
select t.ok((select version = 2 and (doc ->> 'version')::int = 2 and jsonb_array_length(doc -> 'players') = 2 from games where code = 'K7RQ2'),
            'the document and its version were swapped in');

-- ------------------------------------------------------------ compare-and-swap
select t.refused($$select commit_game('K7RQ2', 1, '{"status":"live","version":2}')$$, 'a commit with a stale version is rejected', array['40001']);
select t.refused($$select commit_game('K7RQ2', 3, '{"status":"live","version":4}')$$, 'a commit with a future version is rejected', array['40001']);
select t.refused($$select commit_game('ZZZZZ', 1, '{"status":"live","version":2}')$$, 'a commit to a game that does not exist is rejected', array['40001']);
select t.ok((select version = 2 and status = 'lobby' from games where code = 'K7RQ2'), 'rejected commits changed nothing');

-- two claims that both read version 2: the first wins, the second must reload
select t.ok(commit_game('K7RQ2', 2, '{"status":"live","version":3,"winner":"p1"}') = 3, 'first of two simultaneous commits wins');
select t.refused($$select commit_game('K7RQ2', 2, '{"status":"live","version":3,"winner":"p2"}')$$, 'the second one is rejected', array['40001']);
select t.ok((select doc ->> 'winner' = 'p1' and status = 'live' from games where code = 'K7RQ2'), 'the first writer''s document stands');

-- private-only commit (a dab): version checked, not increased
select t.ok(commit_game('K7RQ2', 3, null,
  jsonb_build_array(jsonb_build_object('pid', 'p2', 'ticket', '[[2,0,0],[0,0,0],[0,0,0]]'::jsonb, 'marks', '[2]'::jsonb, 'rev', 1))) = 3,
  'a marks-only commit keeps the version');
select t.ok((select marks = '{2}' and rev = 2 from players where code = 'K7RQ2' and pid = 'p2'), 'marks saved, row revision increased');
select t.ok((select version = 3 and doc ->> 'winner' = 'p1' from games where code = 'K7RQ2'), 'the public document is untouched by a marks-only commit');
select t.refused($$select commit_game('K7RQ2', 3, null, '[{"pid":"p2","ticket":[[2,0,0]],"marks":[],"rev":1}]')$$,
                 'a player row that changed since it was read is rejected (stale rev)', array['40001']);
select t.refused($$select commit_game('K7RQ2', 2, null, '[{"pid":"p2","ticket":[[2,0,0]],"marks":[],"rev":2}]')$$,
                 'a marks-only commit against a stale game version is rejected', array['40001']);
select t.refused($$select commit_game('K7RQ2', 3, '{"status":"done","version":4}', '[{"pid":"p2","ticket":[[9,0,0]],"marks":[],"rev":1}]')$$,
                 'a commit whose player row is stale is rejected as a whole', array['40001']);
select t.ok((select version = 3 and status = 'live' from games where code = 'K7RQ2'), '...and its document change was rolled back with it');
select t.ok((select marks = '{2}' from players where code = 'K7RQ2' and pid = 'p2'), '...and the marks are as they were');

-- one seat per device
select t.refused(format($$select commit_game('K7RQ2', 3, '{"status":"live","version":4}', '[{"pid":"p9","token_hash":"%s","ticket":[[3,0,0]],"marks":[],"rev":null}]')$$, :'h2'),
                 'the same device cannot take a second seat', array['23505']);
select t.ok((select version = 3 from games where code = 'K7RQ2') and (select count(*) = 2 from players where code = 'K7RQ2'), '...and nothing was written');

-- notify numbers
insert into notify_numbers (phone) values ('9810011001');
insert into notify_numbers (phone) values ('9810011001') on conflict do nothing;
select t.ok((select count(*) = 1 from notify_numbers), 'service_role saves a notify-me number once');
select t.refused($$insert into notify_numbers (phone) values ('98100')$$, 'a notify-me number must be 10 digits', array['23514']);
reset role;

-- ------------------------------------------------------------ anon and authenticated can do nothing
\set checks_for_role 'select t.refused($q$select * from games$q$, current_user || $q$ cannot select games$q$); select t.refused($q$select * from players$q$, current_user || $q$ cannot select players$q$); select t.refused($q$select * from notify_numbers$q$, current_user || $q$ cannot select notify_numbers$q$); select t.refused($q$select count(*) from games$q$, current_user || $q$ cannot even count games$q$); select t.refused($q$select ticket, marks from players where code = $c$K7RQ2$c$ $q$, current_user || $q$ cannot read tickets or marks$q$); select t.refused($q$insert into games (code, doc, status, host_token_hash) values ($c$AAAAA$c$, $c${}$c$, $c$lobby$c$, repeat($c$a$c$, 64))$q$, current_user || $q$ cannot insert games$q$); select t.refused($q$update games set status = $c$done$c$ $q$, current_user || $q$ cannot update games$q$); select t.refused($q$delete from games$q$, current_user || $q$ cannot delete games$q$); select t.refused($q$insert into players (code, pid, token_hash, ticket) values ($c$K7RQ2$c$, $c$px$c$, repeat($c$d$c$, 64), $c$[]$c$)$q$, current_user || $q$ cannot insert players$q$); select t.refused($q$update players set marks = $c${1,2,3}$c$ $q$, current_user || $q$ cannot update players$q$); select t.refused($q$delete from players$q$, current_user || $q$ cannot delete players$q$); select t.refused($q$insert into notify_numbers (phone) values ($c$9999999999$c$)$q$, current_user || $q$ cannot insert notify_numbers$q$); select t.refused($q$update notify_numbers set phone = $c$9999999999$c$ $q$, current_user || $q$ cannot update notify_numbers$q$); select t.refused($q$delete from notify_numbers$q$, current_user || $q$ cannot delete notify_numbers$q$); select t.refused($q$truncate games cascade$q$, current_user || $q$ cannot truncate$q$); select t.refused($q$select commit_game($c$K7RQ2$c$, 3, $c${"status":"done"}$c$)$q$, current_user || $q$ cannot call commit_game (update)$q$); select t.refused($q$select commit_game($c$BBBBB$c$, null, $c${"status":"lobby"}$c$, $c$[]$c$, repeat($c$a$c$, 64))$q$, current_user || $q$ cannot call commit_game (create)$q$); select t.refused($q$select purge_expired_games()$q$, current_user || $q$ cannot call purge_expired_games$q$);'

set role anon;
:checks_for_role
reset role;
set role authenticated;
:checks_for_role
reset role;

-- Belt and braces: even if someone later grants table privileges back (Supabase's dashboard defaults do),
-- RLS with no policies still shows and changes nothing.
grant select, insert, update, delete on games, players, notify_numbers to anon, authenticated;
set role anon;
select t.ok((select count(*) = 0 from games) and (select count(*) = 0 from players) and (select count(*) = 0 from notify_numbers),
            'with privileges granted back, anon still sees no rows (RLS, no policies)');
select t.refused($$insert into notify_numbers (phone) values ('9999999999')$$, 'with privileges granted back, anon still cannot insert (RLS)');
update games set status = 'done';
delete from players;
reset role;
set role authenticated;
select t.ok((select count(*) = 0 from games) and (select count(*) = 0 from players), 'with privileges granted back, authenticated still sees no rows');
update players set marks = '{9}';
delete from games;
reset role;
revoke all on games, players, notify_numbers from anon, authenticated;
select t.ok((select count(*) = 1 from games where status = 'live' and version = 3) and (select count(*) = 2 from players) and (select marks = '{2}' from players where pid = 'p2'),
            'nothing was changed by anon or authenticated');

-- ------------------------------------------------------------ expiry
set role service_role;
select commit_game('AAAA2', null, '{"status":"lobby"}', jsonb_build_array(jsonb_build_object('pid', 'p1', 'token_hash', :'h3', 'ticket', '[]'::jsonb, 'marks', '[]'::jsonb, 'rev', null)), :'h3');
select commit_game('AAAA3', null, '{"status":"lobby"}', '[]', :'h3');
reset role;
update games set updated_at = now() - interval '25 hours' where code = 'AAAA2';
update games set updated_at = now() - interval '23 hours' where code = 'AAAA3';
set role service_role;
-- an expired code can be reused straight away (before the purge runs)
select t.ok(commit_game('AAAA2', null, '{"status":"lobby","name":"new"}', '[]', :'h2') = 1, 'the code of an expired game can be reused');
select t.ok((select doc ->> 'name' = 'new' and host_token_hash = :'h2' from games where code = 'AAAA2') and (select count(*) = 0 from players where code = 'AAAA2'),
            '...and the old game and its players are gone');
reset role;
update games set updated_at = now() - interval '24 hours 1 minute' where code = 'AAAA2';
insert into players (code, pid, token_hash, ticket) values ('AAAA2', 'p1', :'h3', '[]');
set role service_role;
select t.ok(purge_expired_games() = 1, 'purge removes exactly the one expired game');
select t.ok((select array_agg(code order by code) = '{AAAA3,K7RQ2}' from games), 'games idle for less than 24 hours are kept');
select t.ok((select count(*) = 0 from players where code = 'AAAA2') and (select count(*) = 2 from players where code = 'K7RQ2'), 'players of a purged game go with it; others stay');
select t.ok(purge_expired_games() = 0, 'purging again removes nothing');
-- activity keeps a game alive: any commit moves updated_at
reset role;
update games set updated_at = now() - interval '23 hours 59 minutes' where code = 'K7RQ2';
set role service_role;
select commit_game('K7RQ2', 3, null, '[]');
select t.ok((select updated_at > now() - interval '1 minute' from games where code = 'K7RQ2'), 'a commit (even marks-only) counts as activity');
reset role;
