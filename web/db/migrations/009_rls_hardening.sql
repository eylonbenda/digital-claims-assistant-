-- Migration 009: RLS hardening — close the anon-key hole left by 002_grants.
-- Run in the Supabase SQL editor (dev AND prod). Idempotent: safe to re-run.
--
-- Why: 002 granted ALL on every public table (and every future one, via default
-- privileges) to `anon`, and `agencies` never had RLS enabled — so anyone holding the
-- public anon key could read/write it through PostgREST. Any future table created
-- without `enable row level security` would have been world-writable the same way.
--
-- Who uses what (verified 2026-09-30):
--   * agent dashboard + /api/claims/[id]/* → user-session client (role `authenticated`),
--     every query gated by auth.getUser() → 401/redirect first. Unchanged here.
--   * claimant /c/[token] + /api/claims/{draft,documents,submit} → service client
--     (role `service_role`, bypasses RLS). Unchanged here.
--   * anon key without a session → only GoTrue calls (signIn / getUser / signOut).
--     No code path queries a public table as `anon`, so its table grants go.
-- Routines and schema usage stay granted to anon (no data exposure; RPC surface is
-- guarded by RLS on the tables the functions read).

-- 1. agencies: enable RLS. Nothing in web/src reads it through a user-session client
--    (only the service role touches it), so no policy — deny-all for anon/authenticated.
alter table agencies enable row level security;

-- 2. anon: drop table + sequence privileges on everything that exists today.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 3. anon: stop future tables/sequences from being auto-granted to it.
--    Applies to objects created by the current role (postgres in the SQL editor —
--    the role that ran 002's grant).
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;

--    Supabase also ships default privileges owned by supabase_admin (objects created
--    via the dashboard Table Editor). Revoke those too when permitted; skip otherwise.
do $$
begin
  execute 'alter default privileges for role supabase_admin in schema public revoke all on tables from anon';
  execute 'alter default privileges for role supabase_admin in schema public revoke all on sequences from anon';
exception
  when insufficient_privilege or undefined_object then
    raise notice '009: could not alter supabase_admin default privileges (%), skipped', sqlerrm;
end $$;

-- authenticated + service_role grants are intentionally left as-is.
-- Structural backstop: web/scripts/check-rls.mjs (CI) fails any `create table`
-- in schema.sql / migrations without a matching `enable row level security`.
