-- RLS / RPC smoke test. Run by supabase/tests/run.sh after stub_supabase.sql + the migrations.
-- Every check raises on failure (psql runs with ON_ERROR_STOP), so reaching the end means it passed.
\set host  '00000000-0000-0000-0000-0000000000a1'
\set p1    '00000000-0000-0000-0000-0000000000a2'
\set p2    '00000000-0000-0000-0000-0000000000a3'
\set out   '00000000-0000-0000-0000-0000000000a4'
\set late  '00000000-0000-0000-0000-0000000000a5'

create schema t;
grant usage on schema t to anon, authenticated, service_role;
create function t.ok(cond boolean, msg text) returns text language plpgsql as $$
begin
  if cond is not true then raise exception 'FAILED: %', msg; end if;
  return 'ok   ' || msg;
end $$;
-- Passes when the statement is refused (no privilege / RLS / SQLSTATE given) or touches no rows.
create function t.denied(stmt text, msg text, state text default '42501') returns text language plpgsql as $$
declare n int;
begin
  begin
    execute stmt;
    get diagnostics n = row_count;
  exception when others then
    if sqlstate in ('42501', state) then return 'ok   ' || msg || ' (' || sqlstate || ')'; end if;
    raise;
  end;
  if n > 0 then raise exception 'FAILED: % — statement changed % row(s)', msg, n; end if;
  return 'ok   ' || msg || ' (0 rows)';
