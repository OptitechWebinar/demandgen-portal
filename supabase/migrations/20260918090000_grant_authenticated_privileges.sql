-- Every table in this schema is RLS-protected, so these grants don't widen
-- access on their own — RLS policies remain the actual gatekeeper. But
-- Postgres checks base table-level privileges *before* evaluating RLS, and
-- these were missing for the `authenticated` role (surfaced as a genuine
-- Postgres "permission denied for table" 42501 error on every query, not
-- an RLS rejection). This is normally set up automatically by Supabase's
-- project bootstrap; this migration makes it explicit and idempotent so a
-- fresh project/environment can't end up in the same state.
grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
