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
select t.ok((select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('v', 'm', 'f', 'S')), 'the admin migration added no view, materialized view or sequence');
select t.ok((select count(*) = 6 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
            'public has exactly six functions (commit_game, purge_expired_games, admin_retention_days, admin_game_row, admin_list_games, admin_get_game)');
select t.ok((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))),
            'no function in public can be executed by anon, authenticated or PUBLIC');
select t.ok((select count(*) = 6 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and has_function_privilege('service_role', p.oid, 'execute') and not p.prosecdef),
            'service_role can execute all six, and none is SECURITY DEFINER');
select t.ok(public.admin_retention_days() = 90, 'ADMIN_RETENTION_DAYS is 90');

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
\set checks_for_role 'select t.refused($q$select * from games$q$, current_user || $q$ cannot select games$q$); select t.refused($q$select * from players$q$, current_user || $q$ cannot select players$q$); select t.refused($q$select * from notify_numbers$q$, current_user || $q$ cannot select notify_numbers$q$); select t.refused($q$select count(*) from games$q$, current_user || $q$ cannot even count games$q$); select t.refused($q$select ticket, marks from players where code = $c$K7RQ2$c$ $q$, current_user || $q$ cannot read tickets or marks$q$); select t.refused($q$insert into games (code, doc, status, host_token_hash) values ($c$AAAAA$c$, $c${}$c$, $c$lobby$c$, repeat($c$a$c$, 64))$q$, current_user || $q$ cannot insert games$q$); select t.refused($q$update games set status = $c$done$c$ $q$, current_user || $q$ cannot update games$q$); select t.refused($q$delete from games$q$, current_user || $q$ cannot delete games$q$); select t.refused($q$insert into players (code, pid, token_hash, ticket) values ($c$K7RQ2$c$, $c$px$c$, repeat($c$d$c$, 64), $c$[]$c$)$q$, current_user || $q$ cannot insert players$q$); select t.refused($q$update players set marks = $c${1,2,3}$c$ $q$, current_user || $q$ cannot update players$q$); select t.refused($q$delete from players$q$, current_user || $q$ cannot delete players$q$); select t.refused($q$insert into notify_numbers (phone) values ($c$9999999999$c$)$q$, current_user || $q$ cannot insert notify_numbers$q$); select t.refused($q$update notify_numbers set phone = $c$9999999999$c$ $q$, current_user || $q$ cannot update notify_numbers$q$); select t.refused($q$delete from notify_numbers$q$, current_user || $q$ cannot delete notify_numbers$q$); select t.refused($q$truncate games cascade$q$, current_user || $q$ cannot truncate$q$); select t.refused($q$select commit_game($c$K7RQ2$c$, 3, $c${"status":"done"}$c$)$q$, current_user || $q$ cannot call commit_game (update)$q$); select t.refused($q$select commit_game($c$BBBBB$c$, null, $c${"status":"lobby"}$c$, $c$[]$c$, repeat($c$a$c$, 64))$q$, current_user || $q$ cannot call commit_game (create)$q$); select t.refused($q$select purge_expired_games()$q$, current_user || $q$ cannot call purge_expired_games$q$); select t.refused($q$select purge_expired_games(1)$q$, current_user || $q$ cannot call purge_expired_games with a retention$q$); select t.refused($q$select admin_retention_days()$q$, current_user || $q$ cannot call admin_retention_days$q$); select t.refused($q$select admin_list_games()$q$, current_user || $q$ cannot call admin_list_games$q$); select t.refused($q$select admin_get_game($c$K7RQ2$c$)$q$, current_user || $q$ cannot call admin_get_game$q$); select t.refused($q$select admin_game_row(null::games)$q$, current_user || $q$ cannot call admin_game_row$q$); select t.refused($q$select erased_at from games$q$, current_user || $q$ cannot read the new erased_at column$q$);'

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

