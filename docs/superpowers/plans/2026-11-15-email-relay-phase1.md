# Email Relay Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The system emails a finished claim packet to the business's own claims mailbox, and insurer mail redirected from that mailbox is stored and filed on its claim.

**Architecture:** A new `web/src/lib/email/` module holds pure logic (matching, classification, budgets) and one provider adapter; nothing else imports the provider SDK. An inbound webhook route ingests mail into two new tables; a relay route reuses `composeSubmission()` to send the packet. The existing prepare-and-confirm flow and `planConfirm()` stay as they are and remain the fallback.

**Tech Stack:** Next.js 16 (App Router, route handlers), TypeScript, Supabase (Postgres + Storage, service client for writes), Resend (send + inbound), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-email-relay-phase1-design.md` — read it first; this plan argues from it.

## Global Constraints

- The system sends email **only** to `agents.claims_mailbox`. No code path may send to an insurer or a client address.
- Relaying never changes `handling_status`. The only state change inbound mail may cause is the self-copy rule (Task 8).
- Inbound content is untrusted: store and render `text_body` as plain text only; never store or render HTML.
- Feature off when any of `EMAIL_PROVIDER_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_INBOUND_DOMAIN` is unset, or when the agent's `inbound_alias` is null, or when `claim_emails` is missing (log `Check that migration 012_claim_emails.sql has been applied to this database.`, hide the UI, no 500).
- Relay size budget: 20 MB raw attachments. Inbound per-message attachment cap: 25 MB.
- Migration `012_claim_emails.sql`: additive, idempotent (`if not exists`), ends with `insert into public.schema_migrations(version) values ('012') on conflict do nothing;`. Mirror it into `web/db/schema.sql`. Both new tables need `enable row level security` (`npm run check:rls` enforces it). **Applied by hand on dev and prod — say so in the PR and the handoff.**
- Hebrew UI strings, English identifiers. All strings in `web/src/lib/email/copy.ts`.
- Next.js 16: read `web/node_modules/next/dist/docs/` before writing route handlers or pages.
- Errors go through `serverError(where, error, ctx)` from `@/lib/observability/report` with a route *pattern* and ids only — never addresses, subjects or bodies.
- Branch off `origin/main` in a worktree under `.claude/worktrees/`, one PR, no self-merge. Tasks 5 and 9 need the sidebar shell and settings page from PRs #107 and #108; if those are not merged, stop before Task 5 and say so.
- Done bar per task and at the end: `npx tsc --noEmit`, `npm run test`, `npm run build` green, output pasted.

## Review Focus

Inputs the spec implies that are most likely to bite, each pinned to a test in the task that owns the code:

1. **The provider delivers the same message twice** → second delivery returns 200 and inserts nothing (Task 4).
2. **A subject carries an 8-digit licence plate next to the claim's short id** (plates are valid hex) → the claim id wins; a token that prefixes no claim of this business is ignored (Task 2).
3. **A short id that belongs to another business's claim** → no match; the message lands unmatched for the receiving business (Task 2, Task 4).
4. **An attachment named with Hebrew, spaces or path characters** (`../סריקה 1.pdf`) → stored under a safe path, original name kept in the row (Task 2, Task 4).
5. **The self-copy arrives after the clerk already tapped "סומן כנשלח"** → webhook returns 200, no error reported, status unchanged (Task 8).

---

### Task 0: Spike — confirm the four assumptions (no product code)

**Files:** none committed. Record results in the PR description.

- [ ] **Step 1:** Create a Resend account/domain for `in.<domain>` (the user supplies the domain — spec open question 2), enable receiving, point a webhook at a request bin.
- [ ] **Step 2:** From the pilot Microsoft 365 mailbox, add an Inbox rule that **redirects** mail from one test sender to `spike@in.<domain>`. Send a message with a PDF and a JPG from that sender. Expected: webhook fires; fetched message has `from` = the test sender, both attachments downloadable. If the mailbox bounces with `5.7.520`, external forwarding is off for the tenant — record that and enable it per spec §10.
- [ ] **Step 3:** Forward and reply to a message whose subject ends with `— 1a2b3c4d`. Expected: the token is still present in both subjects.
- [ ] **Step 4:** Send a 15 MB packet (PDF + JPGs) through the Resend API to the pilot mailbox. Expected: delivered. Read Resend's webhook-verification and unsupported-attachment-types pages; note the signature scheme and whether `.eml` is allowed.
- [ ] **Step 5:** Email the pilot mailbox a `.eml` attachment containing the header `X-Unsent: 1` plus To/Cc/Subject/body/one attachment. Open it in the clerk's Outlook. Record whether it opens as an editable draft.

**Gate:** if Step 2 fails for a reason setup cannot fix, stop and revise the spec. Step 5 only decides whether a later "draft mode" enhancement is worth planning; it does not block.

---

### Task 1: Schema, config and feature gate

**Files:**
- Create: `web/db/migrations/012_claim_emails.sql`, `web/src/lib/email/config.ts`, `web/src/lib/email/config.test.ts`
- Modify: `web/db/schema.sql`, `web/.env.example`

**Interfaces:**
- Produces:
  - `emailConfig(env?: Record<string, string | undefined>): { apiKey: string; webhookSecret: string; inboundDomain: string } | null` — null when any of the three vars is missing or blank.
  - `inboundAddress(alias: string, domain: string): string` → `` `${alias}@${domain}` ``.
  - `RELAY_FROM(domain: string): string` → `` `OpenTik <relay@${domain}>` ``.

- [ ] **Step 1:** Write `config.test.ts`: all three set → object; any one missing or `""` → `null`; `inboundAddress("a-x1", "in.example.com") === "a-x1@in.example.com"`.
- [ ] **Step 2:** Run `npm run test -- config` — FAIL (module missing).
- [ ] **Step 3:** Implement `config.ts`.
- [ ] **Step 4:** Write `012_claim_emails.sql` with the DDL from spec §7 made idempotent, plus: `enable row level security` on both tables; select policy on `claim_emails` using `agent_id in (select id from agents where auth_user_id = auth.uid())`; select policy on `claim_email_attachments` through `email_id in (select id from claim_emails)`; `grant select` to `authenticated`, `grant all` to `service_role`; the header comment style of `011_claim_handling.sql`; the closing `schema_migrations` row for `'012'`. Mirror the tables, columns and policies into `schema.sql`.
- [ ] **Step 5:** Add `EMAIL_PROVIDER_API_KEY=`, `EMAIL_WEBHOOK_SECRET=`, `EMAIL_INBOUND_DOMAIN=` to `.env.example`.
- [ ] **Step 6:** Run `npm run test -- config && npm run check:rls && npm run test:scripts` — PASS.
- [ ] **Step 7:** Paste `012` into the **dev** Supabase SQL editor (ask the user if no access). Commit: `feat(email): schema, config and feature gate for email relay`.

---

### Task 2: Pure core — matching, classification, budgets

**Files:**
- Create: `web/src/lib/email/types.ts`, `match.ts`, `classify.ts`, `budget.ts`, and `match.test.ts`, `classify.test.ts`, `budget.test.ts` beside them.

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type EmailKind = "self_copy" | "insurer" | "other";
  export type MatchMethod = "subject_id" | "thread" | "manual";
  export type InboundAttachment = { filename: string; mime: string | null; size: number; download: () => Promise<Uint8Array> };
  export type InboundEmail = {
    providerId: string; messageId: string | null; inReplyTo: string | null; references: string[];
    from: string; to: string[]; cc: string[]; subject: string; text: string | null;
    attachments: InboundAttachment[];
  };
  ```