end $$;
create function t.login(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;
grant execute on all functions in schema t to anon, authenticated, service_role;
select phone_client_hash('+91 98100 11001') as h_host, phone_client_hash('+91 98100 11014') as h_p1, phone_client_hash('919999999999') as h_none \gset
\pset tuples_only on
\pset format unaligned

-- ------------------------------------------------------------ sign-ups (what Supabase Auth does)
insert into auth.users (id, raw_user_meta_data, phone, phone_confirmed_at) values
  (:'host', '{"name": "Nani"}',  '919810011001', now()),
  (:'p1',   '{"full_name": "Rahul Verma"}', '919810011014', now());
insert into auth.users (id, raw_user_meta_data, is_anonymous) values (:'p2', '{"name": "Guest Gita"}', true);
insert into auth.users (id, email) values (:'out', 'out@example.com');

select t.ok((select count(*) from profiles) = 4, 'profiles auto-created for every auth user');
select t.ok((select name = 'Rahul Verma' and color = '#FFB831' and not is_guest from profiles where id = :'p1'), 'profile name from metadata, colour by sign-up order');
select t.ok((select is_guest from profiles where id = :'p2'), 'anonymous sign-in is a guest');
select t.ok((select count(*) from profile_phones) = 2, 'verified phones are hashed automatically');
select t.ok((select phone_hash <> phone_client_hash('919810011001') and length(phone_hash) = 64 from profile_phones where user_id = :'host'),
            'stored hash is the HMAC, not the client hash');

-- ------------------------------------------------------------ a game, written the way the Edge Function does
set role service_role;
select commit_game('AB2CD', null, jsonb_build_object(
  'id', 'AB2CD', 'name', 'Diwali night', 'hostUid', :'host', 'hostName', 'Nani', 'hostColor', '#FA4A98',
  'status', 'lobby', 'maxSeats', 5, 'price', 50, 'version', 1,
  'prizes', '[{"id":"top","rule":"top","amt":75},{"id":"full","rule":"full","amt":250},{"id":"full2","rule":"full","amt":100}]'::jsonb,
  'players', jsonb_build_array(jsonb_build_object('uid', :'p1', 'name', 'Rahul'), jsonb_build_object('uid', :'p2', 'name', 'Gita')),
  'invited', jsonb_build_array(jsonb_build_object('uid', :'out', 'name', 'Outsider')),
  'contacts', '[{"id":"c1","name":"Kamla","phone":"919810011005","sent":false}]'::jsonb),
  jsonb_build_array(
    jsonb_build_object('uid', :'p1', 'ticket', '[[1,0,0],[0,0,0],[0,0,0]]'::jsonb, 'dabs', '[]'::jsonb),
    jsonb_build_object('uid', :'p2', 'ticket', '[[2,0,0],[0,0,0],[0,0,0]]'::jsonb, 'dabs', '[]'::jsonb)),
  '[{"id":"c1","name":"Kamla","phone":"919810011005","sent":false}]');
select t.denied($$select commit_game('AB2CD', null, '{"hostUid":"00000000-0000-0000-0000-0000000000a1","status":"lobby"}')$$,
                'creating a game with a taken code is a unique violation', '23505');
reset role;
select t.ok((select count(*) from game_members where code = 'AB2CD') = 3, 'members derived from doc (host + 2 players)');
select t.ok((select doc -> 'contacts' = '[]' from games where code = 'AB2CD'), 'contacts are stripped from the public doc');

-- ------------------------------------------------------------ (a) tickets are private
set role authenticated;
select t.login(:'p1');
select t.ok((select count(*) from tickets) = 1 and (select user_id from tickets) = :'p1', '(a) a player sees only their own ticket row');
select t.ok((select count(*) from tickets where user_id = :'p2') = 0, '(a) a player cannot select another player''s ticket');
select t.login(:'host');
select t.ok((select count(*) from tickets) = 0, '(a) not even the host can read players'' tickets');

-- ------------------------------------------------------------ (b) non-members see nothing
select t.login(:'out');
select t.ok((select count(*) from games) = 0, '(b) a non-member cannot select the game');
select t.ok((select count(*) from game_members) = 0, '(b) a non-member cannot list members');
select t.ok((select count(*) from game_contacts) = 0, '(b) a non-member cannot read host contacts');
select t.ok((select count(*) from game_invites) = 1, 'an invitee sees their own invite');
select t.ok((select count(*) from my_invites()) = 1 and (select my_invites() ->> 'seatsLeft') = '3', 'my_invites() lists the open game');

-- ------------------------------------------------------------ (c) members can read the game
select t.login(:'p1');
select t.ok((select doc ->> 'name' from games where code = 'AB2CD') = 'Diwali night', '(c) a member can select the game');
select t.ok((select count(*) from game_members) = 3, '(c) a member can list members');
select t.ok((select count(*) from game_contacts) = 0, 'a player cannot read the host''s contact invites');
select t.ok((select count(*) from my_invites()) = 0, 'a joined player has no pending invite');
select t.login(:'host');
select t.ok((select count(*) from games) = 1 and (select jsonb_array_length(contacts) from game_contacts) = 1, '(c) the host reads the game and its contacts');

-- ------------------------------------------------------------ (d) clients cannot write game state
select t.login(:'p1');
select t.denied($$update games set doc = doc || '{"called":[1]}'$$, '(d) client cannot update games');
select t.denied($$delete from games$$, '(d) client cannot delete games');
select t.denied($$insert into games (code, host_id, status, doc) values ('ZZZZZ', auth.uid(), 'lobby', '{}')$$, '(d) client cannot insert games');
select t.denied($$update tickets set dabs = '{1}'$$, '(d) client cannot update tickets, even their own');
select t.denied($$insert into tickets (code, user_id, ticket) values ('AB2CD', auth.uid(), '[]')$$, '(d) client cannot insert tickets');
select t.denied($$insert into game_members values ('AB2CD', '00000000-0000-0000-0000-0000000000a4', 'player')$$, '(d) client cannot add members');
select t.denied($$select commit_game('AB2CD', 1, null)$$, '(d) client cannot call commit_game');
select t.denied($$select * from profile_phones$$, 'client cannot read phone hashes');
select t.denied($$select * from app_secrets$$, 'client cannot read the HMAC secret');
select t.denied($$select phone_hash('abc')$$, 'client cannot compute server hashes');
select t.denied($$update profiles set color = '#000000', is_guest = false$$, 'client cannot change colour / guest flag');
select t.denied($$update profiles set name = 'Hacked' where id <> auth.uid()$$, 'client cannot edit someone else''s profile');
select t.ok((select count(*) from profiles) = 1, 'client reads only their own profile row');
reset role;
select t.ok((select version = 1 and doc -> 'called' is null from games) and (select count(*) from tickets) = 2, '(d) nothing was changed by the attempts above');

-- Same again with Supabase's widest default grants: RLS alone must still hold.
grant all on games, tickets, game_members to authenticated;
set role authenticated;
select t.denied($$update games set doc = doc || '{"called":[1]}'$$, '(d) RLS alone blocks updating games');
select t.denied($$delete from games$$, '(d) RLS alone blocks deleting games');
select t.denied($$update tickets set dabs = '{1}'$$, '(d) RLS alone blocks updating own ticket');
select t.denied($$insert into tickets (code, user_id, ticket) values ('AB2CD', auth.uid(), '[]')$$, '(d) RLS alone blocks inserting tickets');
select t.denied($$insert into game_members values ('AB2CD', '00000000-0000-0000-0000-0000000000a4', 'player')$$, '(d) RLS alone blocks adding members');
select t.ok((select count(*) from tickets) = 1, '(a) RLS alone still hides other tickets');
reset role;
revoke insert, update, delete, truncate, references, trigger on games, tickets, game_members from authenticated;

-- ------------------------------------------------------------ (e) peek works signed-out
set role anon;
select t.login('');
select t.ok(peek_game('ab2cd') = '{"id":"AB2CD","name":"Diwali night","hostName":"Nani","hostColor":"#FA4A98","status":"lobby","price":50,"seatsLeft":3,"fullHouseAmt":250}'::jsonb,
            '(e) peek_game works as anon and returns only the PeekGame fields');
select t.ok(peek_game('NOPE1') is null, '(e) unknown code peeks as null');
select t.denied($$select * from games$$, '(e) anon cannot read games directly');
select t.denied($$select * from find_user('nani')$$, 'anon cannot search users');
reset role;

-- ------------------------------------------------------------ profile + social RPCs
set role authenticated;
select t.login(:'p1');
update profiles set username = 'rahul' where id = auth.uid();
select t.ok(username_available('rahul'), 'my own handle counts as available to me');
select t.login(:'host');
select t.ok(not username_available('rahul') and not username_available('RAHUL') and not username_available('ab') and username_available('nani'), 'username_available');
select t.denied($$update profiles set username = 'Rahul' where id = auth.uid()$$, 'handles are unique, case-insensitively', '23514');
select t.denied($$update profiles set username = 'rahul' where id = auth.uid()$$, 'duplicate handle is a unique violation', '23505');
select t.denied($$update profiles set username = 'no spaces' where id = auth.uid()$$, 'bad handle rejected', '23514');
select t.ok((select name from find_user('@Rahul')) = 'Rahul Verma', 'find_user by @handle');
select t.ok((select count(*) from my_friends()) = 2 and (select together from my_friends() where id = :'p1') = 1, 'my_friends() includes co-players with a together count');
select t.ok((select count(*) from match_contacts(array[:'h_p1', :'h_none'])) = 1,
            'match_contacts finds only registered numbers');
select t.ok((select count(*) from match_contacts(array[:'h_host'])) = 0, 'match_contacts never returns me');
select t.denied(format('select set_my_phone_hash(%L)', :'h_p1'), 'cannot claim someone else''s phone hash', '22023');
select set_my_phone_hash(:'h_host');
select t.login(:'out');
select t.denied(format('select set_my_phone_hash(%L)', :'h_host'), 'no verified phone, no hash', '22023');

-- groups: owner only, same name replaces
select t.login(:'host');
insert into groups (name, member_ids) values ('Kitty', array[:'p1'::uuid]);
select t.denied($$insert into groups (name) values ('Kitty')$$, 'group names are unique per owner', '23505');
select t.denied($$insert into groups (owner_id, name) values ('00000000-0000-0000-0000-0000000000a2', 'Theirs')$$, 'cannot create a group for someone else');
select t.login(:'p1');
select t.ok((select count(*) from groups) = 0, 'groups are owner-only');

-- ------------------------------------------------------------ (f) pending invite -> friendship
select t.login(:'host');
insert into pending_invites (contact_name, phone) values ('Vikram Rao', '+91 98100-11024');
insert into pending_invites (contact_name, phone) values ('Vikram again', '919810011024');     -- duplicate: ignored
insert into pending_invites (contact_name, phone) values ('Rahul Verma', '919810011014');       -- already on the app
select t.ok((select count(*) from pending_invites) = 1 and (select phone from pending_invites) = '919810011024', '(f) pending invite stored once, phone normalised');
select t.ok((select count(*) from friendships where friend_id = :'p1' and source = 'contact') = 1, '(f) inviting someone already registered befriends them at once');
update pending_invites set sent_at = now();
select t.denied($$update pending_invites set phone_hash = 'x'$$, 'client cannot tamper with the stored hash');
select t.login(:'p1');
select t.ok((select count(*) from pending_invites) = 0, 'pending invites are owner-only');
select t.ok((select count(*) from friendships where friend_id = :'host') = 1, '(f) ...in both directions');
reset role;

insert into auth.users (id, raw_user_meta_data, phone) values (:'late', '{"name": "Vikram Rao"}', '919810011024');
select t.ok((select count(*) from pending_invites) = 1, '(f) an unverified phone does not resolve the invite');
update auth.users set phone_confirmed_at = now() where id = :'late';
select t.ok((select count(*) from pending_invites) = 0, '(f) verifying the phone removes the pending invite');
select t.ok((select count(*) from friendships where (user_id, friend_id) in ((:'host', :'late'), (:'late', :'host')) and source = 'contact') = 2,
            '(f) ...and creates the friendship in both directions');
set role authenticated;
select t.login(:'host');
select t.ok((select count(*) from my_friends()) = 3 and (select together from my_friends() where id = :'late') = 0, '(f) the new friend shows up in my_friends()');
reset role;

-- guest upgrades to a phone account
update auth.users set is_anonymous = false, phone = '919810011005', phone_confirmed_at = now() where id = :'p2';
select t.ok((select not is_guest from profiles where id = :'p2') and exists (select 1 from profile_phones where user_id = :'p2'), 'guest upgrade syncs profile + phone hash');

-- ------------------------------------------------------------ commit_game concurrency contract
set role service_role;
select t.denied($$select commit_game('AB2CD', 7, '{"status":"live","hostUid":"00000000-0000-0000-0000-0000000000a1","players":[],"invited":[]}')$$,
                'stale doc version is a conflict', '40001');
select t.denied($$select commit_game('AB2CD', 1, null, '[{"uid":"00000000-0000-0000-0000-0000000000a2","ticket":[],"dabs":[1],"rev":5}]')$$,
                'stale ticket rev is a conflict', '40001');
select t.denied($$select commit_game('AB2CD', 9, null, '[{"uid":"00000000-0000-0000-0000-0000000000a2","ticket":[],"dabs":[1],"rev":0}]')$$,
                'ticket write against a stale game version is a conflict', '40001');
select commit_game('AB2CD', 1, null, jsonb_build_array(jsonb_build_object('uid', :'p1', 'ticket', '[[1,0,0]]'::jsonb, 'dabs', '[1]'::jsonb, 'rev', 0)));
select t.ok((select dabs = '{1}' and rev = 1 from tickets where user_id = :'p1') and (select version from games) = 1, 'ticket-only write bumps the ticket rev, not the game');
-- the invitee joins: doc write + new ticket + membership + invite cleared, atomically
select commit_game('AB2CD', 1,
  (select doc || jsonb_build_object('invited', '[]'::jsonb, 'status', 'live',
            'players', doc -> 'players' || jsonb_build_array(jsonb_build_object('uid', :'out', 'name', 'Outsider'))) from games),
  jsonb_build_array(jsonb_build_object('uid', :'out', 'ticket', '[[3,0,0]]'::jsonb, 'dabs', '[]'::jsonb)));
select t.ok((select version = 2 and status = 'live' from games) and (select count(*) from game_members) = 4 and (select count(*) from game_invites) = 0
            and (select jsonb_array_length(contacts) from game_contacts) = 1, 'join commits doc, ticket, member and invite together');
select t.denied($$select commit_game('AB2CD', 1, (select doc from games))$$, 'the loser of a race gets a conflict and must reload', '40001');
reset role;
set role authenticated;
select t.login(:'out');
select t.ok((select count(*) from games) = 1 and (select count(*) from tickets) = 1, 'after joining, the new member sees the game and only their ticket');
reset role;

select t.ok(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'games')
        and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'tickets'),
            'realtime publishes games, never tickets');

