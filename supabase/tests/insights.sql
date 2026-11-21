-- Tests of migration 0003 (insights). Run by supabase/tests/run.sh on a fresh database after helpers.sql.
-- Every check raises on failure (psql runs with ON_ERROR_STOP), so reaching the end means it passed.
\set h1 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
\set h2 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
\set h3 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
\pset tuples_only on
\pset format unaligned

-- ------------------------------------------------------------ shape
select t.ok((select count(*) = 8 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity),
            'row level security is enabled on all eight tables');
select t.ok((select count(*) = 8 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'),
            'public has exactly eight tables (games, players, notify_numbers, devices, device_ips, participations, events, admin_audit)');
select t.ok((select count(*) = 0 from pg_policies where schemaname = 'public'), 'there are still no policies at all');
select t.ok((select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm', 'f')),
            'no view, materialized view or foreign table');
select t.ok((select count(*) = 0 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public'
                and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('public', p.oid, 'execute'))),
            'no function in public can be executed by anon, authenticated or PUBLIC');
select t.ok((select bool_and(has_function_privilege('service_role', p.oid, 'execute') and not p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
            'service_role can execute every function, and none is SECURITY DEFINER');
select t.ok((select count(*) = 0 from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon', 'authenticated', 'PUBLIC')),
            'anon, authenticated and PUBLIC hold no privilege on any table');
select t.ok((select count(*) = 0 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind = 'S' and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('authenticated', c.oid, 'usage'))),
            '...nor on any sequence');
select t.ok((select count(*) >= 6 from pg_indexes where schemaname = 'public' and tablename = 'events'), 'events is indexed by time, name, game, device and session');
select t.ok(public.insights_version() = 3, 'insights_version() says 3');

-- ------------------------------------------------------------ writes, as the server makes them
set role service_role;
select commit_game('K7RQ2', null,
  '{"code":"K7RQ2","name":"Diwali Night","hostName":"Priya","hostPid":"p1","status":"done","players":[{"pid":"p1","name":"Priya"},{"pid":"p2","name":"Meera"}],"prizes":[{"id":"top","rule":"top","label":"Top Line","winnerPid":"p2","winnerName":"Meera","amount":50},{"id":"full","rule":"full","label":"Full House","winnerPid":"p1","winnerName":"Priya","amount":100}],"events":[{"seq":1,"kind":"join","pid":"p2","name":"Meera"},{"seq":2,"kind":"start"},{"seq":3,"kind":"win","pid":"p2","name":"Meera","prizeId":"top","label":"Top Line"}],"history":[{"round":1,"prizes":[{"id":"top","winnerPid":"p2","winnerName":"Meera"},{"id":"full","winnerPid":"p1","winnerName":"Priya"}]}]}',
  jsonb_build_array(
    jsonb_build_object('pid', 'p1', 'token_hash', :'h1', 'ticket', '[[1]]'::jsonb, 'marks', '[]'::jsonb, 'rev', null),
    jsonb_build_object('pid', 'p2', 'token_hash', :'h2', 'ticket', '[[2]]'::jsonb, 'marks', '[]'::jsonb, 'rev', null)), :'h1');
select commit_game('AAAA2', null, '{"code":"AAAA2","name":"Live one","hostName":"Meera","hostPid":null,"status":"live","players":[{"pid":"p1","name":"Priya"}],"prizes":[],"events":[]}',
  jsonb_build_array(jsonb_build_object('pid', 'p1', 'token_hash', :'h1', 'ticket', '[[3]]'::jsonb, 'marks', '[]'::jsonb, 'rev', null)), :'h2');

\set ctx1 '{"tokenHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","at":1795000000000,"ip":"49.36.1.2","country":"IN","region":"MH","city":"Pune","lat":18.52,"lon":73.85,"timezone":"Asia/Kolkata","postal":"411001","deviceType":"phone","os":"Android","osVersion":"14","browser":"Chrome","browserVersion":"126","inApp":null,"ua":"Mozilla/5.0 test","language":"en-IN"}'
select t.ok(track_batch(:'ctx1'::jsonb, 'sess-0001', 'whatsapp',
  '[{"name":"session_start","at":1795000000000,"code":null,"path":"/","props":{"sw":390,"sh":844,"vw":390,"vh":700,"dpr":300,"tz":"Asia/Kolkata","touch":true,"pwa":false,"conn":"4g","ref":"l.facebook.com","utm_source":"diwali","landing":"/"}},
    {"name":"page_view","at":1795000001000,"code":null,"path":"/","props":{"page":"home"}},
    {"name":"host_created","at":1795000002000,"code":"K7RQ2","path":"/host","props":{}}]'::jsonb) = 3, 'track_batch stores the three events');
select t.ok((select sessions = 1 and ip = '49.36.1.2' and country = 'IN' and region = 'MH' and city = 'Pune' and lat = 18.52 and timezone = 'Asia/Kolkata'
                and device_type = 'phone' and os = 'Android' and browser = 'Chrome' and language = 'en-IN' and screen_w = 390 and dpr = 300 and touch and not standalone and connection = '4g'
                and first_source = 'whatsapp' and first_referrer = 'l.facebook.com' and first_utm_source = 'diwali' and first_landing = '/'
                and ins_ms(first_seen) = 1795000000000 from devices where token_hash = :'h1'),
            'the device row has the IP, the place, the device details, the screen and the first touch');
select t.ok((select count(*) = 3 and bool_and(device = :'h1' and session = 'sess-0001' and country = 'IN' and city = 'Pune' and device_type = 'phone' and source = 'whatsapp') from events),
            'every event carries the device, the session, the place and the source');
select t.ok((select hits = 1 from device_ips where token_hash = :'h1' and ip = '49.36.1.2'), 'the IP address is remembered once');

-- a later session from another network: latest IP moves, first touch stays
select track_batch((:'ctx1'::jsonb) || '{"at":1795003600000,"ip":"2405:201::1","city":"Mumbai"}', 'sess-0002', 'google',
  '[{"name":"session_start","at":1795003600000,"path":"/host","props":{"sw":412,"ref":"google.com","landing":"/host"}}]'::jsonb);
select t.ok((select sessions = 2 and ip = '2405:201::1' and city = 'Mumbai' and screen_w = 412 and screen_h = 844
                and first_source = 'whatsapp' and first_referrer = 'l.facebook.com' and first_landing = '/' and ins_ms(last_seen) = 1795003600000 and ins_ms(first_seen) = 1795000000000
               from devices where token_hash = :'h1'),
            'a second session updates the latest IP, place and screen but never the first touch');
select t.ok((select count(*) = 2 from device_ips where token_hash = :'h1'), 'both IP addresses are listed for the device');

-- a visitor with no token: events only, no device row
select track_batch('{"tokenHash":null,"at":1795000005000,"ip":"8.8.8.8","country":"US","deviceType":"desktop"}'::jsonb, 'sess-anon1', 'direct', '[{"name":"page_view","at":1795000005000,"path":"/","props":{"page":"home"}}]'::jsonb);
select t.ok((select count(*) = 1 from devices) and (select count(*) = 1 from events where device is null and country = 'US'), 'a visitor without a token gets events but no device row');
-- no IP in the request (local): nothing is overwritten with nulls
select track_batch(jsonb_build_object('tokenHash', :'h1', 'at', 1795003700000), 'sess-0002', 'google', '[]'::jsonb);
select t.ok((select ip = '2405:201::1' and city = 'Mumbai' and os = 'Android' and language = 'en-IN' from devices where token_hash = :'h1'), 'a request without IP or UA keeps what was known');

select record_participation(:'ctx1'::jsonb, 'K7RQ2', 'host', 'p1', 'Priya');
select record_participation(:'ctx1'::jsonb, 'K7RQ2', 'host', 'p1', 'Priya again');
select record_participation((:'ctx1'::jsonb) || jsonb_build_object('tokenHash', :'h2', 'ip', '1.2.3.4', 'city', 'Jaipur', 'region', 'RJ'), 'K7RQ2', 'player', 'p2', 'Meera');
select record_participation(:'ctx1'::jsonb, 'AAAA2', 'player', 'p1', 'Priya');
select record_participation((:'ctx1'::jsonb) || jsonb_build_object('tokenHash', :'h2'), 'AAAA2', 'host', null, 'Meera');
select record_participation(:'ctx1'::jsonb, 'ZZZZZ', 'host', 'p1', 'Nobody');
select t.ok((select count(*) = 4 from participations), 'participations: one per device per game; a repeat and an unknown game add nothing');
select t.ok((select games_hosted = 1 and games_joined = 1 and last_name = 'Priya' from devices where token_hash = :'h1')
        and (select games_hosted = 1 and games_joined = 1 and last_name = 'Meera' and city = 'Pune' from devices where token_hash = :'h2'),
            'the device counts hosted / joined games once each and remembers the last name');
select t.ok((select ip = '1.2.3.4' and city = 'Jaipur' and region = 'RJ' and role = 'player' and pid = 'p2' and os = 'Android' from participations where code = 'K7RQ2' and token_hash = :'h2'),
            'a participation keeps the IP, place and device of the moment');
select record_win(:'h2', 50);
select record_win(:'h2', null);
select record_win(:'h3', 10);
select t.ok((select prizes_won = 2 and amount_won = 50 from devices where token_hash = :'h2') and (select count(*) = 2 from devices), 'record_win counts wins and recorded money; an unknown device is ignored');

-- nothing the admin functions return carries a full token hash
select t.ok((select (admin_list_devices()::text || admin_get_device('aaaaaaaa')::text || admin_game_insights('K7RQ2')::text || admin_list_events()::text || admin_game_hosts(array['K7RQ2'])::text)
               !~ '(aaaaaaaaa|bbbbbbbbb|token_hash|tokenHash|ticket|marks)'), 'admin outputs show devices only as short ids — no full hash, no ticket, no marks');
select t.ok((select admin_get_device('aaaaaaaa') #>> '{device,ip}' = '49.36.1.2' and jsonb_array_length(admin_get_device('aaaaaaaa') -> 'ips') = 2), 'admin_get_device has the latest IP and the list of IPs');
select t.ok((select admin_game_hosts(array['K7RQ2', 'AAAA2']) #>> '{K7RQ2,city}' = 'Pune' and admin_game_hosts(array['K7RQ2', 'AAAA2']) #>> '{K7RQ2,source}' = 'whatsapp'
                and admin_game_hosts(array['K7RQ2', 'AAAA2']) #>> '{AAAA2,device}' = 'bbbbbbbb'), 'admin_game_hosts gives each game''s host place and first-touch source');
select t.ok((select admin_table_counts() = '{"games":2,"players":3,"notify_numbers":0,"devices":2,"device_ips":4,"participations":4,"events":5,"admin_audit":0}'::jsonb), 'admin_table_counts counts every table');
reset role;

-- ------------------------------------------------------------ plays table: the two quick filters added to admin_list_games
set role service_role;
select commit_game('PRCD2', null, '{"code":"PRCD2","name":"Paid","hostName":"Asha","status":"lobby","price":50,"players":[],"prizes":[],"events":[]}', '[]', :'h3');
reset role;
update games set updated_at = now() - interval '61 minutes' where code = 'PRCD2';
set role service_role;
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_priced => true) -> 'rows') r) = array['PRCD2']), 'admin_list_games(p_priced) keeps only games with a ticket price');
select t.ok((select array(select r ->> 'code' from jsonb_array_elements(admin_list_games(p_abandoned => true) -> 'rows') r) = array['PRCD2']), 'admin_list_games(p_abandoned) keeps only lobbies idle for over an hour');
select t.ok((select (admin_list_games() ->> 'total')::int = 3 and (admin_list_games(p_priced => false, p_abandoned => null) ->> 'total')::int = 3), '...and without them it lists everything, as before');
select t.ok((select count(*) = 1 from pg_proc where proname = 'admin_list_games'), 'there is exactly one admin_list_games (the old signature was replaced)');
reset role;
delete from games where code = 'PRCD2';

-- ------------------------------------------------------------ anon and authenticated can do nothing with any of it
\set ins_checks 'select t.refused($q$select * from devices$q$, current_user || $q$ cannot select devices$q$); select t.refused($q$select ip from device_ips$q$, current_user || $q$ cannot read IP addresses$q$); select t.refused($q$select * from participations$q$, current_user || $q$ cannot select participations$q$); select t.refused($q$select count(*) from events$q$, current_user || $q$ cannot even count events$q$); select t.refused($q$select * from admin_audit$q$, current_user || $q$ cannot select admin_audit$q$); select t.refused($q$insert into events (session, name) values ($c$sess-evil1$c$, $c$page_view$c$)$q$, current_user || $q$ cannot insert events$q$); select t.refused($q$update devices set ip = null$q$, current_user || $q$ cannot update devices$q$); select t.refused($q$delete from events$q$, current_user || $q$ cannot delete events$q$); select t.refused($q$delete from admin_audit$q$, current_user || $q$ cannot delete the audit trail$q$); select t.refused($q$select track_batch($c${}$c$::jsonb, $c$sess-evil1$c$, $c$x$c$, $c$[]$c$::jsonb)$q$, current_user || $q$ cannot call track_batch$q$); select t.refused($q$select record_participation($c${}$c$::jsonb, $c$K7RQ2$c$, $c$host$c$, null, $c$x$c$)$q$, current_user || $q$ cannot call record_participation$q$); select t.refused($q$select record_win(repeat($c$a$c$, 64), 1)$q$, current_user || $q$ cannot call record_win$q$); select t.refused($q$select purge_insights()$q$, current_user || $q$ cannot call purge_insights$q$); select t.refused($q$select insights_version()$q$, current_user || $q$ cannot call insights_version$q$); select t.refused($q$select admin_event_breakdown(now() - interval $c$1 day$c$, now(), $c$name$c$)$q$, current_user || $q$ cannot call admin_event_breakdown$q$); select t.refused($q$select admin_funnel(now() - interval $c$1 day$c$, now(), array[$c$a$c$])$q$, current_user || $q$ cannot call admin_funnel$q$); select t.refused($q$select admin_traffic_totals(now() - interval $c$1 day$c$, now())$q$, current_user || $q$ cannot call admin_traffic_totals$q$); select t.refused($q$select admin_participation_breakdown(now() - interval $c$1 day$c$, now(), $c$city$c$)$q$, current_user || $q$ cannot call admin_participation_breakdown$q$); select t.refused($q$select admin_retention(now())$q$, current_user || $q$ cannot call admin_retention$q$); select t.refused($q$select admin_list_events()$q$, current_user || $q$ cannot call admin_list_events$q$); select t.refused($q$select admin_list_devices()$q$, current_user || $q$ cannot call admin_list_devices$q$); select t.refused($q$select admin_get_device($c$aaaaaaaa$c$)$q$, current_user || $q$ cannot call admin_get_device$q$); select t.refused($q$select admin_game_insights($c$K7RQ2$c$)$q$, current_user || $q$ cannot call admin_game_insights$q$); select t.refused($q$select admin_game_hosts(array[$c$K7RQ2$c$])$q$, current_user || $q$ cannot call admin_game_hosts$q$); select t.refused($q$select admin_table_counts()$q$, current_user || $q$ cannot call admin_table_counts$q$); select t.refused($q$select admin_list_audit()$q$, current_user || $q$ cannot call admin_list_audit$q$); select t.refused($q$select admin_erase_device($c$aaaaaaaa$c$)$q$, current_user || $q$ cannot call admin_erase_device$q$); select t.refused($q$select ins_device_json(null::devices)$q$, current_user || $q$ cannot call the json helpers$q$);'
set role anon;
:ins_checks
reset role;
set role authenticated;
:ins_checks
reset role;
-- Belt and braces: with table privileges granted back, RLS with no policies still shows and changes nothing.
grant select, insert, update, delete on devices, device_ips, participations, events, admin_audit to anon, authenticated;
set role anon;
select t.ok((select count(*) = 0 from devices) and (select count(*) = 0 from device_ips) and (select count(*) = 0 from participations) and (select count(*) = 0 from events) and (select count(*) = 0 from admin_audit),
            'with privileges granted back, anon still sees no rows in any insights table (RLS, no policies)');
select t.refused($$insert into events (session, name) values ('sess-evil1', 'page_view')$$, 'with privileges granted back, anon still cannot insert an event (RLS)');
delete from events;
update devices set ip = 'x';
reset role;
revoke all on devices, device_ips, participations, events, admin_audit from anon, authenticated;
select t.ok((select count(*) = 5 from events) and (select count(*) = 0 from devices where ip = 'x'), 'nothing was changed by anon');

-- ------------------------------------------------------------ erase a device
set role service_role;
select t.refused($$select admin_erase_device('nothex!!')$$, 'the erase action needs a real short id', array['22023']);
create temp table er as select admin_erase_device('aaaaaaaa') as j;
select t.ok((select j = '{"found":true,"devices":1,"ips":2,"events":4,"participations":2,"games":2,"activeGames":2}'::jsonb from er), 'erasing device aaaaaaaa reports what was removed');
select t.ok((select count(*) = 0 from devices where token_hash = :'h1') and (select count(*) = 0 from device_ips where token_hash = :'h1')
        and (select count(*) = 0 from events where device = :'h1') and (select count(*) = 0 from participations where token_hash = :'h1'),
            'its device row, IP addresses, events and participations are gone');
select t.ok((select count(*) = 1 from devices where token_hash = :'h2') and (select count(*) = 2 from participations where token_hash = :'h2') and (select count(*) = 1 from events),
            'other devices and the anonymous visitor are untouched');
select t.ok((select doc ->> 'hostName' = 'Erased player' and doc #>> '{players,0,name}' = 'Erased player' and doc #>> '{players,1,name}' = 'Meera'
                and doc #>> '{prizes,0,winnerName}' = 'Meera' and doc #>> '{prizes,1,winnerName}' = 'Erased player'
                and doc #>> '{events,0,name}' = 'Meera' and doc #>> '{events,2,name}' = 'Meera' and doc #> '{events,1}' = '{"seq":2,"kind":"start"}'::jsonb
                and doc #>> '{history,0,prizes,1,winnerName}' = 'Erased player' and doc #>> '{history,0,prizes,0,winnerName}' = 'Meera'
                and doc ->> 'name' = 'Diwali Night' and version = 1 from games where code = 'K7RQ2'),
            'its names are replaced in the game it hosted (players, prizes, events, earlier rounds, host name) and nobody else''s');
select t.ok((select doc ->> 'hostName' = 'Meera' and doc #>> '{players,0,name}' = 'Erased player' from games where code = 'AAAA2'), '...and in the game it joined, where the host keeps her name');
select t.ok((select host_token_hash = :'h1' from games where code = 'K7RQ2') and (select count(*) = 1 from players where code = 'AAAA2' and token_hash = :'h1'),
            'games still being played keep the seat, so the game goes on');
select t.ok((select jsonb_array_length(admin_list_audit()) = 1 and admin_list_audit() #>> '{0,action}' = 'erase_device' and admin_list_audit() #>> '{0,target}' = 'aaaaaaaa'
                and admin_list_audit() #> '{0,detail}' = '{"devices":1,"ips":2,"events":4,"participations":2,"games":2,"activeGames":2}'::jsonb), 'one audit line records the erase');
reset role;
-- once the games have expired, erasing again cuts the last link: the stored hashes are replaced
update games set updated_at = now() - interval '2 days';
set role service_role;
select purge_expired_games();
select t.ok((select admin_erase_device('aaaaaaaa') = '{"found":true,"devices":0,"ips":0,"events":0,"participations":0,"games":2,"activeGames":0}'::jsonb), 'erasing again after the games expired handles the two games');
select t.ok((select count(*) = 0 from games where left(host_token_hash, 8) = 'aaaaaaaa') and (select count(*) = 0 from players where left(token_hash, 8) = 'aaaaaaaa')
        and (select bool_and(token_hash ~ '^[0-9a-f]{64}$') from players) and (select bool_and(host_token_hash ~ '^[0-9a-f]{64}$') from games),
            'no stored game points at the erased device any more');
select t.ok((select count(*) = 3 from players) and (select count(*) = 1 from players where token_hash = :'h2'), 'the other players'' rows are as they were');
select t.ok((select admin_erase_device('dddddddd') = '{"found":false,"devices":0,"ips":0,"events":0,"participations":0,"games":0,"activeGames":0}'::jsonb), 'erasing an unknown device finds nothing');
select t.ok((select jsonb_array_length(admin_list_audit()) = 3), 'every erase, even an empty one, leaves an audit line');
reset role;

-- ------------------------------------------------------------ retention: 90 days, like the game summaries
set role service_role;
select track_batch(jsonb_build_object('tokenHash', :'h3', 'ip', '9.9.9.9'), 'sess-0003', 'direct', '[{"name":"page_view","props":{"page":"home"}},{"name":"cta_host","props":{}}]'::jsonb);
reset role;
update events set at = now() - interval '89 days 23 hours' where name = 'page_view' and device = :'h3';
update events set at = now() - interval '90 days 1 minute' where name = 'cta_host';
update devices set last_seen = now() - interval '89 days' where token_hash = :'h3';
update device_ips set last_seen = now() - interval '89 days' where token_hash = :'h3';
update devices set last_seen = now() - interval '91 days' where token_hash = :'h2';
update device_ips set last_seen = now() - interval '91 days' where token_hash = :'h2';
update participations set at = now() - interval '91 days' where code = 'AAAA2';
set role service_role;
select t.ok(purge_insights() = 5, 'purge_insights deletes exactly the rows older than 90 days (1 event, 1 device, 2 IPs, 1 participation)');
select t.ok((select count(*) = 0 from events where name = 'cta_host') and (select count(*) = 1 from events where name = 'page_view' and device = :'h3'), 'an event just under 90 days old is kept, one just over is gone');
select t.ok((select count(*) = 0 from devices where token_hash = :'h2') and (select count(*) = 0 from device_ips where token_hash = :'h2') and (select count(*) = 1 from devices where token_hash = :'h3'),
            'a device not seen for 90 days is deleted with its IP addresses; a recent one stays');
select t.ok((select count(*) = 0 from participations where code = 'AAAA2') and (select count(*) = 1 from participations where code = 'K7RQ2'), 'participations (IP + place per game) go at 90 days too');
select t.ok(purge_insights() = 0, 'purging again deletes nothing');
select t.refused($$select purge_insights(0)$$, 'a retention under 1 day is refused', array['22023']);
reset role;
-- the usual clean-up call runs it too, and deleting a game takes its participations along
update events set at = now() - interval '100 days';
update games set updated_at = now() - interval '100 days' where code = 'K7RQ2';
set role service_role;
select t.ok(purge_expired_games() = 1, 'purge_expired_games still returns the number of games handled');
select t.ok((select count(*) = 0 from events) and (select count(*) = 0 from participations), '...and it purged the old events and, with the game, its participations');
select purge_expired_games(1);
select t.ok((select count(*) = 0 from devices), 'the retention argument reaches the insights too');
reset role;
