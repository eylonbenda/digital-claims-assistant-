-- 010: schema_migrations — which migrations this database has actually run.
--
-- Migrations are pasted into the Supabase SQL editor by hand (dev AND prod);
-- deploy never applies them. 007 was once missed on prod and nothing noticed for
-- days. This table lets the app tell: /api/health compares it to the migration
-- files baked into the build (EXPECTED_SCHEMA_VERSIONS, next.config.ts) and turns
-- 503 when the database is behind the code. A post-deploy workflow
-- (.github/workflows/post-deploy-health.yml) curls it after every Vercel deploy.
--
-- CONVENTION (enforced by migration-guard on every PR that adds a migration):
-- every new migration NNN_*.sql ENDS with its own row, so pasting the file is
-- what records it:
--
--   insert into public.schema_migrations(version) values ('NNN') on conflict do nothing;
--
-- The backfill below marks 001–010 applied. It includes '009' (RLS hardening,
-- a separate PR) — apply 009 before or together with this file.
--
-- Service role only: RLS on, no anon/authenticated policies, and their default
-- grants revoked. Idempotent — safe to re-run over a schema.sql that has it.

create table if not exists public.schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

alter table public.schema_migrations enable row level security;

revoke all on public.schema_migrations from anon, authenticated;
grant all on public.schema_migrations to service_role;

insert into public.schema_migrations(version) values
  ('001'), ('002'), ('003'), ('004'), ('005'),
  ('006'), ('007'), ('008'), ('009'), ('010')
on conflict do nothing;