-- ------------------------------------------------------------ (g) delete my account (0002_delete_account.sql)
-- Rahul (p1) deletes his account. Before that, give him one of everything.
\set fresh '00000000-0000-0000-0000-0000000000a6'
set role service_role;
-- a finished game he hosted and others played: stays, as their history
select commit_game('EN2DD', null, jsonb_build_object(
  'id', 'EN2DD', 'name', 'Rahul''s party', 'hostUid', :'p1', 'hostName', 'Rahul Verma', 'hostColor', '#FFB831', 'hostUsername', 'rahul',
  'status', 'ended', 'maxSeats', 5, 'price', 20, 'version', 4,
  'prizes', '[{"id":"top","rule":"top","amt":40},{"id":"full","rule":"full","amt":60}]'::jsonb,
  'players', jsonb_build_array(jsonb_build_object('uid', :'p1', 'name', 'Rahul Verma', 'username', 'rahul'), jsonb_build_object('uid', :'host', 'name', 'Nani', 'username', null)),
  'invited', '[]'::jsonb,
  'claims', jsonb_build_object('top', jsonb_build_object('uid', :'p1', 'name', 'Rahul Verma', 'at', 5), 'full', jsonb_build_object('uid', :'host', 'name', 'Nani', 'at', 6)),
  'history', jsonb_build_array(jsonb_build_object('round', 1, 'uids', jsonb_build_array(:'p1', :'host'),
     'claims', jsonb_build_object('full', jsonb_build_object('uid', :'p1', 'name', 'Rahul Verma', 'at', 2)))),
  'feed', jsonb_build_array(
     jsonb_build_object('seq', 1, 'kind', 'start', 'text', 'Rahul started the game'),
     jsonb_build_object('seq', 2, 'kind', 'win', 'uid', :'p1', 'name', 'Rahul Verma', 'label', 'Top line', 'text', 'Top line for Rahul Verma'),
     jsonb_build_object('seq', 3, 'kind', 'win', 'uid', :'host', 'name', 'Nani', 'label', 'Full House', 'text', 'Full House for Nani'))),
  jsonb_build_array(
    jsonb_build_object('uid', :'p1', 'ticket', '[[4,0,0]]'::jsonb, 'dabs', '[4]'::jsonb),
    jsonb_build_object('uid', :'host', 'ticket', '[[5,0,0]]'::jsonb, 'dabs', '[]'::jsonb)),
  '[{"id":"c9","name":"Rahul''s aunt","phone":"919810011099","sent":true}]');
