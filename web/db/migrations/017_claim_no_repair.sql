-- 017: claims.no_repair — third-party claim settled on the appraiser's estimate
-- without repairing the car ("דו"ח גלובלי"). Spec:
-- docs/superpowers/specs/2026-11-24-no-repair-global-claim-design.md
--
-- On third_party_report it drops the repair invoice, the repair receipt and the
-- "car at garage" milestone from the checklist (lib/claims/checklist.ts). Default
-- false, so existing claims are unaffected.
--
-- Safe to re-run. Apply by hand to dev AND prod BEFORE deploying the code — every
-- claim read selects this column, so a missing column 500s the cockpit.
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS no_repair boolean NOT NULL DEFAULT false;

insert into public.schema_migrations(version) values ('017') on conflict do nothing;