- Produces (`match.ts`):
  - `extractShortIds(subject: string): string[]` — unique, lower-cased tokens matching `/\b[0-9a-f]{8}\b/gi`.
  - `matchClaim(email: Pick<InboundEmail, "subject" | "inReplyTo" | "references">, candidates: { claimIds: string[]; claimByMessageId: Map<string, string> }): { claimId: string; method: "subject_id" | "thread" } | null` — subject first: collect claims whose id starts with any token; exactly one distinct claim → match; zero or several → fall through to thread (`inReplyTo`, then `references` in order).
- Produces (`classify.ts`):
  - `addressOf(header: string): string` — `"Name <A@B.co>"` → `"a@b.co"`.
  - `parseAlias(recipients: string[], inboundDomain: string): string | null` — local part of the first recipient on that domain, lower-cased.
  - `classifyKind(from: string, claimsMailbox: string | null, insurerDomains: string[]): EmailKind`.
- Produces (`budget.ts`):
  - `RELAY_MAX_BYTES = 20 * 1024 * 1024`, `INBOUND_MAX_BYTES = 25 * 1024 * 1024`
  - `overBudget(sizes: number[], max: number): boolean`
  - `storageName(index: number, filename: string): string` — `` `${index}-${safe}` `` where `safe` keeps `[A-Za-z0-9._-]`, replaces everything else with `_`, strips leading dots, truncates to 80 chars, falls back to `file`.

