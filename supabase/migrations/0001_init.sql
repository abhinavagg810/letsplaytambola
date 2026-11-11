-- Letsplaytambola — schema, row-level security and RPCs.
--
-- Privacy model
--   * games.doc      public to the game's members (host + players). Holds NO tickets or dabs.
--   * tickets        one row per player, readable ONLY by that player.
--   * game_contacts  the host's phone-contact invites, readable only by the host.
--   * Clients never write games / tickets / members directly: the `game` Edge Function
--     (service role) runs the shared engine and persists through commit_game().
--   * Phone numbers are never stored in the clear for matching: profile_phones holds
--     hmac(sha256(digits), server secret) and is not readable by clients at all.

create schema if not exists extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
set search_path = public, extensions;

-- ---------------------------------------------------------------- tables

create table public.app_secrets (
  name  text primary key,
  value text not null
);
-- Random per-project secret. To use your own, update this row BEFORE any user signs up.
insert into public.app_secrets (name, value) values ('phone_hmac', encode(gen_random_bytes(32), 'hex'));

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text not null default '' check (char_length(name) <= 40),
  username   citext unique check (username::text ~ '^[a-z0-9_]{3,15}$'),
  email      text,
  color      text not null,
  is_guest   boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profile_phones (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  phone_hash text not null unique
);

create table public.friendships (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  friend_id  uuid not null references public.profiles (id) on delete cascade,
  source     text not null default 'username' check (source in ('contact', 'username', 'played')),
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.pending_invites (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  contact_name text not null check (char_length(contact_name) <= 80),
  phone        text not null,          -- digits with country code; the owner's own contact
  phone_hash   text not null,          -- filled in by trigger
  sent_at      timestamptz,
  unique (user_id, phone_hash)
);
create index pending_invites_hash on public.pending_invites (phone_hash);

create table public.groups (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 40),
  member_ids uuid[] not null default '{}',
  unique (owner_id, name)
);

create table public.games (
  code       text primary key check (code ~ '^[A-Z0-9]{5}$'),
  host_id    uuid not null references public.profiles (id),
  status     text not null check (status in ('lobby', 'live', 'ended')),
  doc        jsonb not null,           -- GameDoc with `contacts` emptied
  version    int not null default 1,   -- optimistic concurrency, bumped on every doc write
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index games_host on public.games (host_id);

create table public.game_contacts (
  code     text primary key references public.games (code) on delete cascade,
  contacts jsonb not null default '[]'
);

create table public.game_members (
  code    text not null references public.games (code) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role    text not null check (role in ('host', 'player')),
  primary key (code, user_id)
);
create index game_members_user on public.game_members (user_id);

create table public.game_invites (
  code    text not null references public.games (code) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (code, user_id)
);
create index game_invites_user on public.game_invites (user_id);

create table public.tickets (
  code    text not null references public.games (code) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ticket  jsonb not null,
  dabs    int[] not null default '{}',
  rev     int not null default 0,      -- optimistic concurrency for the owner's own rapid dabs
  primary key (code, user_id)
);

-- ---------------------------------------------------------------- internal helpers

-- Stored hash = HMAC(client sha256 hex, server secret): a leaked table can't be brute-forced
-- back to phone numbers without the secret.
create function public.phone_hash(client_hash text) returns text
language sql stable security definer set search_path = public, extensions as $$
  select encode(hmac(lower(client_hash), (select value from app_secrets where name = 'phone_hmac'), 'sha256'), 'hex');
$$;

-- sha256 hex of the digits of a phone number — exactly what clients compute.
create function public.phone_client_hash(phone text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(digest(regexp_replace(phone, '\D', '', 'g'), 'sha256'), 'hex');
$$;

create function public.is_game_member(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from game_members where code = p_code and user_id = auth.uid());
$$;

create function public.is_game_host(p_code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from games where code = p_code and host_id = auth.uid());
$$;

create function public.peek_json(doc jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_build_object(
    'id', doc -> 'id', 'name', doc -> 'name',
    'hostName', doc -> 'hostName', 'hostColor', doc -> 'hostColor',
    'status', doc -> 'status', 'price', doc -> 'price',
    'seatsLeft', greatest(0, (doc ->> 'maxSeats')::int - jsonb_array_length(doc -> 'players')),
    'fullHouseAmt', (select p -> 'amt' from jsonb_array_elements(doc -> 'prizes') with ordinality as t (p, i)
                     where p ->> 'rule' = 'full' order by i limit 1));
$$;

-- ---------------------------------------------------------------- triggers

-- auth.users -> profiles (+ verified phone hash). Runs on sign-up and whenever the auth row changes
-- (guest upgrades to phone, phone confirmed, e-mail linked).
create function public.handle_auth_user() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  colors constant text[] := array['#FA4A98', '#FFB831', '#40D9C1', '#78AEFF', '#87D576', '#FE8674'];  -- AVATAR_COLORS
  meta_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
                                  nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), ''), 40);
  h text;
