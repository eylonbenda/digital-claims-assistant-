-- 016: claim_emails.match_method gains 'auto_ack'.
--
-- An insurer's automatic "we got your message" reply has its own subject, no
-- In-Reply-To and a canned body, so neither the subject id nor the thread can file
-- it (weSure, 2026-11-24). It is now filed on the claim that was just sent to the
-- address it comes from — see matchAck() in web/src/lib/email/match.ts — and marked
-- 'auto_ack' so a filing that was inferred from timing can be told from the rest.
--
-- Deploying the code before this runs is NOT safe for such a message: the insert
-- breaks the check, the webhook answers 500 and the provider keeps retrying until
-- the migration is applied. Apply first, then deploy.
--
-- Safe to re-run. Apply by hand to dev AND prod (see docs/status.md promote checklist).

alter table claim_emails drop constraint if exists claim_emails_match_method_check;
alter table claim_emails add constraint claim_emails_match_method_check
  check (match_method in ('subject_id', 'thread', 'auto_ack', 'manual'));

insert into public.schema_migrations(version) values ('016') on conflict do nothing;
