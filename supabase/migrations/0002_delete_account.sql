-- Letsplaytambola — "Delete my account" (required by the App Store and Google Play).
--
-- delete_my_account() removes everything that belongs to the caller, in one transaction:
--   * profile, phone hash, friendships (both directions), groups they own, their id in other people's groups,
--     pending invites, game invites, tickets, game memberships, and finally the auth.users row
--   * games they host: deleted, unless the game is finished and other people played in it
--   * games they played in (and finished games they hosted for others): kept, so everyone else's history and
--     settle-up still add up, with their name replaced by "Deleted player" and their username removed
--   * a lobby they only sat in (no round played yet): their seat is simply freed
-- The app's demo backend does the same in src/backend/local.ts (scrubGame) — keep the two in step.

set search_path = public, extensions;

-- A finished game can outlive its host's account, so the host reference may become empty.
alter table public.games alter column host_id drop not null;
alter table public.games drop constraint games_host_id_fkey;
alter table public.games add constraint games_host_id_fkey
  foreign key (host_id) references public.profiles (id) on delete set null;

-- ---------------------------------------------------------------- the public doc without one person

-- Returns `doc` with p_uid anonymised (or, in a lobby they never played in, removed). Pure; server only.
create function public.scrub_deleted_player(doc jsonb, p_uid uuid) returns jsonb
language plpgsql immutable set search_path = public as $$
declare
  u      constant text := p_uid::text;
  gone   constant text := 'Deleted player';       -- DELETED_NAME in packages/game-core/src/data.ts
  hosts  constant boolean := coalesce(doc ->> 'hostUid' = u, false);
  played constant boolean := exists (
    select 1 from jsonb_array_elements(coalesce(doc -> 'history', '[]')) h where h -> 'uids' ? u);
  names  text[];
  d      jsonb := doc;
begin
  -- Every spelling of their name this game remembers (the live feed writes names into its text).
  select coalesce(array_agg(distinct x), '{}') into names from (
    select p ->> 'name' as x from jsonb_array_elements(coalesce(doc -> 'players', '[]')) p where p ->> 'uid' = u
    union all
    select c.value ->> 'name' from jsonb_each(coalesce(doc -> 'claims', '{}')) c where c.value ->> 'uid' = u
    union all
    select c.value ->> 'name'
      from jsonb_array_elements(coalesce(doc -> 'history', '[]')) h, jsonb_each(coalesce(h -> 'claims', '{}')) c
     where c.value ->> 'uid' = u
    union all
    select f ->> 'name' from jsonb_array_elements(coalesce(doc -> 'feed', '[]')) f where f ->> 'uid' = u
  ) s where x is not null and x <> '' and x <> gone;

  if hosts then
    d := d || jsonb_build_object('hostName', gone, 'hostUsername', null, 'contacts', '[]'::jsonb);
  end if;

  d := jsonb_set(d, '{invited}', coalesce((
    select jsonb_agg(x order by i) from jsonb_array_elements(coalesce(d -> 'invited', '[]')) with ordinality as t (x, i)
     where x ->> 'uid' is distinct from u), '[]'));

  if d ->> 'status' = 'lobby' and not played and not hosts then
    d := jsonb_set(d, '{players}', coalesce((
      select jsonb_agg(p order by i) from jsonb_array_elements(coalesce(d -> 'players', '[]')) with ordinality as t (p, i)
       where p ->> 'uid' is distinct from u), '[]'));
  else
    d := jsonb_set(d, '{players}', coalesce((
      select jsonb_agg(case when p ->> 'uid' = u then p || jsonb_build_object('name', gone, 'username', null) else p end order by i)
        from jsonb_array_elements(coalesce(d -> 'players', '[]')) with ordinality as t (p, i)), '[]'));
  end if;

  if d ? 'claims' then
    d := jsonb_set(d, '{claims}', coalesce((
      select jsonb_object_agg(c.key, case when c.value ->> 'uid' = u then c.value || jsonb_build_object('name', gone) else c.value end)
        from jsonb_each(d -> 'claims') c), '{}'));
  end if;

  if d ? 'history' then
    d := jsonb_set(d, '{history}', coalesce((
      select jsonb_agg(case when h ? 'claims' then jsonb_set(h, '{claims}', coalesce((
                 select jsonb_object_agg(c.key, case when c.value ->> 'uid' = u then c.value || jsonb_build_object('name', gone) else c.value end)
                   from jsonb_each(h -> 'claims') c), '{}')) else h end order by i)
        from jsonb_array_elements(d -> 'history') with ordinality as t (h, i)), '[]'));
  end if;

  if d ? 'feed' then
    d := jsonb_set(d, '{feed}', coalesce((
      select jsonb_agg(case
               when f ->> 'uid' = u then
                 f || case when f ? 'name' then jsonb_build_object('name', gone) else '{}'::jsonb end
                   || case when f ? 'text' then jsonb_build_object('text', (
                        select coalesce(public.replace_all(f ->> 'text', names, gone), f ->> 'text'))) else '{}'::jsonb end
               when hosts and f ->> 'kind' = 'start' then f || jsonb_build_object('text', gone || ' started the game')
               else f end order by i)
        from jsonb_array_elements(d -> 'feed') with ordinality as t (f, i)), '[]'));
  end if;

  return jsonb_set(d, '{version}', to_jsonb(coalesce((d ->> 'version')::int, 0) + 1));
end $$;

create function public.replace_all(txt text, needles text[], replacement text) returns text
language plpgsql immutable set search_path = public as $$
declare
  n text;