-- ------------------------------------------------------------ expiry and retention
set role service_role;
select commit_game('AAAA2', null, '{"status":"live","name":"Old game","hostName":"Asha","players":[{"pid":"p1","name":"Asha"},{"pid":"p2","name":"Meera"}],"called":[5,17],"events":[{"seq":1,"kind":"start"}]}',
  jsonb_build_array(
    jsonb_build_object('pid', 'p1', 'token_hash', :'h3', 'ticket', '[[1,0,0],[0,2,0],[0,0,3]]'::jsonb, 'marks', '[1]'::jsonb, 'rev', null),
    jsonb_build_object('pid', 'p2', 'token_hash', :'h2', 'ticket', '[[4,0,0],[0,5,0],[0,0,6]]'::jsonb, 'marks', '[5]'::jsonb, 'rev', null)), :'h3');
select commit_game('AAAA3', null, '{"status":"lobby"}', '[]', :'h3');
reset role;
update games set updated_at = now() - interval '25 hours' where code = 'AAAA2';
update games set updated_at = now() - interval '23 hours' where code = 'AAAA3';
set role service_role;

-- an expired game cannot be written to any more, even before the purge has run
select t.refused($$select commit_game('AAAA2', 1, '{"status":"done","version":2}')$$, 'a commit to a game idle for 24 hours is rejected', array['40001']);
select t.refused($$select commit_game('AAAA2', 1, null, '[{"pid":"p1","ticket":[[9,0,0]],"marks":[],"rev":1}]')$$, 'a marks-only commit to an expired game is rejected', array['40001']);
-- its code is NOT free: the row is retained for the statistics
select t.refused($$select commit_game('AAAA2', null, '{"status":"lobby","name":"new"}', '[]', repeat('b', 64))$$,
                 'the code of an expired but retained game cannot be reused', array['23505']);
select t.ok((select doc ->> 'name' = 'Old game' from games where code = 'AAAA2') and (select count(*) = 2 from players where code = 'AAAA2'),
            '...and the retained game is untouched by the attempt');

-- the purge at 24 hours: tickets and dabs are erased, the document and the stripped rows stay
select t.ok(purge_expired_games() = 1, 'purge handles exactly the one expired game');
select t.ok((select count(*) = 2 from players where code = 'AAAA2'), 'the player rows of an expired game are kept');
select t.ok((select bool_and(ticket = '[]'::jsonb and marks = '{}') from players where code = 'AAAA2'), '...but every ticket and every dab is erased');
select t.ok((select array_agg(token_hash order by pid) = array[:'h3', :'h2'] from players where code = 'AAAA2'), '...and code, pid and token_hash are still there to count devices');
select t.ok((select erased_at is not null and doc ->> 'name' = 'Old game' and doc -> 'called' = '[5,17]'::jsonb and jsonb_array_length(doc -> 'players') = 2 and status = 'live'
               from games where code = 'AAAA2'), 'the public document of an expired game is kept, and the game is marked erased');
select t.ok((select updated_at < now() - interval '24 hours' from games where code = 'AAAA2'), 'erasing does not count as activity');
select t.ok((select erased_at is null from games where code = 'AAAA3') and (select erased_at is null from games where code = 'K7RQ2'),
            'games idle for less than 24 hours are not erased');
select t.ok((select ticket <> '[]'::jsonb and marks = '{2}' from players where code = 'K7RQ2' and pid = 'p2'), '...and their tickets and dabs are untouched');
select t.ok(purge_expired_games() = 0, 'purging again changes nothing');
select t.refused($$select commit_game('AAAA2', 1, '{"status":"done","version":2}')$$, 'an erased game can never be written to again', array['40001']);
reset role;
-- even if its clock were somehow moved forward, an erased game stays closed
update games set updated_at = now() where code = 'AAAA2';
set role service_role;
select t.refused($$select commit_game('AAAA2', 1, '{"status":"done","version":2}')$$, '...not even if its last-activity time is touched afterwards', array['40001']);
reset role;

