-- Row-Level Security: client_user role sees only its own client's rows;
-- admin role sees/manages everything via the is_admin() bypass policies.
--
-- Each policy is dropped before being (re)created so this migration can be
-- re-run safely (`create policy` itself has no `if not exists` support).

alter table public.clients enable row level security;
alter table public.profiles enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_stats_daily enable row level security;
alter table public.reports enable row level security;

-- clients --------------------------------------------------------------

drop policy if exists "admins manage all clients" on public.clients;
create policy "admins manage all clients"
  on public.clients for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "client_users read own client" on public.clients;
create policy "client_users read own client"
  on public.clients for select
  using (id = public.current_client_id());

-- profiles ---------------------------------------------------------------

drop policy if exists "admins manage all profiles" on public.profiles;
create policy "admins manage all profiles"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
  on public.profiles for select
  using (id = auth.uid());

-- campaigns ----------------------------------------------------------------

drop policy if exists "admins manage all campaigns" on public.campaigns;
create policy "admins manage all campaigns"
  on public.campaigns for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "client_users read own campaigns" on public.campaigns;
create policy "client_users read own campaigns"
  on public.campaigns for select
  using (client_id = public.current_client_id());

-- campaign_stats_daily -------------------------------------------------------

drop policy if exists "admins manage all campaign stats" on public.campaign_stats_daily;
create policy "admins manage all campaign stats"
  on public.campaign_stats_daily for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "client_users read own campaign stats" on public.campaign_stats_daily;
create policy "client_users read own campaign stats"
  on public.campaign_stats_daily for select
  using (
    exists (
      select 1 from public.campaigns c
      where c.id = campaign_stats_daily.campaign_id
        and c.client_id = public.current_client_id()
    )
  );

-- reports ------------------------------------------------------------------

drop policy if exists "admins manage all reports" on public.reports;
create policy "admins manage all reports"
  on public.reports for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "client_users read own reports" on public.reports;
create policy "client_users read own reports"
  on public.reports for select
  using (client_id = public.current_client_id());
