-- 015: claim_emails.handled_at / handled_as — what the clerk decided about an
-- inbound email. Spec: docs/superpowers/specs/2026-11-22-insurer-email-actions-design.md
--
-- An inbound email on a sent claim asks for a status update until it is handled:
-- either the handling status was changed from it (handled_as = that status) or it
-- was dismissed (handled_as = 'none'). The pair (email, handled_as) is also the
-- labelled data a later "propose the status" step is measured against.
--
-- Existing inbound rows are marked handled so mail that arrived before this
-- feature does not light up every claim.
--
-- Safe to re-run. Apply by hand to dev AND prod (see docs/status.md promote checklist).

alter table claim_emails add column if not exists handled_at timestamptz;
alter table claim_emails add column if not exists handled_as text;

update claim_emails
   set handled_at = now(), handled_as = 'none'
 where direction = 'inbound'
   and handled_at is null
   and not exists (select 1 from public.schema_migrations where version = '015');

insert into public.schema_migrations(version) values ('015') on conflict do nothing;
