-- 012: claim amounts — what was demanded from the insurer and what was paid.
-- Feeds the overview page (money waiting, money received). Both optional: the agent
-- fills them when sending the claim and when recording a payment, or later.
-- Amounts are ILS as the agent types them; no currency or VAT modelling.
-- Safe to re-run. Apply by hand to dev AND prod (see docs/status.md promote checklist).

alter table claims add column if not exists demand_amount numeric(12, 2);
alter table claims add column if not exists paid_amount numeric(12, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'claims_amounts_nonnegative' and conrelid = 'public.claims'::regclass
  ) then
    alter table claims add constraint claims_amounts_nonnegative check (
      (demand_amount is null or demand_amount >= 0) and
      (paid_amount is null or paid_amount >= 0)
    );
  end if;
end $$;

insert into public.schema_migrations(version) values ('012') on conflict do nothing;
