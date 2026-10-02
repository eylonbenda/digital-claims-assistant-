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

-- 4. Functions (Supabase security advisor, 2026-10-02 on dev). Postgres grants EXECUTE
--    to PUBLIC by default, so these were callable over /rest/v1/rpc by anyone.
--    Revoking EXECUTE does not affect trigger / event-trigger firing — the privilege is
--    only checked on direct calls.
--    a) handle_new_user() — SECURITY DEFINER trigger on auth.users (001). Never meant
--       to be called directly.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

--    b) rls_auto_enable() — SECURITY DEFINER event-trigger function behind the
--       `ensure_rls` event trigger (auto-enables RLS on new public tables). Created via
--       the Supabase dashboard on dev, not by a migration; may not exist on prod.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  else
    raise notice '009: public.rls_auto_enable() not present, skipped';
  end if;
end $$;

--    c) claim_belongs_to_me(uuid) — used inside RLS policies, so `authenticated` must
--       keep EXECUTE. Pin its search_path instead (advisor: function_search_path_mutable)
--       so `claims` / `agents` can't be shadowed by objects in another schema.
alter function public.claim_belongs_to_me(uuid) set search_path = public;

-- authenticated + service_role grants are intentionally left as-is.
-- Structural backstop: web/scripts/check-rls.mjs (CI) fails any `create table`
-- in schema.sql / migrations without a matching `enable row level security`.