-- a lobby he hosts, and a finished game nobody else played: both go
select commit_game('LB2BY', null, jsonb_build_object(
  'id', 'LB2BY', 'name', 'Not started', 'hostUid', :'p1', 'hostName', 'Rahul Verma', 'status', 'lobby', 'maxSeats', 4, 'price', 0, 'version', 1,
  'prizes', '[]'::jsonb, 'players', jsonb_build_array(jsonb_build_object('uid', :'p2', 'name', 'Gita')), 'invited', jsonb_build_array(jsonb_build_object('uid', :'out', 'name', 'Outsider'))),
  jsonb_build_array(jsonb_build_object('uid', :'p2', 'ticket', '[[6,0,0]]'::jsonb, 'dabs', '[]'::jsonb)), '[]');
select commit_game('SL2LL', null, jsonb_build_object(
  'id', 'SL2LL', 'name', 'Solo', 'hostUid', :'p1', 'hostName', 'Rahul Verma', 'status', 'ended', 'maxSeats', 4, 'price', 0, 'version', 1,
  'prizes', '[]'::jsonb, 'players', jsonb_build_array(jsonb_build_object('uid', :'p1', 'name', 'Rahul Verma')), 'invited', '[]'::jsonb),
  jsonb_build_array(jsonb_build_object('uid', :'p1', 'ticket', '[[7,0,0]]'::jsonb, 'dabs', '[]'::jsonb)));