begin
  if tg_op = 'INSERT' then
    insert into profiles (id, name, email, color, is_guest)
    values (new.id, meta_name, new.email, colors[1 + (select count(*) from profiles) % 6], coalesce(new.is_anonymous, false))
    on conflict (id) do nothing;
  else
    update profiles
       set email = new.email,
           is_guest = coalesce(new.is_anonymous, false),
           name = case when name = '' then meta_name else name end
     where id = new.id;
  end if;
  if coalesce(new.phone, '') <> '' and new.phone_confirmed_at is not null then
    h := phone_hash(phone_client_hash(new.phone));
    delete from profile_phones where phone_hash = h and user_id <> new.id;
    insert into profile_phones (user_id, phone_hash) values (new.id, h)
    on conflict (user_id) do update set phone_hash = excluded.phone_hash;
  end if;
  return new;
end $$;

create trigger on_auth_user_change
  after insert or update of phone, phone_confirmed_at, email, is_anonymous, raw_user_meta_data on auth.users
  for each row execute function public.handle_auth_user();

-- A contact I invited has just verified their phone: we become friends, the pending invite goes.
create function public.resolve_pending_invites() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  with hit as (
    delete from pending_invites
     where phone_hash = new.phone_hash and user_id <> new.user_id
    returning user_id
  )
  insert into friendships (user_id, friend_id, source)
  select u, f, 'contact'
    from hit, lateral (values (hit.user_id, new.user_id), (new.user_id, hit.user_id)) as pair (u, f)
  on conflict do nothing;
  return new;
end $$;

create trigger on_profile_phone
  after insert or update on public.profile_phones
  for each row execute function public.resolve_pending_invites();

-- Hash the phone server-side; if that person is already here, befriend instead of queueing.
create function public.prepare_pending_invite() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  f uuid;
begin
  new.phone := regexp_replace(new.phone, '\D', '', 'g');
  if char_length(new.phone) not between 8 and 15 then
    return null;
  end if;
  new.phone_hash := phone_hash(phone_client_hash(new.phone));
  if exists (select 1 from pending_invites where user_id = new.user_id and phone_hash = new.phone_hash) then
    return null;   -- already queued
  end if;
  select user_id into f from profile_phones where phone_hash = new.phone_hash;
  if f is null then
    return new;
  end if;
  if f <> new.user_id then
    insert into friendships (user_id, friend_id, source)
    values (new.user_id, f, 'contact'), (f, new.user_id, 'contact')
    on conflict do nothing;
  end if;
  return null;
end $$;

create trigger before_pending_invite
  before insert on public.pending_invites
  for each row execute function public.prepare_pending_invite();

-- ---------------------------------------------------------------- client RPCs

