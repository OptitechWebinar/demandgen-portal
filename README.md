# Demand Gen Portal

Multi-tenant portal for Optitech's outsourced demand-gen (LinkedIn + Lemlist
outbound) service. Optitech admins manage every client from one place;
each client logs in and sees only their own campaign performance.

Stack: React + Vite + Tailwind (frontend), Supabase (Postgres + Auth + RLS),
Cloudflare Pages (hosting). See the app technical spec for the full product
scope — this README covers running and deploying what's in this repo.

## Scope

- Clients, campaigns, and daily campaign stats stored in Postgres, one row
  per client per Lemlist account.
- Client dashboard: overview with trend chart, per-campaign funnel detail,
  reports tab.
- Admin dashboard: all-clients list with provisioning tracker and last-sync
  time, add-client form, manual "sync now", campaign reassignment, and a
  cross-client rollup.
- A Supabase Edge Function (`lemlist-sync`) pulls stats from each client's
  own Lemlist account (their own API key, stored encrypted) and upserts
  `campaign_stats_daily`.
- **Full campaign workflow, admin-only**: define an ICP per client, source
  prospects (UpLead search or a Sales Navigator/Manycrawl CSV import),
  build reusable outreach sequence templates, then launch a campaign —
  which creates it in the client's Lemlist account, pushes the sequence,
  and imports the attached prospects as leads. Live campaigns can be
  paused/resumed, have leads added or removed, and have their sequence
  edited with changes pushed back to Lemlist. `icp_profiles`, `prospects`,
  and `sequences`/`sequence_steps` are admin-only tables — `client_user`
  has zero access, enforced by RLS (no policy at all for that role, not
  just a restrictive one).

### Where "read-only against Lemlist" no longer applies

The original v1 spec was explicitly read-only against Lemlist. That's no
longer true: `lemlist-launch-campaign`, `lemlist-campaign-control`,
`lemlist-manage-leads`, and `lemlist-edit-sequence` all write to a client's
Lemlist account. See the warning at the top of
`supabase/functions/_shared/lemlist.ts` — the write endpoints there are a
best-effort mapping to Lemlist's documented REST conventions, unverified
against a live call (unlike the read/stats path, which was confirmed
against a real account). **Do one launch against a disposable/test Lemlist
campaign before trusting this against a real client's account.**

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
supabase functions deploy uplead-search
supabase functions deploy lemlist-launch-campaign
supabase functions deploy lemlist-campaign-control
supabase functions deploy lemlist-manage-leads
supabase functions deploy lemlist-edit-sequence
```

Set Edge Function secrets (Dashboard → Edge Functions → Secrets, or via
CLI):

```bash
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
supabase secrets set UPLEAD_API_KEY=<your-shared-uplead-key>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into every
Supabase Edge Function at runtime, so those two `secrets set` calls are only
needed for local `supabase functions serve`. `UPLEAD_API_KEY` always needs
setting explicitly — it's one shared key for all of Optitech's prospecting
(not per-client, unlike the Lemlist keys), used only by `uplead-search`.

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
  `client_id` (via `profiles.client_id`) on `clients`, `campaigns`
  (launched campaigns only — `status <> 'draft'`), `campaign_stats_daily`,
  and `reports`. `admin` role has full read/write via bypass policies
  (`public.is_admin()`).
- `icp_profiles`, `prospects`, `sequences`, and `sequence_steps` have
  **only** the admin bypass policy — no `client_user` policy exists on
  these tables at all, so RLS's default-deny means that role sees zero
  rows on any operation, not just a filtered view.
- A campaign is built in-app before it exists in Lemlist:
  `campaigns.lemlist_campaign_id` is nullable, and gets set (along with
  `status = 'active'` and `launched_at`) once `lemlist-launch-campaign`
  successfully creates it. `sequences.client_id` is nullable — null means
  a reusable global template; set means a client-owned copy cloned from a
  template for one specific campaign, so editing a template later doesn't
  retroactively change campaigns already built from it.
- Every write-to-Lemlist Edge Function shares `_shared/adminAuth.ts` for
  the "caller is an admin or the service role" check, and
  `_shared/lemlist.ts` / `_shared/uplead.ts` for the actual HTTP calls —
  same pattern as `lemlist-sync`, just extended to writes.

## Repo structure

```
src/
  context/AuthContext.tsx      session + profile state
  components/                  ProtectedRoute, Layout, shared UI
  pages/client/                client-facing dashboard
  pages/admin/                 Optitech admin dashboard, incl. ICP/
                                Prospecting/Sequences/Campaign build
  lib/adminData.ts             clients/campaigns admin data access
  lib/clientData.ts            client-dashboard data access
  lib/campaignWorkflow.ts      ICP, prospects, sequences, launch/manage
  types/database.ts            row types mirroring the Postgres schema
supabase/
  migrations/                  schema, RLS, helper functions
  functions/lemlist-sync/              scheduled + on-demand stats sync
  functions/uplead-search/             admin-only UpLead search proxy
  functions/lemlist-launch-campaign/   build -> live Lemlist campaign
  functions/lemlist-campaign-control/  pause/resume a live campaign
  functions/lemlist-manage-leads/      add/remove leads on a live campaign
  functions/lemlist-edit-sequence/     push sequence edits to a live campaign
  functions/_shared/adminAuth.ts       shared admin/service-role auth check
  functions/_shared/lemlist.ts         Lemlist REST API wrapper (read+write)
  functions/_shared/uplead.ts          UpLead REST API wrapper
```

## Known follow-ups (v1.1+)

- Migrate SAS from the folder-tagged single-account setup onto its own
  Lemlist account + this app.
- LLM-drafted weekly report generation into the `reports` table.
- Client self-serve onboarding form; commission/billing hooks.
- Verify the Lemlist write endpoints and the UpLead search endpoint against
  their live APIs (see the warnings in `_shared/lemlist.ts` and
  `_shared/uplead.ts`) — do this before the first real client launch.
- Sequence template edits don't clean up orphaned campaign-owned clones
  when an admin switches a not-yet-launched campaign to a different
  template; low-cost to add a delete-the-old-clone step if it matters.
