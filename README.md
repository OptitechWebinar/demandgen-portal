# Demand Gen Portal

Multi-tenant portal for Optitech's outsourced demand-gen (LinkedIn + Lemlist
outbound) service. Optitech admins manage every client from one place;
each client logs in and sees only their own campaign performance.

Stack: React + Vite + Tailwind (frontend), Supabase (Postgres + Auth + RLS),
Cloudflare Pages (hosting). See the app technical spec for the full product
scope — this README covers running and deploying what's in this repo.

## v1 scope

- Clients, campaigns, and daily campaign stats stored in Postgres, one row
  per client per Lemlist account.
- Client dashboard: overview with trend chart, per-campaign funnel detail,
  reports tab.
- Admin dashboard: all-clients list with provisioning tracker and last-sync
  time, add-client form, manual "sync now", campaign reassignment, and a
  cross-client rollup.
- A Supabase Edge Function (`lemlist-sync`) pulls stats from each client's
  own Lemlist account (their own API key, stored encrypted) and upserts
  `campaign_stats_daily`. Read-only against Lemlist — no write-back.

## Local setup

### 1. Frontend

```bash
npm install
cp .env.example .env
# fill in VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from your Supabase project
npm run dev
```

### 2. Supabase project

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push          # applies supabase/migrations/*
supabase functions deploy lemlist-sync
```

Set Edge Function secrets (Dashboard → Edge Functions → lemlist-sync →
Secrets, or via CLI):

```bash
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every
Supabase Edge Function at runtime, so the explicit `secrets set` calls above
are only needed for local `supabase functions serve`.

Supabase Vault (used to store each client's Lemlist API key) ships enabled
on hosted projects. If you're on an older or self-hosted project and
`vault.create_secret` errors as missing, enable it once via **Dashboard →
Database → Extensions → supabase_vault**.

### 3. Create the first admin user

Sign up once through the app's login screen (or Supabase Dashboard → Auth →
Add user) — this auto-creates a matching `profiles` row via the
`handle_new_user` trigger with `role = 'client_user'`. Promote it to admin:

```sql
update public.profiles set role = 'admin' where email = 'joe@optitech.example';
```

Client users are created the same way, then linked to their client with:

```sql
update public.profiles set client_id = '<client-uuid>' where email = 'someone@client.example';
```

### 4. Scheduling the sync

Add a Supabase Scheduled Function (Dashboard → Edge Functions → lemlist-sync
→ Schedules) or a `pg_cron` job that calls the function daily with the
service role key as the bearer token. The admin UI's "Sync now" button
calls the same function scoped to one client for on-demand refreshes.

## Deploying the frontend (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- Environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `public/_redirects` is included so client-side routes (e.g. `/campaigns/:id`)
  resolve correctly on refresh.

## Data model & security

See `supabase/migrations/` for the full schema. Key points:

- `clients.lemlist_api_key_secret_id` points at a Supabase Vault secret —
  the raw key is never stored in a plain column and never returned to the
  frontend. Writes go through the `admin_set_client_lemlist_key` RPC
  (admin-only, enforced in the function body).
- Row-Level Security restricts `client_user` reads to their own
  `client_id` (via `profiles.client_id`) on `clients`, `campaigns`,
  `campaign_stats_daily`, and `reports`. `admin` role has full read/write
  via bypass policies (`public.is_admin()`).
- The `lemlist-sync` function uses the service role key to bypass RLS for
  writes and to read decrypted secrets from `vault.decrypted_secrets`;
  it verifies the caller is either a signed-in admin or the service role
  itself before running.

## Repo structure

```
src/
  context/AuthContext.tsx      session + profile state
  components/                  ProtectedRoute, Layout, shared UI
  pages/client/                client-facing dashboard
  pages/admin/                 Optitech admin dashboard
  lib/                         supabase client + data-fetching helpers
  types/database.ts            row types mirroring the Postgres schema
supabase/
  migrations/                  schema, RLS, helper functions
  functions/lemlist-sync/      scheduled + on-demand Lemlist sync
  functions/_shared/lemlist.ts Lemlist REST API wrapper
```

## Known follow-ups (v1.1+)

- Migrate SAS from the folder-tagged single-account setup onto its own
  Lemlist account + this app.
- LLM-drafted weekly report generation into the `reports` table.
- Client self-serve onboarding form; commission/billing hooks.