-- someone else's lobby where he only took a seat (freed), and one he is only invited to
select commit_game('HL2BY', null, jsonb_build_object(
  'id', 'HL2BY', 'name', 'Sunday', 'hostUid', :'host', 'hostName', 'Nani', 'status', 'lobby', 'maxSeats', 4, 'price', 0, 'version', 1,
  'prizes', '[]'::jsonb, 'players', jsonb_build_array(jsonb_build_object('uid', :'p1', 'name', 'Rahul Verma'), jsonb_build_object('uid', :'out', 'name', 'Outsider')), 'invited', '[]'::jsonb),
  jsonb_build_array(jsonb_build_object('uid', :'p1', 'ticket', '[[8,0,0]]'::jsonb, 'dabs', '[]'::jsonb), jsonb_build_object('uid', :'out', 'ticket', '[[9,0,0]]'::jsonb, 'dabs', '[]'::jsonb)));
select commit_game('NV2TE', null, jsonb_build_object(
  'id', 'NV2TE', 'name', 'Invite only', 'hostUid', :'host', 'hostName', 'Nani', 'status', 'lobby', 'maxSeats', 4, 'price', 0, 'version', 1,
  'prizes', '[]'::jsonb, 'players', '[]'::jsonb,
  'invited', jsonb_build_array(jsonb_build_object('uid', :'p1', 'name', 'Rahul Verma', 'username', 'rahul'), jsonb_build_object('uid', :'out', 'name', 'Outsider'))));