begin
  foreach n in array needles loop
    txt := replace(txt, n, replacement);
  end loop;
  return txt;
end $$;

-- ---------------------------------------------------------------- the RPC

-- Deletes the CALLER's account. Takes no argument on purpose: there is no way to name someone else.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare
  me constant uuid := auth.uid();
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Games they host go (tickets, members, invites and contact lists cascade) — except finished games that
  -- other people played in, which are those people's history too.
  delete from games g
   where g.host_id = me
     and (g.status <> 'ended'
          or not exists (select 1 from jsonb_array_elements(g.doc -> 'players') p where p ->> 'uid' <> me::text));
  -- The contact list of a kept game is the host's own address-book picks (names + numbers): never kept.
  delete from game_contacts where code in (select code from games where host_id = me);

  -- Anonymise them inside every remaining game they touch. Bumping `version` makes any game action that was
  -- in flight reload instead of writing the old names back; members get the change over Realtime.
  update games g
     set doc = scrub_deleted_player(g.doc, me), version = g.version + 1, updated_at = now()
   where g.host_id = me
      or exists (select 1 from game_members m where m.code = g.code and m.user_id = me)
      or exists (select 1 from game_invites i where i.code = g.code and i.user_id = me);

  update groups set member_ids = array_remove(member_ids, me) where me = any (member_ids);

  -- Their own rows. (The foreign keys would cascade from profiles; spelled out so nothing depends on that.)
  delete from tickets         where user_id = me;
  delete from game_members    where user_id = me;
  delete from game_invites    where user_id = me;
  delete from pending_invites where user_id = me;
  delete from friendships     where user_id = me or friend_id = me;
  delete from groups          where owner_id = me;
  delete from profile_phones  where user_id = me;
  delete from profiles        where id = me;     -- games.host_id of kept games becomes null

  -- Finally the sign-in itself (identities, sessions and refresh tokens cascade inside the auth schema).
  -- This function runs as its owner — the role that applies migrations (`postgres` on Supabase), which may
  -- delete from auth.users; the caller's own role cannot.
  delete from auth.users where id = me;
end $$;

-- ---------------------------------------------------------------- commit_game: tolerate a deleted player
-- A live game keeps "Deleted player" in doc.players, but that id no longer has a profile, so it can have
-- neither a membership nor a ticket. Same function as in 0001 except for the three places marked (*).
create or replace function public.commit_game(
  p_code text, p_version int, p_doc jsonb, p_tickets jsonb default '[]', p_contacts jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  t jsonb;
  n int;
  v_doc jsonb;
begin
  if p_version is null then
    insert into games (code, host_id, status, doc)
    values (p_code, (p_doc ->> 'hostUid')::uuid, p_doc ->> 'status', p_doc || '{"contacts": []}');
  elsif p_doc is not null then
    update games
       set doc = p_doc || '{"contacts": []}', status = p_doc ->> 'status', version = version + 1, updated_at = now()
     where code = p_code and version = p_version;
    if not found then
      raise exception 'version conflict' using errcode = '40001';
    end if;
  else
    perform 1 from games where code = p_code and version = p_version for share;
    if not found then
      raise exception 'version conflict' using errcode = '40001';
    end if;
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_tickets, '[]')) loop
    if not exists (select 1 from profiles where id = (t ->> 'uid')::uuid) then
      continue;   -- (*) a fresh ticket dealt to a deleted player: nothing to store
    end if;
    if jsonb_typeof(t -> 'rev') = 'number' then
      update tickets
         set ticket = t -> 'ticket',
             dabs = array(select jsonb_array_elements_text(t -> 'dabs')::int),
             rev = rev + 1
       where code = p_code and user_id = (t ->> 'uid')::uuid and rev = (t ->> 'rev')::int;
    else
      insert into tickets (code, user_id, ticket, dabs)
      values (p_code, (t ->> 'uid')::uuid, t -> 'ticket', array(select jsonb_array_elements_text(t -> 'dabs')::int))
      on conflict do nothing;
    end if;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'ticket conflict' using errcode = '40001';
    end if;
  end loop;

  if p_doc is not null then
    v_doc := p_doc;
    insert into game_members (code, user_id, role)
    select p_code, pr.id, 'host' from profiles pr where pr.id::text = v_doc ->> 'hostUid'        -- (*)
    on conflict do nothing;
    insert into game_members (code, user_id, role)
    select p_code, pr.id, 'player'
      from jsonb_array_elements(v_doc -> 'players') p
      join profiles pr on pr.id::text = p ->> 'uid'                                               -- (*)
    on conflict do nothing;
    delete from game_invites i
     where i.code = p_code
       and not exists (select 1 from jsonb_array_elements(v_doc -> 'invited') x where x ->> 'uid' = i.user_id::text);
    insert into game_invites (code, user_id)
    select p_code, pr.id
      from jsonb_array_elements(v_doc -> 'invited') x
      join profiles pr on pr.id::text = x ->> 'uid'
    on conflict do nothing;
  end if;

  if p_contacts is not null then
    insert into game_contacts (code, contacts) values (p_code, p_contacts)
    on conflict (code) do update set contacts = excluded.contacts;
  end if;
end $$;

-- ---------------------------------------------------------------- privileges
-- New functions are executable by everyone until told otherwise; same explicit style as 0001.

revoke all on function public.scrub_deleted_player(jsonb, uuid), public.replace_all(text, text[], text), public.delete_my_account()
  from public, anon, authenticated;
grant execute on function public.scrub_deleted_player(jsonb, uuid), public.replace_all(text, text[], text) to service_role;
grant execute on function public.delete_my_account() to authenticated;
