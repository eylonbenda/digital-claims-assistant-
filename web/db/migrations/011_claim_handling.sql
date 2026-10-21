-- 011: claim handling — post-send lifecycle (spec: docs/superpowers/specs/2026-10-21-claim-handling-design.md)
-- Adds the evidence doc types and the handling-status column + CHECK.
-- Safe to re-run. Apply by hand to dev AND prod (see docs/status.md promote checklist).

alter type doc_type add value if not exists 'payment_notice';   -- הודעת תשלום
alter type doc_type add value if not exists 'rejection_letter'; -- מכתב דחייה

alter table claims add column if not exists handling_status text;
alter table claims add column if not exists handling_status_changed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'claims_handling_status_check' and conrelid = 'public.claims'::regclass
  ) then
    alter table claims add constraint claims_handling_status_check check (
      handling_status is null or handling_status in (
        'sent', 'docs_requested', 'approved_awaiting_payment',
        'partial_paid', 'paid', 'rejected', 'appeal', 'legal'
      )
    );
  end if;
end $$;

insert into public.schema_migrations(version) values ('011') on conflict do nothing;