reset role;
set role authenticated;
select t.login(:'p1');
insert into groups (name, member_ids) values ('Cousins', array[:'host'::uuid]);
insert into pending_invites (contact_name, phone) values ('Old friend', '919810011077');
select t.login(:'out');
insert into friendships (user_id, friend_id, source) values (auth.uid(), :'p1', 'username');
reset role;
select count(*) as profiles_before from profiles \gset
select count(*) as tickets_before from tickets where user_id <> :'p1' and code not in ('LB2BY') \gset
select count(*) as friends_before from friendships where :'p1' not in (user_id, friend_id) \gset

-- nobody can delete anyone but themselves
set role anon;
select t.login('');
select t.denied($$select delete_my_account()$$, '(g) anon cannot call delete_my_account');
reset role;
set role authenticated;
select t.denied($$select delete_my_account()$$, '(g) no signed-in user, nothing deleted', '28000');
select t.login(:'out');
select t.denied($$delete from profiles where id = '00000000-0000-0000-0000-0000000000a2'$$, '(g) a client cannot delete someone else''s profile');
select t.denied($$delete from profiles$$, '(g) ...nor their own directly (only through the RPC)');
select t.denied($$delete from auth.users where id = '00000000-0000-0000-0000-0000000000a2'$$, '(g) a client cannot delete from auth.users');
select t.denied($$select scrub_deleted_player('{}', '00000000-0000-0000-0000-0000000000a2')$$, '(g) a client cannot run the anonymiser on its own');
select t.denied($$delete from friendships where user_id = '00000000-0000-0000-0000-0000000000a2'$$, '(g) a client cannot remove someone else''s friendships');
reset role;
select t.ok((select count(*) from profiles) = :profiles_before and exists (select 1 from auth.users where id = :'p1'), '(g) nothing was deleted by the attempts above');

