-- Campaign workflow: ICP definitions, prospecting, reusable sequence
-- templates, and campaign launch. This turns campaigns from "synced
-- read-only from Lemlist" into "built in this app, then pushed to Lemlist".

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.icp_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null,
  -- Free-form: industry, company size range, title/seniority, geography,
  -- signals. Kept as jsonb rather than columns-per-field since ICP shape
  -- varies a lot client to client and criteria sets grow over time.
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists icp_profiles_client_id_idx on public.icp_profiles (client_id);

drop trigger if exists set_icp_profiles_updated_at on public.icp_profiles;
create trigger set_icp_profiles_updated_at
  before update on public.icp_profiles
  for each row execute function public.set_updated_at();

-- Reusable outreach sequence templates. client_id is nullable: null means a
-- global template usable across any client; set means a client-owned copy
-- (e.g. cloned from a template into a specific campaign before launch, so
-- later edits to the shared template don't retroactively change it).
create table if not exists public.sequences (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sequences_client_id_idx on public.sequences (client_id);

drop trigger if exists set_sequences_updated_at on public.sequences;
create trigger set_sequences_updated_at
  before update on public.sequences
  for each row execute function public.set_updated_at();

create table if not exists public.sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.sequences (id) on delete cascade,
  step_order integer not null,
  channel text not null default 'email'
    check (channel in ('email', 'linkedin', 'sms', 'whatsapp')),
  delay_days integer not null default 0,
  subject text,
  body text not null default '',
  created_at timestamptz not null default now(),
  unique (sequence_id, step_order)
);

create index if not exists sequence_steps_sequence_id_idx on public.sequence_steps (sequence_id);

-- Campaigns now originate in this app (staged, no Lemlist id yet) before
-- being launched into Lemlist, in addition to campaigns discovered by the
-- existing sync. lemlist_campaign_id becomes nullable to allow that.
alter table public.campaigns alter column lemlist_campaign_id drop not null;

alter table public.campaigns
  add column if not exists sequence_id uuid references public.sequences (id) on delete set null,
  add column if not exists icp_profile_id uuid references public.icp_profiles (id) on delete set null,
  add column if not exists launched_at timestamptz,
  add column if not exists launch_error text;

-- Staged prospects, sourced from UpLead search or a CSV import, before
-- they're attached to a campaign and pushed to Lemlist as leads.
create table if not exists public.prospects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  icp_profile_id uuid references public.icp_profiles (id) on delete set null,
  campaign_id uuid references public.campaigns (id) on delete set null,
  source text not null check (source in ('uplead', 'csv_import')),
  external_id text,
  first_name text,
  last_name text,
  email text,
  title text,
  company_name text,
  company_domain text,
  linkedin_url text,
  location text,
  -- Full source payload (UpLead's raw result, or the raw CSV row) so
  -- fields we don't normalize above aren't lost.
  raw jsonb not null default '{}'::jsonb,
  status text not null default 'staged'
    check (status in ('staged', 'attached', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists prospects_client_id_idx on public.prospects (client_id);
create index if not exists prospects_campaign_id_idx on public.prospects (campaign_id);
create index if not exists prospects_status_idx on public.prospects (client_id, status);
