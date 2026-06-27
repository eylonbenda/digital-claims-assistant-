-- Migration 002: grant table + sequence access to Supabase PostgREST roles.
-- Run in the Supabase SQL editor.
-- Without these grants, PostgREST can't INSERT/UPDATE/DELETE even with the service role key.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

-- Ensure future tables also get these grants automatically.
alter default privileges in schema public
  grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on routines  to anon, authenticated, service_role;