-- retention: kept up to 90 days after the last activity, then deleted for good
update games set updated_at = now() - interval '89 days 23 hours' where code = 'AAAA2';
set role service_role;
select t.ok(purge_expired_games() = 0 and (select count(*) = 1 from games where code = 'AAAA2'), 'an expired game is still kept just under 90 days');
select t.refused($$select commit_game('AAAA2', null, '{"status":"lobby"}', '[]', repeat('b', 64))$$, '...and its code is still taken', array['23505']);
reset role;
update games set updated_at = now() - interval '90 days 1 minute' where code = 'AAAA2';
set role service_role;
select t.ok(purge_expired_games() = 1, 'after 90 days the purge deletes the game');
select t.ok((select count(*) = 0 from games where code = 'AAAA2') and (select count(*) = 0 from players where code = 'AAAA2'), '...and its player rows with it');
select t.ok((select array_agg(code order by code) = '{AAAA3,K7RQ2}' from games), 'the other games are kept');
-- the retention is a parameter
reset role;
update games set updated_at = now() - interval '3 days' where code = 'AAAA3';
set role service_role;
select t.ok(purge_expired_games() = 1, 'with the default retention a 3-day-old game is handled once');
select t.ok((select erased_at is not null from games where code = 'AAAA3'), '...it is only erased, not deleted');
select t.ok(purge_expired_games(2) = 1, 'purge_expired_games(2) handles it again');
select t.ok((select count(*) = 0 from games where code = 'AAAA3'), '...this time it is deleted');
select t.refused($$select purge_expired_games(0)$$, 'a retention under 1 day is refused', array['22023']);
-- a code past the retention period can be reused straight away, before the purge runs
select commit_game('AAAA4', null, '{"status":"lobby","name":"ancient"}', jsonb_build_array(jsonb_build_object('pid', 'p1', 'token_hash', :'h3', 'ticket', '[]'::jsonb, 'marks', '[]'::jsonb, 'rev', null)), :'h3');
reset role;
update games set updated_at = now() - interval '91 days' where code = 'AAAA4';
set role service_role;
select t.ok(commit_game('AAAA4', null, '{"status":"lobby","name":"new"}', '[]', :'h2') = 1, 'the code of a game past the retention period can be reused');
select t.ok((select doc ->> 'name' = 'new' and host_token_hash = :'h2' from games where code = 'AAAA4') and (select count(*) = 0 from players where code = 'AAAA4'),
            '...and the old game and its players are gone');
delete from games where code = 'AAAA4';
-- activity keeps a game alive: any commit moves updated_at
reset role;
update games set updated_at = now() - interval '23 hours 59 minutes' where code = 'K7RQ2';
set role service_role;
select commit_game('K7RQ2', 3, null, '[]');
select t.ok((select updated_at > now() - interval '1 minute' from games where code = 'K7RQ2'), 'a commit (even marks-only) counts as activity');
reset role;

-- ------------------------------------------------------------ admin reads
-- Seed: K7RQ2 (live, 2 players, host h1) is there already. Add a finished game, a lobby and an expired one.
set role service_role;
select commit_game('BBBB2', null,
  '{"code":"BBBB2","name":"Kitty 100%_Party","hostName":"Sunita","status":"done","price":50,"round":1,"called":[1,2,3],"players":[{"pid":"p1","name":"Sunita","joinedAt":1000},{"pid":"p2","name":"Meera","joinedAt":2000},{"pid":"p3","name":"Nani","joinedAt":3000}],"prizes":[{"id":"full","rule":"full","label":"Full House","winnerPid":"p2","winnerName":"Meera","wonAt":5000,"amount":150}],"events":[{"seq":1,"at":4000,"kind":"start"},{"seq":2,"at":5000,"kind":"win","pid":"p2","name":"Meera","prizeId":"full","label":"Full House"}]}',
  jsonb_build_array(
    jsonb_build_object('pid', 'p1', 'token_hash', :'h1', 'ticket', '[[11,0,0],[0,12,0],[0,0,13]]'::jsonb, 'marks', '[11]'::jsonb, 'rev', null),
    jsonb_build_object('pid', 'p2', 'token_hash', :'h2', 'ticket', '[[21,0,0],[0,22,0],[0,0,23]]'::jsonb, 'marks', '[21,22]'::jsonb, 'rev', null),
    jsonb_build_object('pid', 'p3', 'token_hash', :'h3', 'ticket', '[[31,0,0],[0,32,0],[0,0,33]]'::jsonb, 'marks', '[]'::jsonb, 'rev', null)), :'h1');
