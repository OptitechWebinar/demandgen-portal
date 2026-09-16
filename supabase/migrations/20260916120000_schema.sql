-- Demand Gen Portal: core schema
-- Tables match the spec in the app technical spec doc: clients, profiles,
-- campaigns, campaign_stats_daily, reports.

create extension if not exists pgcrypto;

-- Supabase Vault stores the per-client Lemlist API key. It ships enabled on
-- hosted Supabase projects; self-hosted stacks may need it enabled once via
-- the Dashboard (Database > Extensions > supabase_vault) or:
--   create extension if not exists supabase_vault with schema vault;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'offboarded')),
  sending_domain text,
  sender_email text,
  -- Points at a secret in Supabase Vault (vault.secrets.id) holding this
  -- client's Lemlist API key. Never store the raw key in this table.
  lemlist_api_key_secret_id uuid,
  provisioning_status text not null default 'domain_pending'
    check (provisioning_status in (
      'domain_pending', 'domain_purchased', 'mailbox_warming',
      'lemlist_connected', 'live'
    )),
  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  role text not null default 'client_user'
    check (role in ('admin', 'client_user')),
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists profiles_client_id_idx on public.profiles (client_id);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  lemlist_campaign_id text not null,
  name text not null,
  vertical text,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'completed')),
  created_at timestamptz not null default now(),
  unique (client_id, lemlist_campaign_id)
);

create index if not exists campaigns_client_id_idx on public.campaigns (client_id);

create table if not exists public.campaign_stats_daily (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  date date not null,
  sent integer not null default 0,
  opened integer not null default 0,
  replied integer not null default 0,
  clicked integer not null default 0,
  bounced integer not null default 0,
  unsubscribed integer not null default 0,
  meetings_booked integer not null default 0,
  synced_at timestamptz not null default now(),
  unique (campaign_id, date)
);

create index if not exists campaign_stats_daily_campaign_date_idx
  on public.campaign_stats_daily (campaign_id, date desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  summary_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists reports_client_id_idx
  on public.reports (client_id, period_start desc);