- [ ] **Step 1:** Write `match.test.ts`:
  - subject `"תביעת נזקי רכוש — מבוטחכם 19510404 — נפגע 4521837 — 6e7e3dc4"` with `claimIds: ["6e7e3dc4-f538-…", "0295502a-…"]` → `{ claimId: "6e7e3dc4-f538-…", method: "subject_id" }` (Review Focus 2).
  - `"Fwd: RE: … — 6E7E3DC4"` (upper case, prefixes) → same match.
  - token present but `claimIds` holds only other claims → `null` (Review Focus 3).
  - two tokens prefixing two different claims → falls to thread; with `inReplyTo` in `claimByMessageId` → `method: "thread"`; without → `null`.
  - no token, `references: ["<x>", "<known>"]` → thread match on `<known>`.
- [ ] **Step 2:** Write `classify.test.ts`: `addressOf` cases above and a bare address; `parseAlias(["Bob <b@x.com>", "Moshe-X7@in.example.com"], "in.example.com") === "moshe-x7"`; none on domain → `null`; `classifyKind` returns `self_copy` when from equals mailbox ignoring case, `insurer` when the from domain or a parent of it is listed (`claims.fnx.co.il` vs `fnx.co.il`), else `other`; `claimsMailbox null` never yields `self_copy`.
- [ ] **Step 3:** Write `budget.test.ts`: `overBudget([10e6, 11e6], RELAY_MAX_BYTES) === true`; exactly at the limit → `false`; `storageName(2, "../סריקה 1.pdf")` matches `/^2-[A-Za-z0-9._-]+\.pdf$/` and contains no `/` or `..` (Review Focus 4); `storageName(0, "") === "0-file"`.
- [ ] **Step 4:** Run `npm run test -- email` — FAIL.
- [ ] **Step 5:** Implement the four modules.
- [ ] **Step 6:** Run `npm run test -- email` — PASS. Commit: `feat(email): pure matching, classification and budget logic`.

---

### Task 3: Provider adapter

**Files:**
- Create: `web/src/lib/email/provider.ts`
- Modify: `web/package.json` (add `resend`; add the verification dependency only if Task 0 Step 4 shows the SDK does not verify signatures itself)

**Interfaces:**
- Consumes: `emailConfig()`, `InboundEmail`.
- Produces:
  - `sendEmail(input: { from: string; to: string; subject: string; text: string; attachments: { filename: string; content: Uint8Array }[] }): Promise<{ providerId: string; messageId: string | null }>` — throws on a provider error.
  - `verifyInboundWebhook(request: Request, rawBody: string): boolean` — the scheme recorded in Task 0 Step 4.
  - `readInbound(rawBody: string): Promise<InboundEmail | null>` — parses the `email.received` event, fetches headers/text and builds `attachments[].download` lazily from the Attachments API; `null` for any other event type. `text` is the plain-text part or `null`; HTML is not read.