select commit_game('CCCC2', null, '{"code":"CCCC2","name":"Sunday","hostName":"Ravi","status":"lobby","players":[],"events":[]}', '[]', :'h3');
select commit_game('DDDD2', null, '{"code":"DDDD2","name":"Forgotten","hostName":"Ravi","status":"live","players":[{"pid":"p1","name":"Ravi"}],"events":[]}',
  jsonb_build_array(jsonb_build_object('pid', 'p1', 'token_hash', :'h3', 'ticket', '[[41,0,0]]'::jsonb, 'marks', '[41]'::jsonb, 'rev', null)), :'h3');
reset role;
update games set created_at = now() - interval '10 days', updated_at = now() - interval '10 days' where code = 'BBBB2';
update games set created_at = now() - interval '2 hours' where code = 'CCCC2';
update games set created_at = now() - interval '3 days', updated_at = now() - interval '2 days' where code = 'DDDD2';
update games set created_at = now() - interval '1 hour' where code = 'K7RQ2';
set role service_role;
select purge_expired_games();

create temp table adm as select admin_list_games(p_limit => 100) as j;
select t.ok((select (j ->> 'total')::int = 4 and jsonb_array_length(j -> 'rows') = 4 from adm), 'admin_list_games returns every game with the total');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(j -> 'rows') r) = array['K7RQ2', 'CCCC2', 'DDDD2', 'BBBB2'] from adm), 'newest first by default');
select t.ok((select (j #> '{rows,3}') ?& array['code', 'doc', 'createdAt', 'updatedAt', 'erased', 'hostDevice', 'devices']
                and (select count(*) = 7 from jsonb_object_keys(j #> '{rows,3}')) from adm), 'a row has exactly the seven admin fields');
select t.ok((select j #>> '{rows,3,hostDevice}' = 'aaaaaaaa' and j #> '{rows,3,devices}' = '{"p1":"aaaaaaaa","p2":"bbbbbbbb","p3":"cccccccc"}'::jsonb from adm),
            'devices appear only as the first 8 hex characters of their hash');
select t.ok((select (j #>> '{rows,3,erased}')::boolean and not (j #>> '{rows,0,erased}')::boolean from adm), 'erased is reported per game');
select t.ok((select jsonb_typeof(j #> '{rows,3,createdAt}') = 'number'
                and abs((j #>> '{rows,3,createdAt}')::bigint - (extract(epoch from now() - interval '10 days') * 1000)::bigint) < 60000 from adm), 'times are epoch milliseconds');
select t.ok((select j #> '{rows,3,doc,events}' = '[]'::jsonb and j #>> '{rows,3,doc,name}' = 'Kitty 100%_Party' and j #> '{rows,3,doc,called}' = '[1,2,3]'::jsonb from adm),
            'lists carry the public document without its events');
-- nothing private can be in any admin output
select t.ok((select j::text !~ '(ticket|marks|token_hash|aaaaaaaaa|bbbbbbbbb|ccccccccc)' from adm), 'the list contains no ticket, no marks and no full token hash');
select t.ok((select admin_get_game('K7RQ2')::text !~ '(ticket|marks|token_hash|aaaaaaaaa|bbbbbbbbb)'), 'admin_get_game of an ACTIVE game contains no ticket, no marks and no full token hash');
select t.ok((select jsonb_array_length(admin_get_game('BBBB2') #> '{doc,events}') = 2), 'admin_get_game includes the events');
select t.ok(admin_get_game('ZZZZZ') is null, 'admin_get_game of an unknown code is null');
-- filters
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_status => 'done') -> 'rows') r) = array['BBBB2']), 'status done');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_status => 'expired') -> 'rows') r) = array['DDDD2']), 'status expired = not finished and idle for 24 hours');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_status => 'live') -> 'rows') r) = array['K7RQ2']), 'status live leaves out expired games');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_status => 'lobby') -> 'rows') r) = array['CCCC2']), 'status lobby');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_status => 'open') -> 'rows') r) = array['K7RQ2', 'CCCC2']), 'status open = lobby or live');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_search => 'sunita') -> 'rows') r) = array['BBBB2']), 'search by host name, any case');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_search => ' sunday ') -> 'rows') r) = array['CCCC2']), 'search by game name');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_search => 'ddd') -> 'rows') r) = array['DDDD2']), 'search by code');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_search => '100%_p') -> 'rows') r) = array['BBBB2']), 'search takes % and _ literally');
select t.ok((select (admin_list_games(p_search => '%') ->> 'total')::int = 1) and (select (admin_list_games(p_search => '_') ->> 'total')::int = 1), '...so "%" or "_" alone finds only the one name that really contains it');
select t.ok((select (admin_list_games(p_search => '') ->> 'total')::int = 4), 'an empty search matches everything');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_from => now() - interval '4 days') -> 'rows') r) = array['K7RQ2', 'CCCC2', 'DDDD2']), 'from');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_from => now() - interval '11 days', p_to => now() - interval '1 day') -> 'rows') r) = array['DDDD2', 'BBBB2']), 'from and to');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_active_since => now() - interval '15 minutes') -> 'rows') r) = array['K7RQ2', 'CCCC2']), 'active since');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_device => 'bbbbbbbb') -> 'rows') r) = array['K7RQ2', 'BBBB2']), 'device filter: games a device joined');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_device => 'cccccccc') -> 'rows') r) = array['CCCC2', 'DDDD2', 'BBBB2']), 'device filter: games a device hosted without a ticket count too');
select t.ok((select (admin_list_games(p_device => 'bbbbbbb') ->> 'total')::int = 0), 'the device filter needs the whole short id');
-- sort and pages
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_sort => 'players') -> 'rows') r) = array['BBBB2', 'DDDD2', 'CCCC2', 'K7RQ2']), 'sort by players, most first (ties by code)');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_sort => 'players', p_desc => false) -> 'rows') r) = array['CCCC2', 'K7RQ2', 'DDDD2', 'BBBB2']), 'sort by players, fewest first');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_sort => 'activity') -> 'rows') r) = array['K7RQ2', 'CCCC2', 'DDDD2', 'BBBB2']
          or array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_sort => 'activity') -> 'rows') r) = array['CCCC2', 'K7RQ2', 'DDDD2', 'BBBB2']), 'sort by last activity');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_sort => 'created', p_desc => false) -> 'rows') r) = array['BBBB2', 'DDDD2', 'CCCC2', 'K7RQ2']), 'sort by created, oldest first');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(j -> 'rows') r) = array['DDDD2', 'BBBB2'] and (j ->> 'total')::int = 4
               from (select admin_list_games(p_limit => 2, p_offset => 2) as j) x), 'limit and offset page through, total stays the full count');
select t.ok((select jsonb_array_length(admin_list_games(p_limit => 0) -> 'rows') = 1 and jsonb_array_length(admin_list_games(p_limit => 2, p_offset => 99) -> 'rows') = 0), 'odd limits and offsets are safe');
select t.ok((select jsonb_array_length(admin_list_games(p_sort => 'nonsense; drop table games') -> 'rows') = 4), 'an unknown sort falls back to created');
reset role;
