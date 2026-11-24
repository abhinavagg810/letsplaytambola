-- Tests of migration 0004 (the contact form). Run by supabase/tests/run.sh on a fresh database after helpers.sql.
-- Every check raises on failure (psql runs with ON_ERROR_STOP), so reaching the end means it passed.
\set h1 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
\pset tuples_only on
\pset format unaligned

-- ------------------------------------------------------------ lock-down, read from pg_catalog
select t.ok((select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'contact_messages'),
            'contact_messages has row level security enabled');
select t.ok((select count(*) = 0 from pg_policies where schemaname = 'public' and tablename = 'contact_messages'), 'contact_messages has no policy');
select t.ok(coalesce(string_agg(r.rolname || ':' || p.priv, ', '), '') = '', 'anon / authenticated / PUBLIC hold no privilege on contact_messages: ' || coalesce(string_agg(r.rolname || ':' || p.priv, ', '), 'none'))
  from (select rolname from pg_roles where rolname in ('anon', 'authenticated') union all select 'public') r
  cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p(priv)
 where has_table_privilege(r.rolname, 'public.contact_messages'::regclass, p.priv);
select t.ok((select count(*) = 0 from aclexplode((select relacl from pg_class where oid = 'public.contact_messages'::regclass)) a
              where a.grantee in (0, (select oid from pg_roles where rolname = 'anon'), (select oid from pg_roles where rolname = 'authenticated'))),
            'the table ACL itself names neither PUBLIC, anon nor authenticated');
select t.ok(coalesce(string_agg(c.relname, ', '), '') = '', 'anon / authenticated cannot use the id sequence: ' || coalesce(string_agg(c.relname, ', '), 'none'))
  from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
 where n.nspname = 'public' and c.relkind = 'S' and c.relname like 'contact_messages%'
   and (has_sequence_privilege(r.rolname, c.oid, 'USAGE') or has_sequence_privilege(r.rolname, c.oid, 'SELECT') or has_sequence_privilege(r.rolname, c.oid, 'UPDATE'));
select t.ok(count(*) = 9, 'the nine contact functions exist (' || string_agg(p.proname, ', ' order by p.proname) || ')')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('contact_version', 'save_contact_message', 'contact_json', 'admin_list_contact', 'admin_contact_unread',
                                              'admin_set_contact_read', 'admin_delete_contact', 'purge_contact', 'purge_expired_games');