- [ ] **Step 1:** Implement the three functions. This is the only file that imports the provider SDK.
- [ ] **Step 2:** `npx tsc --noEmit` — PASS. No unit tests here (thin I/O adapter); it is exercised through the route tests with this module mocked, and by the manual check in Task 4 Step 6.
- [ ] **Step 3:** Commit: `feat(email): Resend adapter for send and inbound`.

---

### Task 4: Inbound webhook and storage

**Files:**
- Create: `web/src/lib/email/ingest.ts`, `web/src/app/api/inbound/email/route.ts`, `web/src/app/api/inbound/email/route.test.ts`
- Modify: `web/src/lib/submission/directory.ts` (add `domains: string[]`, default `[]`; export `insurerDomains(): string[]`)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `ingestInbound(email: InboundEmail, svc: SupabaseClient, cfg: { inboundDomain: string }): Promise<{ outcome: "stored" | "duplicate" | "unknown_alias"; emailId?: string; agentId?: string; claimId?: string | null; kind?: EmailKind }>`
  - Route: `POST /api/inbound/email`, `export const maxDuration = 60`.

Ingest order (spec §5): duplicate check on `claim_emails.provider_id` → resolve agent by `parseAlias([...to, ...cc])` → load that agent's claim ids and the `message_id → claim_id` map of its stored emails → `classifyKind` → `matchClaim` → download attachments (skip all and set `attachments_dropped` when `overBudget(sizes, INBOUND_MAX_BYTES)`) → upload to bucket `claim-docs` at `emails/<agent_id>/<email_id>/<storageName(i, filename)>` → insert `claim_emails` then `claim_email_attachments`. `match_method` is the matcher's method or null.

Route: read raw body → `emailConfig()` null → 503; `verifyInboundWebhook` false → 401; `readInbound` null → 200; `ingestInbound`; `unknown_alias` and `duplicate` → 200; any thrown error → `serverError("/api/inbound/email", err, { providerId })` (non-200 so the provider retries).

- [ ] **Step 1:** Write `route.test.ts`, mocking `@/lib/email/provider` and the service client the way `web/src/app/api/claims/documents/route.test.ts` does:
  - bad signature → 401, no DB calls.
  - config missing → 503.
  - valid message, subject token of this agent's claim → row inserted with `claim_id` set, `match_method: "subject_id"`, `direction: "inbound"`; attachment uploaded under `emails/<agent>/<id>/0-…`.
  - same `providerId` again → 200, no insert (Review Focus 1).
  - token of another agent's claim → inserted with `claim_id: null` (Review Focus 3).
  - recipient alias unknown → 200, no insert.
  - attachments totalling 30 MB → row inserted with `attachments_dropped: true`, no uploads.
  - attachment `../סריקה 1.pdf` → upload path has no `..`; row `filename` is the original (Review Focus 4).
  - `text: null` → row inserted with `text_body: null`.
  - storage upload throws → response is 5xx and `serverError` was called.
- [ ] **Step 2:** Run `npm run test -- inbound` — FAIL.
- [ ] **Step 3:** Implement `directory.ts` change, `ingest.ts`, the route.
- [ ] **Step 4:** Run `npm run test` — PASS (the directory change must not break `submission.test.ts`).
- [ ] **Step 5:** `npx tsc --noEmit && npm run build` — PASS.
- [ ] **Step 6:** Manual: with dev env vars set and an `inbound_alias` on the dev agent, redirect one real message; confirm the row and the stored attachment in Supabase. Commit: `feat(email): inbound webhook stores and matches redirected mail`.

---

### Task 5: Inbox page and manual assignment

**Files:**
- Create: `web/src/lib/email/copy.ts`, `web/src/lib/email/load.ts`, `web/src/app/dashboard/inbox/page.tsx`, `web/src/app/dashboard/inbox/AssignClaim.tsx`, `web/src/app/api/emails/[id]/assign/route.ts`, `web/src/app/api/emails/[id]/assign/route.test.ts`
- Modify: `web/src/app/dashboard/SidebarNav.tsx`, `web/src/app/dashboard/layout.tsx`