-- Rahul deletes his account
set role authenticated;
select t.login(:'p1');
select delete_my_account();
select t.ok((select count(*) from profiles) = 0 and (select count(*) from games) = 0 and (select count(*) from tickets) = 0, '(g) the deleted session sees nothing');
select delete_my_account();   -- a stale token calling again finds nothing left to delete (the checks below prove it)
reset role;

select t.ok(not exists (select 1 from auth.users where id = :'p1'), '(g) the auth user is gone');
select t.ok(not exists (select 1 from profiles where id = :'p1') and not exists (select 1 from profile_phones where user_id = :'p1'), '(g) profile and phone hash are gone');
select t.ok(not exists (select 1 from friendships where :'p1' in (user_id, friend_id)), '(g) friendships are gone in both directions');
select t.ok(not exists (select 1 from groups where owner_id = :'p1') and not exists (select 1 from pending_invites where user_id = :'p1'), '(g) own groups and pending invites are gone');
select t.ok(not exists (select 1 from tickets where user_id = :'p1') and not exists (select 1 from game_members where user_id = :'p1')
        and not exists (select 1 from game_invites where user_id = :'p1'), '(g) tickets, memberships and invites are gone');
select t.ok((select member_ids = '{}' from groups where name = 'Kitty'), '(g) they are removed from other people''s groups (the group stays)');
select t.ok(not exists (select 1 from games where code in ('LB2BY', 'SL2LL')) and not exists (select 1 from tickets where code = 'LB2BY')
        and not exists (select 1 from game_invites where code = 'LB2BY'), '(g) the lobby they hosted and their solo game are deleted, with everything in them');
select t.ok(not exists (select 1 from games where doc::text like '%Rahul Verma%' or doc::text like '%"rahul"%' or doc::text like '%"Rahul"%'),
            '(g) their name and username are in no game document any more');

-- other people's data is untouched
select t.ok((select count(*) from profiles) = :profiles_before - 1, '(g) only one profile was removed');
select t.ok((select count(*) from tickets) = :tickets_before, '(g) other players'' tickets are untouched');
select t.ok((select count(*) from friendships) = :friends_before and (select count(*) from friendships where (user_id, friend_id) in ((:'host', :'late'), (:'late', :'host'))) = 2,
            '(g) other people''s friendships are untouched');
select t.ok((select name = 'Nani' from profiles where id = :'host') and (select count(*) from profile_phones) = 3, '(g) other profiles and phone hashes are untouched');

-- history survives, anonymised
select t.ok((select host_id is null and status = 'ended' and version = 2 and doc ->> 'hostName' = 'Deleted player' and doc -> 'hostUsername' = 'null'
               and doc -> 'players' -> 0 ->> 'name' = 'Deleted player' and doc -> 'players' -> 0 -> 'username' = 'null' and doc -> 'players' -> 0 ->> 'uid' = :'p1'
               and doc -> 'players' -> 1 ->> 'name' = 'Nani'
               and doc -> 'claims' -> 'top' ->> 'name' = 'Deleted player' and doc -> 'claims' -> 'full' ->> 'name' = 'Nani'
               and doc -> 'history' -> 0 -> 'claims' -> 'full' ->> 'name' = 'Deleted player'
               and doc -> 'feed' -> 0 ->> 'text' = 'Deleted player started the game'
               and doc -> 'feed' -> 1 ->> 'name' = 'Deleted player' and doc -> 'feed' -> 1 ->> 'text' = 'Top line for Deleted player'
               and doc -> 'feed' -> 2 ->> 'text' = 'Full House for Nani'
               and (doc ->> 'version')::int = 5
          from games where code = 'EN2DD'), '(g) a finished game they hosted for others stays, with every trace of the name anonymised');
