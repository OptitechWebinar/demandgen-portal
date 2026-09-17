-- RLS for the new campaign-workflow tables: admin-only, full stop.
-- client_user gets no policy on these tables at all, so RLS's default-deny
-- means zero rows are ever visible to that role, on any operation.

alter table public.icp_profiles enable row level security;
alter table public.sequences enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.prospects enable row level security;

drop policy if exists "admins manage all icp profiles" on public.icp_profiles;
create policy "admins manage all icp profiles"
  on public.icp_profiles for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage all sequences" on public.sequences;
create policy "admins manage all sequences"
  on public.sequences for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage all sequence steps" on public.sequence_steps;
create policy "admins manage all sequence steps"
  on public.sequence_steps for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins manage all prospects" on public.prospects;
create policy "admins manage all prospects"
  on public.prospects for all
  using (public.is_admin())
  with check (public.is_admin());

-- Tighten the existing client_user campaigns policy: clients should only
-- ever see campaigns that have actually launched, not Optitech's staged /
-- in-progress builds sitting in 'draft'.
drop policy if exists "client_users read own campaigns" on public.campaigns;
create policy "client_users read own campaigns"
  on public.campaigns for select
  using (client_id = public.current_client_id() and status <> 'draft');