**Interfaces:**
- Produces:
  - `loadUnmatched(supabase): Promise<EmailRow[] | null>` and `loadClaimEmails(supabase, claimId): Promise<EmailRow[] | null>` — RLS-scoped reads, newest first; `null` when the table is missing (use `isMissingTableError` from `@/lib/schema-version` and log the migration line from Global Constraints).
  - `type EmailRow = { id: string; kind: EmailKind; direction: "relay_out" | "inbound"; from_addr: string; subject: string; text_body: string | null; received_at: string; attachments_dropped: boolean; attachments: { id: string; filename: string; url: string | null }[] }` — `url` is a 1-hour signed URL minted with the service client after the RLS read proved ownership (same pattern as the claim page's documents).
  - `POST /api/emails/[id]/assign` body `{ claim_id: string }` → sets `claim_id`, `match_method: "manual"`.
  - `EMAIL_COPY` in `copy.ts`: `inboxTitle: "דואר נכנס"`, `inboxEmpty: "כל המיילים משויכים לתיקים."`, `assign: "שיוך לתיק"`, `assignSearch: "חיפוש לפי שם לקוח או לוחית"`, `correspondenceTitle: "התכתבות"`, `attachmentsDropped: "הקבצים המצורפים גדולים מדי ולא נשמרו"`, `noBody: "אין תוכן טקסט במייל"`.

- [ ] **Step 1:** Write `assign/route.test.ts`: unauthenticated → 401; email not visible through RLS → 404; `claim_id` not visible through RLS → 404; success → update called with `{ claim_id, match_method: "manual" }`; email already on a claim → 409.
- [ ] **Step 2:** Run it — FAIL. Implement the route (two RLS probes with the user client, write with the service client). Run — PASS.
- [ ] **Step 3:** Implement `load.ts`, `copy.ts`.
- [ ] **Step 4:** Implement the page: server component, `redirect("/login")` when no user, `loadUnmatched`; `null` → render nothing but the title; rows show sender, subject, relative time, collapsed text body (`whitespace-pre-wrap`, never `dangerouslySetInnerHTML`), attachment links, and `AssignClaim` (client component: text search over the agent's open claims by name/plate, submit to the assign route, `router.refresh()`).
- [ ] **Step 5:** Add the sidebar entry `{ href: "/dashboard/inbox", label: EMAIL_COPY.inboxTitle }` with an icon and an unmatched-count badge. The count is read in `layout.tsx` and passed to `SidebarNav` as a prop; hide the entry when the agent's `inbound_alias` is null.
- [ ] **Step 6:** `npx tsc --noEmit && npm run test && npm run build` — PASS. Check in the browser on a production build (see the worktree dev-server note in project memory): unmatched message appears, assigning removes it. Commit: `feat(email): inbox for unmatched mail with manual assignment`.

---

### Task 6: Correspondence on the claim, activity on the list

**Files:**
- Create: `web/src/app/dashboard/[id]/CorrespondencePanel.tsx`
- Modify: `web/src/app/dashboard/[id]/page.tsx`, `web/src/app/dashboard/page.tsx`, `web/src/lib/dashboard/compose.ts`, `web/src/lib/dashboard/compose.test.ts`, `web/src/app/dashboard/ClaimsList.tsx`

**Interfaces:**
- Consumes: `loadClaimEmails`, `EmailRow`, `EMAIL_COPY`.
- Produces: `ComposeClaim.last_email_at?: string | null`; `ClaimCard["fresh"]` becomes `"submitted" | "upload" | "email" | null`.

- [ ] **Step 1:** Add to `compose.test.ts`: a claim with `last_email_at` 1 hour ago and no recent submit/upload → `fresh === "email"` and `activity_at === last_email_at`; `last_email_at` 3 days ago → `fresh === null`; recent submission still wins (`"submitted"`).
- [ ] **Step 2:** Run — FAIL. Extend `compose.ts`: include `last_email_at` in `latest(...)` for `activity_at`; `fresh` order is submitted → upload → email. Run — PASS.
- [ ] **Step 3:** In `dashboard/page.tsx`, read the newest inbound `received_at` per claim where `kind = 'insurer'` (RLS-scoped; tolerate the missing table as an empty result) and pass it as `last_email_at`. In `ClaimsList.tsx` render the badge text `"מייל חדש"` for `fresh === "email"`.
- [ ] **Step 4:** Implement `CorrespondencePanel` (server-renderable list of `EmailRow`, same row layout as the inbox minus assignment) and render it on the claim page under the title `EMAIL_COPY.correspondenceTitle` when `loadClaimEmails` returns a non-empty list. Place it at the end of the overview tab's main column; its final position is settled with the tab restructure noted in the spec.
- [ ] **Step 5:** `npx tsc --noEmit && npm run test && npm run build` — PASS. Browser check. Commit: `feat(email): correspondence on the claim and email activity on the list`.

---

### Task 7: Relay the packet to the business mailbox

**Files:**
- Create: `web/src/app/api/claims/[id]/submission/relay/route.ts`, `…/relay/route.test.ts`, `web/src/lib/email/relay.ts`, `web/src/lib/email/relay.test.ts`
- Modify: `web/src/app/dashboard/[id]/SubmissionPanel.tsx`, `web/src/app/dashboard/[id]/page.tsx`, `web/src/lib/email/copy.ts`

**Interfaces:**
- Consumes: `composeSubmission()` (unchanged), `sendEmail`, `RELAY_FROM`, `overBudget`, `RELAY_MAX_BYTES`.
- Produces:
  - `planRelay(input: { claimsMailbox: string | null; submission: Submission | null; sizes: number[] }): { error: string } | { to: string; subject: string; text: string }` — errors, in this order: no submission → `"יש לסווג את התביעה לפני שליחה למבטחת"`; no mailbox → `"לא הוגדרה תיבת תביעות בהגדרות"`; over budget → `"הקבצים גדולים מדי לשליחה במייל אחד (מעל 20MB) — שלחו ידנית"`.
  - `POST /api/claims/[id]/submission/relay` → `{ ok: true, relayedAt: string }`.
  - `SubmissionPanel` gains props `relay: { enabled: boolean; inboundAddress: string | null; lastRelayedAt: string | null }`.
  - Copy: `relayButton: "שליחה לתיבה שלי"`, `relayAgain: "שליחה חוזרת"`, `relayDone: "שלחנו לתיבה שלכם מייל מוכן."`, `relayForwardTo: "העבירו אותו אל"`, `relayCc: "והוסיפו בהעתק את"`, `manualTitle: "שליחה ידנית"`.

- [ ] **Step 1:** Write `relay.test.ts` for the three errors in order and the success shape (`text` equals `submission.body`, `subject` equals `submission.subject` — nothing prepended or appended).
- [ ] **Step 2:** Write `relay/route.test.ts`: 401 unauthenticated; 404 foreign claim; 503 when `emailConfig()` is null; 400 with the planner's message for each error; success → `sendEmail` called once with `to` = the agent's `claims_mailbox` **and with no other recipient field**, a `claim_emails` row `direction: "relay_out"`, a `claim_events` row `submission_relayed`, and **no update to `claims`**; `sendEmail` throws → 5xx via `serverError`, no rows inserted.
- [ ] **Step 3:** Run — FAIL. Implement `relay.ts` and the route (download attachment bytes from the `claim-docs` bucket with the service client; filename = label + original extension). Run — PASS.
- [ ] **Step 4:** Update `SubmissionPanel`: when `relay.enabled`, the primary action is the relay button; after success show the instruction block with copy buttons for the recipient (or the manual-entry field when unverified) and for `relay.inboundAddress`; the existing copy-paste fields move under a `<details>` titled `manualTitle`; "סומן כנשלח" stays. When `relay.enabled` is false the panel renders exactly as today. Pass the props from the claim page (`lastRelayedAt` = newest `relay_out` row).
- [ ] **Step 5:** `npx tsc --noEmit && npm run test && npm run build` — PASS. Manual: relay a dev claim to a test mailbox; confirm subject, body and attachments, and that the claim is **not** marked sent. Commit: `feat(email): relay the claim packet to the business mailbox`.

---

### Task 8: Self-copy marks the claim sent

**Files:**
- Create: `web/src/lib/email/self-copy.ts`, `web/src/lib/email/self-copy.test.ts`
- Modify: `web/src/lib/email/ingest.ts`, `web/src/app/api/inbound/email/route.test.ts`

**Interfaces:**
- Consumes: `planConfirm` from `@/lib/submission/confirm`, `runEngine` from `@/lib/tasks/runner`.
- Produces: `selfCopyRecipient(email: Pick<InboundEmail, "to">, inboundDomain: string): string | null` — first `to` address not on the inbound domain. `applySelfCopy(svc, claim, recipient, subject, now): Promise<"marked" | "already_sent" | "not_applicable">` — runs `planConfirm`; applies its update with the same compare-and-set as `POST /api/claims/[id]/submission` (`.is("handling_status", null)`), inserts the `claim_events` row, runs the engine with the milestone; a planner error or 0 rows updated is **not** an error.

- [ ] **Step 1:** `self-copy.test.ts`: `selfCopyRecipient` skips the system address and returns the insurer's; only the system address in `to` → `null`.
- [ ] **Step 2:** Add to the inbound route test: `kind: "self_copy"`, matched claim, `handling_status null` → claim updated to `sent`, event `submission_confirmed` with the recipient; same message when the claim is already `sent` → 200, `serverError` not called, no update (Review Focus 5); `self_copy` with no matched claim → stored unmatched, no update; `kind: "insurer"` on a matched unsent claim → no update.
- [ ] **Step 3:** Run — FAIL. Implement and call `applySelfCopy` from `ingestInbound` after the insert, only for `kind === "self_copy"` with a matched claim and a non-null recipient. Run — PASS.
- [ ] **Step 4:** `npx tsc --noEmit && npm run test && npm run build` — PASS. Commit: `feat(email): mark a claim sent from the clerk's own CC copy`.

---

### Task 9: Settings block

**Files:**
- Create: `web/src/app/dashboard/settings/EmailSetup.tsx`
- Modify: `web/src/app/dashboard/settings/page.tsx`, `web/src/app/api/agents/me/route.ts`, `web/src/lib/agents/details.ts`, `web/src/lib/agents/details.test.ts`, `web/src/lib/email/copy.ts`

**Interfaces:**
- Produces: `PATCH /api/agents/me` accepts optional `claims_mailbox` (validated with `validRecipient` from `@/lib/submission/confirm`; empty string clears it). `inbound_alias` is **not** user-editable — it is set by us in the database during onboarding.

- [ ] **Step 1:** Extend `details.test.ts`: valid `claims_mailbox` passes through trimmed; `"not-an-email"` → error; omitted → field absent from the parsed result (existing callers unaffected).
- [ ] **Step 2:** Run — FAIL. Implement in `details.ts` and the route. Run — PASS.
- [ ] **Step 3:** Implement `EmailSetup`: shown only when `emailConfig()` is non-null and the agent has an `inbound_alias`. Contents: the inbound address with a copy button; the `claims_mailbox` field (default `agents.email`) with save; "מייל אחרון שהתקבל" from the newest inbound row or "עדיין לא התקבל מייל"; the four setup steps of spec §10 in Hebrew, including the `5.7.520` hint; the insurer sender list from `insurerDomains()` (or "רשימת הדומיינים תתווסף" when empty).
- [ ] **Step 4:** `npx tsc --noEmit && npm run test && npm run build` — PASS. Browser check. Commit: `feat(email): email setup block in settings`.

---

### Final: verify and hand off

- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run test`, `npm run check:rls`, `npm run build` — paste the output.
- [ ] Open the PR. The description must state: **migration `012_claim_emails.sql` must be pasted into the prod Supabase SQL editor before or with the merge** (`migration-guard` will post the SQL and stay red until the `migration-applied-prod` label is added); the three new env vars must be set in Vercel; per-customer setup is manual (spec §10).
- [ ] Leave the PR for the user. Do not self-merge.