select t.ok(not exists (select 1 from game_contacts where code = 'EN2DD'), '(g) ...and the contact list they picked for it is deleted');
select t.ok((select jsonb_array_length(doc -> 'players') = 1 and doc -> 'players' -> 0 ->> 'name' = 'Outsider' from games where code = 'HL2BY'), '(g) their seat in someone else''s lobby is freed');
select t.ok((select jsonb_array_length(doc -> 'invited') = 1 and doc -> 'invited' -> 0 ->> 'name' = 'Outsider' from games where code = 'NV2TE')
        and (select count(*) from game_invites where code = 'NV2TE') = 1, '(g) they are dropped from invite lists; other invitees stay');
select t.ok((select version = 3 and status = 'live' and jsonb_array_length(doc -> 'players') = 3
               and doc -> 'players' -> 0 ->> 'name' = 'Deleted player' and doc -> 'players' -> 1 ->> 'name' = 'Gita' and doc ->> 'hostName' = 'Nani'
          from games where code = 'AB2CD'), '(g) in a live game they keep their seat as "Deleted player"; version bumped so in-flight actions reload');

-- a co-player still loads the games
set role authenticated;
select t.login(:'host');
select t.ok((select doc -> 'players' -> 0 ->> 'name' from games where code = 'AB2CD') = 'Deleted player', '(g) a co-player''s game still loads, name anonymised');
select t.ok((select doc -> 'claims' -> 'top' ->> 'name' from games where code = 'EN2DD') = 'Deleted player' and (select count(*) from tickets where code = 'EN2DD') = 1,
            '(g) a co-player still sees the finished game the deleted user hosted, and their own ticket');
select t.ok((select count(*) from my_friends() where id = :'p1') = 0 and (select count(*) from my_friends()) = 3, '(g) my_friends() no longer lists them');
select t.ok((select count(*) from games) = 4, '(g) the co-player''s other games are all still there');
reset role;

-- the live game carries on: a doc write that still lists the deleted player, and deals them a ticket, commits
set role service_role;
select t.denied($$select commit_game('AB2CD', 2, (select doc from games where code = 'AB2CD'))$$, '(g) an action loaded before the deletion conflicts and reloads', '40001');
select commit_game('AB2CD', 3, (select doc || '{"called":[7]}' from games where code = 'AB2CD'),
  jsonb_build_array(jsonb_build_object('uid', :'p1', 'ticket', '[[1,0,0]]'::jsonb, 'dabs', '[]'::jsonb),
                    jsonb_build_object('uid', :'p1', 'ticket', '[[1,0,0]]'::jsonb, 'dabs', '[]'::jsonb, 'rev', 1)));
select commit_game('EN2DD', 2, (select doc from games where code = 'EN2DD'));
reset role;
select t.ok((select version = 4 and doc -> 'called' = '[7]' from games where code = 'AB2CD') and (select count(*) from game_members where code = 'AB2CD') = 3
        and (select count(*) from tickets where code = 'AB2CD') = 2 and (select count(*) from game_members where code = 'EN2DD') = 1,
            '(g) the game carries on without a membership or ticket for the deleted player');

-- the phone number is free again
insert into auth.users (id, raw_user_meta_data, phone, phone_confirmed_at) values (:'fresh', '{"name": "Rahul again"}', '919810011014', now());
select t.ok(exists (select 1 from profile_phones where user_id = :'fresh') and (select username is null from profiles where id = :'fresh'), '(g) the same number can sign up afresh, as a new empty account');
set role authenticated;
select t.login(:'fresh');
select t.ok((select count(*) from games) = 0 and (select count(*) from my_friends()) = 0 and username_available('rahul'), '(g) ...which inherits nothing, and the old username is free');
reset role;
