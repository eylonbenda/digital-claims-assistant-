# Insurer email actions — implementation plan

**Goal:** update a claim's handling status from an inbound email in one click, filing the email's attachment as the evidence document.

**Spec:** `docs/superpowers/specs/2026-11-22-insurer-email-actions-design.md`

**Architecture:** two nullable columns on `claim_emails` record the clerk's decision per email. A pure module decides which emails are pending; the claim page hands each pending email an action row that opens the existing `HandlingDialog` with the target preselected. A new route copies an email attachment into `claim_documents`; the handling route marks the email handled.

## Global constraints

- No AI call anywhere in this change.
- Deploy-before-migration must not break the claim page: handled state is read in its own query, and a failed read means "no email is pending" (no actions shown), never a missing correspondence panel.
- The transition rules stay in `planHandlingUpdate`; nothing here bypasses them.
- Migration `015_claim_email_handled.sql` is applied by hand, dev and prod.

## Review focus

1. Migration 015 not applied → correspondence still renders, no action rows, transitions still work.
2. Attachment from another claim / another business passed to `from-email` → 404.
3. Email attachment that is not an image/PDF (e.g. .docx) → 415 with the upload copy; dialog still offers "קובץ אחר".
4. Two tabs acting on the same email → second transition hits the existing 409; dismiss is compare-and-set on `handled_at is null`.
5. Emails received before the claim was sent, and emails on closed claims → never pending.

## Tasks

1. **Migration + pure module.** `web/db/migrations/015_claim_email_handled.sql` (columns `handled_at timestamptz`, `handled_as text`; backfill existing inbound rows to `now()` / `'none'`), mirror in `web/db/schema.sql`. `web/src/lib/email/pending.ts`: `isPendingEmail(email, claim)`, `emailTargets(effective)` (legal targets minus `sent`), `prefillNote(body, max = 600)`. Tests in `pending.test.ts` cover focus item 5.
2. **Load.** `EmailRow` gains `handled_at`, `handled_as`; `loadClaimEmails` overlays them from a second query that fails soft (focus item 1).
3. **Document from email.** `web/src/lib/claims/store-document.ts`: `storeClaimDocument(svc, claimId, type, bytes, kind)` shared by the upload route and the new `POST /api/claims/[id]/documents/from-email` `{ attachment_id, type }` (focus items 2, 3).
4. **Handling + dismiss.** `PATCH /handling` accepts `email_id`; `PATCH /api/emails/[id]/handled` `{ outcome: "none" }` (focus item 4).
5. **UI.** `EmailActions.tsx` (client) as the `EmailCard` child; `HandlingDialog` takes `initialTarget` and `email`; `CorrespondencePanel` gets the claim's handling context and an `id="correspondence"` anchor.
6. **Cockpit.** `CockpitInput.pendingInsurerEmail`, new `insurer_email` next action above the other post-send lines; header button scrolls to the anchor. Tests in `derive-handling.test.ts`.
7. **Verify.** `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build`; apply 015 to dev; walk a test email through reject / docs-request / dismiss in the browser.
