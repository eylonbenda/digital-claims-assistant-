-- 014: agents.kind — whether the business handling the claim is a garage or an
-- insurance agent (`agents` means "the business", either one — see CLAUDE.md).
--
-- First use: a garage's own name pre-fills "שם המוסך" on the accident-notice form
-- (garage.name) until the clerk edits the form. Null = unknown → no default.
-- Set by hand per business; there is no UI for it yet:
--
--   update agents set kind = 'garage' where id = '<agent id>';
--
-- Safe to re-run. Apply by hand to dev AND prod (see docs/status.md promote checklist).

alter table agents add column if not exists kind text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agents_kind_check') then
    alter table agents add constraint agents_kind_check check (kind in ('garage', 'agent'));
  end if;
end $$;

insert into public.schema_migrations(version) values ('014') on conflict do nothing;
