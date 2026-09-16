-- Helper functions used by RLS policies and the admin UI.

-- Returns true if the currently-authenticated user is an Optitech admin.
-- security definer + fixed search_path so it can read public.profiles
-- regardless of the caller's own row-level access.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Returns the client_id of the currently-authenticated client_user (or null
-- for admins / unauthenticated callers).
create or replace function public.current_client_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select client_id from public.profiles where id = auth.uid();
$$;

-- Auto-provisions a profile row when a new auth.users row is created, so
-- every login always has a matching profile. New users default to
-- client_user with no client assigned; an admin must assign client_id (via
-- the admin UI) or promote the user to role = 'admin' by hand.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, client_id)
  values (new.id, new.email, 'client_user', null)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Admin-only RPC: store/replace a client's Lemlist API key in Supabase
-- Vault and point clients.lemlist_api_key_secret_id at it. Called from the
-- admin "Add client" / "Edit client" screens instead of writing the column
-- directly, so the raw key only ever passes through this function.
create or replace function public.admin_set_client_lemlist_key(
  p_client_id uuid,
  p_api_key text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing_secret_id uuid;
  v_secret_name text := 'lemlist_api_key_' || p_client_id::text;
begin
  if not public.is_admin() then
    raise exception 'only admins can set client Lemlist keys';
  end if;

  select lemlist_api_key_secret_id into v_existing_secret_id
  from public.clients where id = p_client_id;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_api_key);
  else
    v_existing_secret_id := vault.create_secret(p_api_key, v_secret_name);
    update public.clients
      set lemlist_api_key_secret_id = v_existing_secret_id
      where id = p_client_id;
  end if;
end;
$$;

grant execute on function public.admin_set_client_lemlist_key(uuid, text) to authenticated;