select t.ok(coalesce(string_agg(p.proname || ':' || r.rolname, ', '), '') = '', 'no function is executable by anon / authenticated / PUBLIC: ' || coalesce(string_agg(p.proname || ':' || r.rolname, ', '), 'none'))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
 where n.nspname = 'public' and (has_function_privilege(r.rolname, p.oid, 'EXECUTE')
        or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
select t.ok((select bool_and(has_function_privilege('service_role', p.oid, 'execute') and not p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'),
            'service_role can execute every function, and none is SECURITY DEFINER');
select t.ok((select count(*) >= 4 from pg_indexes where schemaname = 'public' and tablename = 'contact_messages'), 'contact_messages is indexed (primary key, newest first, unread, topic)');
select t.ok(public.contact_version() = 4, 'contact_version() says 4');

-- ------------------------------------------------------------ as anon: nothing can be read, written or called
set role anon;
select t.refused('select count(*) from public.contact_messages', 'anon cannot read contact_messages');
select t.refused($s$insert into public.contact_messages (topic, message) values ('help', 'hello there friends')$s$, 'anon cannot insert a message');
select t.refused($s$select public.save_contact_message('{}'::jsonb, 'help', null, null, 'hello there friends', null)$s$, 'anon cannot call save_contact_message');
select t.refused('select public.admin_list_contact()', 'anon cannot list messages');
select t.refused('select public.admin_delete_contact(1)', 'anon cannot delete a message');
select t.refused('select public.purge_contact()', 'anon cannot run the purge');
reset role;
set role authenticated;
select t.refused('select count(*) from public.contact_messages', 'authenticated cannot read contact_messages');
select t.refused('select public.admin_contact_unread()', 'authenticated cannot count unread messages');
reset role;

-- ------------------------------------------------------------ writes and reads, as the server makes them
set role service_role;
\set ctx1 '{"tokenHash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","at":1795000000000,"ip":"49.36.1.2","country":"IN","region":"DL","city":"Delhi","lat":28.61,"lon":77.2,"timezone":"Asia/Kolkata","postal":"110001","deviceType":"phone","os":"Android","osVersion":"14","browser":"Chrome","browserVersion":"126","inApp":"WhatsApp","ua":"Mozilla/5.0 test","language":"en-IN"}'
select t.ok(save_contact_message(:'ctx1'::jsonb, 'help', 'Kamla <img src=x onerror=alert(1)>', 'kamla@example.com', E'Line one\nLine two — the game froze', '/how-to-play') > 0, 'save_contact_message stores a message and returns its id');
select t.ok(save_contact_message('{"tokenHash":null,"ip":null}'::jsonb, 'remove', null, null, '=HYPERLINK("http://x") please remove me', null) > 0, 'a message without name, reply-to, token or IP is fine');
select t.ok(save_contact_message(:'ctx1'::jsonb, 'feedback', '', '', 'Lovely game, thank you!', '/') > 0, 'empty strings for name and reply-to are stored as null');
select t.ok((select count(*) = 3 from contact_messages), 'three rows');
select t.ok((select name = 'Kamla <img src=x onerror=alert(1)>' and reply_to = 'kamla@example.com' and message = E'Line one\nLine two — the game froze' and page = '/how-to-play'
                and token_hash = :'h1' and ip = '49.36.1.2' and country = 'IN' and region = 'DL' and city = 'Delhi' and lat = 28.61 and device_type = 'phone'
                and os = 'Android' and browser = 'Chrome' and in_app = 'WhatsApp' and language = 'en-IN' and ua = 'Mozilla/5.0 test' and read_at is null
               from contact_messages where topic = 'help'), 'the message is stored exactly as sent, with the place and device of the request');
select t.ok((select name is null and reply_to is null from contact_messages where topic = 'feedback'), 'empty name and reply-to became null');
select t.refused($s$select save_contact_message('{}'::jsonb, 'money', null, null, 'hello there friends', null)$s$, 'an unknown topic is refused by the table', array['23514']);
select t.refused($s$select save_contact_message('{}'::jsonb, 'help', null, null, 'too short', null)$s$, 'a message under 10 characters is refused', array['23514']);
select t.refused($s$select save_contact_message('{}'::jsonb, 'help', null, null, repeat('x', 2001), null)$s$, 'a message over 2,000 characters is refused', array['23514']);
select t.refused($s$select save_contact_message('{}'::jsonb, 'help', repeat('n', 61), null, 'hello there friends', null)$s$, 'a name over 60 characters is refused', array['23514']);

select t.ok((select (l ->> 'total')::int = 3 and (l ->> 'unread')::int = 3 and jsonb_array_length(l -> 'rows') = 3
                and l -> 'rows' -> 0 ->> 'topic' = 'feedback' and l -> 'rows' -> 2 ->> 'topic' = 'help' from admin_list_contact() l),
            'admin_list_contact: all three, newest first, all unread');
select t.ok((select r ->> 'device' = 'aaaaaaaa' and r ->> 'city' = 'Delhi' and r ->> 'deviceType' = 'phone' and r ->> 'replyTo' = 'kamla@example.com'
                and not (r ? 'ua') and not (r ? 'lat') and not (r ? 'tokenHash') and (r ->> 'createdAt')::bigint > 0 and r -> 'readAt' = 'null'::jsonb
               from admin_list_contact('help') l, jsonb_array_elements(l -> 'rows') r),
            'a row shows the short device id and the place, but no full hash, user agent or coordinates');
select t.ok((select (admin_list_contact(p_search => 'GAME FROZE') ->> 'total')::int = 1 and (admin_list_contact(p_search => 'kamla@') ->> 'total')::int = 1
                and (admin_list_contact(p_search => '%') ->> 'total')::int = 0 and (admin_list_contact(p_search => '_') ->> 'total')::int = 0),
            'search looks in the message and the reply-to without regard to case, and % and _ are plain text');
select t.ok((admin_list_contact(p_limit => 1, p_offset => 1) -> 'rows' -> 0 ->> 'topic') = 'remove', 'paging: the second message is the second newest');

-- read / unread
select t.ok(admin_set_contact_read((select id from contact_messages where topic = 'help'), true), 'mark as read');
select t.ok((select read_at is not null from contact_messages where topic = 'help') and admin_contact_unread() = 2, 'read_at is set and the unread count goes down');
select t.ok((admin_list_contact(p_status => 'read') ->> 'total')::int = 1 and (admin_list_contact(p_status => 'unread') ->> 'total')::int = 2, 'filter by read / unread');
select t.ok(admin_set_contact_read((select id from contact_messages where topic = 'help'), false), 'mark as unread again');
select t.ok(admin_contact_unread() = 3 and (select read_at is null from contact_messages where topic = 'help'), '...and it counts as unread');
select t.ok(not admin_set_contact_read(999999, true), 'marking a message that does not exist answers false');

-- delete, with an audit line that keeps no text
select t.ok(admin_delete_contact((select id from contact_messages where topic = 'remove')), 'delete a message');
select t.ok((admin_list_contact() ->> 'total')::int = 2, '...the list has two left');
select t.ok((select count(*) = 2 from contact_messages) and not exists (select 1 from contact_messages where topic = 'remove'), 'it is gone');
select t.ok((select action = 'delete_message' and detail = '{"topic":"remove"}'::jsonb and detail::text not like '%HYPERLINK%' from admin_audit order by id desc limit 1),
            'the delete left an audit line with the id and topic only');
select t.ok(not admin_delete_contact(999999), 'deleting a message that does not exist answers false');

-- ------------------------------------------------------------ retention: 90 days after it was received, through purge_expired_games()
update contact_messages set created_at = now() - interval '91 days' where topic = 'help';
update contact_messages set created_at = now() - interval '89 days' where topic = 'feedback';
select t.ok(purge_expired_games() = 0, 'purge_expired_games() runs (it counts games only; there are none)');
select t.ok((select count(*) = 1 from contact_messages) and exists (select 1 from contact_messages where topic = 'feedback'),
            'purge_expired_games() deleted the message older than 90 days and kept the one of 89 days');
select t.ok(purge_contact(30) = 1, 'purge_contact(30) deletes what is older than 30 days');
select t.ok((select count(*) = 0 from contact_messages), '...so nothing is left');
select t.refused('select purge_contact(0)', 'a retention under 1 day is refused', array['22023']);
reset role;