create function public.username_available(handle text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select lower(handle) ~ '^[a-z0-9_]{3,15}$'
     and not exists (select 1 from profiles where username = handle::citext and id is distinct from auth.uid());
$$;

create function public.find_user(handle text)
returns table (id uuid, name text, username text, color text)
language sql stable security definer set search_path = public, extensions as $$
  select p.id, p.name, p.username::text, p.color
    from profiles p
   where p.username = ltrim(trim(handle), '@')::citext;
$$;

-- Friends = people I added ∪ everyone I've shared a game with.
create function public.my_friends()
returns table (id uuid, name text, username text, color text, together int)
language sql stable security definer set search_path = public as $$
  with co as (
    select m2.user_id as id, count(*)::int as together
      from game_members m1
      join game_members m2 on m2.code = m1.code and m2.user_id <> m1.user_id
     where m1.user_id = auth.uid()
     group by m2.user_id
  ), ids as (
    select friend_id as id from friendships where user_id = auth.uid()
    union
    select id from co
  )
  select p.id, p.name, p.username::text, p.color, coalesce(co.together, 0)
    from ids
    join profiles p on p.id = ids.id
    left join co on co.id = ids.id
   order by coalesce(co.together, 0) desc, p.name;
$$;

-- hashes = sha256 hex of each contact's digits. Returns only the ones that are on the app.
create function public.match_contacts(hashes text[])
returns table (phone_hash text, id uuid, name text, username text, color text)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if coalesce(array_length(hashes, 1), 0) > 2000 then
    raise exception 'too many contacts in one call' using errcode = '22023';
  end if;
  return query
    select h.client, p.id, p.name, p.username::text, p.color
      from (select distinct lower(x) as client from unnest(hashes) as x) h
      join profile_phones pp on pp.phone_hash = public.phone_hash(h.client)
      join profiles p on p.id = pp.user_id
     where p.id <> auth.uid();
end $$;

-- The hash is derived from the caller's VERIFIED auth phone; the argument only has to agree with it,
-- so nobody can claim someone else's number. (The auth.users trigger normally does this already.)
create function public.set_my_phone_hash(client_hash text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_phone text;
begin
  select u.phone into v_phone from auth.users u
   where u.id = auth.uid() and u.phone_confirmed_at is not null and coalesce(u.phone, '') <> '';
  if v_phone is null then
    raise exception 'no verified phone on this account' using errcode = '22023';
  end if;
  if phone_client_hash(v_phone) <> lower(client_hash) then
    raise exception 'hash does not match the verified phone' using errcode = '22023';
  end if;
  delete from profile_phones where phone_hash = phone_hash(lower(client_hash)) and user_id <> auth.uid();
  insert into profile_phones (user_id, phone_hash) values (auth.uid(), phone_hash(lower(client_hash)))
  on conflict (user_id) do update set phone_hash = excluded.phone_hash;
end $$;

-- Invite landing page: works signed-out. Exposes only the PeekGame fields.
create function public.peek_game(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select peek_json(doc) from games where code = upper(trim(p_code));
$$;

-- Open games I'm invited to and haven't joined.
create function public.my_invites() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select peek_json(g.doc)
    from game_invites i
    join games g on g.code = i.code
   where i.user_id = auth.uid()
     and g.status <> 'ended'
     and jsonb_array_length(g.doc -> 'players') < (g.doc ->> 'maxSeats')::int
     and not exists (select 1 from game_members m where m.code = g.code and m.user_id = auth.uid())
   order by g.created_at desc;
$$;

-- ---------------------------------------------------------------- server-only write path

-- One atomic write for the Edge Function.
--   p_version  null  -> create the game (unique_violation 23505 if the code is taken)
--              n     -> the version the caller loaded; anything else is a conflict
--   p_doc      full GameDoc when it changed, null for a ticket-only write (dab)
--   p_tickets  [{ uid, ticket, dabs, rev }]  rev = the rev the caller loaded, null for a new row
--   p_contacts host's contact invites when they changed
-- A conflict raises SQLSTATE 40001 (everything rolls back); the caller reloads and retries.
-- Members and invites are derived from the doc, so they can never drift from it.
create function public.commit_game(
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
    values (p_code, (v_doc ->> 'hostUid')::uuid, 'host')
    on conflict do nothing;
    insert into game_members (code, user_id, role)
    select p_code, (p ->> 'uid')::uuid, 'player' from jsonb_array_elements(v_doc -> 'players') p
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

-- ---------------------------------------------------------------- row-level security

alter table public.app_secrets     enable row level security;   -- no policies: server only
alter table public.profile_phones  enable row level security;   -- no policies: server only
alter table public.profiles        enable row level security;
alter table public.friendships     enable row level security;
alter table public.pending_invites enable row level security;
alter table public.groups          enable row level security;
alter table public.games           enable row level security;
alter table public.game_contacts   enable row level security;
alter table public.game_members    enable row level security;
alter table public.game_invites    enable row level security;
alter table public.tickets         enable row level security;

-- Other people's names/handles are only reachable through the RPCs above (never e-mail).
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy friendships_select on public.friendships for select to authenticated using (user_id = auth.uid());
create policy friendships_insert on public.friendships for insert to authenticated
  with check (user_id = auth.uid() and source = 'username');
create policy friendships_delete on public.friendships for delete to authenticated using (user_id = auth.uid());

create policy pending_owner on public.pending_invites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy groups_owner on public.groups for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Read-only for clients. No insert/update/delete policies exist on the four tables below.
create policy games_select_member on public.games for select to authenticated
  using (host_id = auth.uid() or public.is_game_member(code));
create policy game_contacts_select_host on public.game_contacts for select to authenticated
  using (public.is_game_host(code));
create policy game_members_select on public.game_members for select to authenticated
  using (public.is_game_member(code));
create policy game_invites_select on public.game_invites for select to authenticated
  using (user_id = auth.uid() or public.is_game_host(code));
create policy tickets_select_own on public.tickets for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------- privileges
-- Explicit, so the result doesn't depend on a project's default grants.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

grant select on public.profiles to authenticated;
grant update (name, username) on public.profiles to authenticated;
grant select, delete on public.friendships to authenticated;
grant insert (user_id, friend_id, source) on public.friendships to authenticated;
grant select, delete on public.pending_invites to authenticated;
grant insert (user_id, contact_name, phone) on public.pending_invites to authenticated;
grant update (sent_at) on public.pending_invites to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select on public.games, public.game_contacts, public.game_members, public.game_invites, public.tickets to authenticated;

grant execute on function public.is_game_member(text), public.is_game_host(text) to authenticated;
grant execute on function
  public.username_available(text), public.find_user(text), public.my_friends(),
  public.match_contacts(text[]), public.set_my_phone_hash(text), public.my_invites()
  to authenticated;
grant execute on function public.peek_game(text) to anon, authenticated;

-- ---------------------------------------------------------------- realtime
-- Members get every games row change (RLS applies to Realtime). Tickets are NOT published.

alter table public.games replica identity full;
alter publication supabase_realtime add table public.games;
