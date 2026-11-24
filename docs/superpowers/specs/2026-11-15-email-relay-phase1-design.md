# Email relay, phase 1 — the system writes the email, the business mailbox stays the sender

**Date:** 2026-11-15 · **Status:** amended 2026-11-16 for direct sending (see the amendment below); originally approved by the user 2026-11-15 as the basis for the plan (`docs/superpowers/plans/2026-11-15-email-relay-phase1.md`); the open questions at the end still stand · **Area:** `web/src/lib/submission/`, new `web/src/lib/email/`, `web/src/app/dashboard/`
**Supersedes in part:** the non-goal "No real email sending and no inbound email reading" in `2026-10-21-claim-handling-design.md`. Everything else in that spec stands.

## Amendment 2026-11-16 — the system sends to the insurer directly

**Decided by the user on 2026-11-16**, after the unknown-sender risk below was raised again: the app sends the claim to the insurer itself, with the business's existing claims address in copy. This replaces the relay through the business mailbox. Where this section and the rest of the document disagree, this section wins; sections it supersedes are named.

### What changes

- **Outbound (supersedes §3).** `POST /api/claims/[id]/submission/send` sends the packet from the business's own system address to the insurer, `Cc` the business's `claims_mailbox`.
  - `From`: `"<business name> (OpenTik)" <alias@in.<our domain>>` — the per-business inbound address is the sender, so a reply returns to that business's inbox in the app. `Reply-To` is the same address.
  - `To`: the insurer's claims address — the verified directory address when there is one, otherwise the address the clerk types. Either way the clerk confirms it.
  - Subject, body and attachments come from `composeSubmission()` unchanged. The 20 MB budget stands; over it, the manual prepare-and-confirm flow remains the way out.
- **Explicit confirmation before every send.** A confirm step shows the recipient address, the copy address, the subject and the attachment list, and nothing leaves until the clerk approves it. This is the "no silent sends" anti-goal of the claim-handling spec, now load-bearing: no human retypes the address any more.
- **"Sent" is known, not inferred (supersedes §4).** When the provider accepts the message, the route applies the existing `planConfirm()` and the claim becomes "נשלחה". The self-copy rule is dropped — the business's copy goes to its real mailbox, not to the inbound address.
- **Delivery failure.** The provider's bounce / failure event for a sent message creates a task on the claim ("המייל למבטחת חזר — לבדוק כתובת ולשלוח שוב") and flags the stored message. It does **not** revert the status by itself; the clerk decides, with the existing "ביטול שליחה".
- **Inbound copy to the business (new).** Every inbound message stored for a business is also forwarded to its `claims_mailbox`, attachments included, so the mailbox the clerk works from stays complete.
  - **Loop guard:** a message whose `From` is on our own inbound domain, or that carries our `X-OpenTik-Forwarded` header, is neither stored nor forwarded. Without it, a redirect rule in the business mailbox would bounce our own copy back to us indefinitely.
- **The redirect rule becomes optional (amends §10).** Replies arrive on their own because the system address is the sender. The rule is still the only way to capture mail an insurer starts on its own to the address it knows; set it up when that matters.
- **Global rule (amends Non-goals).** The system now sends to two kinds of address only: the insurer address the clerk confirmed for that send, and the business's own `claims_mailbox`. Still no email to clients, and still no AI reading of inbound mail.

### What stays

Provider choice and adapter (§1), per-business addresses (§2), the inbound webhook (§5), matching (§6), the data model (§7, now migration 013 — `direction` takes `'outbound'` instead of `'relay_out'`, `kind` takes `'business'` instead of `'self_copy'`, and `claim_emails` gains `delivery_failed boolean not null default false`), the UI apart from the sending panel (§8), insurer domains (§9), configuration (§11).

### The risk that was accepted

An insurer's claims desk does not know our sending domain. A claim file from an unfamiliar sender may be filtered or left unanswered, and nothing tells us it was not read — a bounce reports non-delivery, not neglect. Mitigations in this phase: the business name in the sender, the business address in copy, bounce handling, and the unchanged follow-up task that asks the clerk to check on a sent claim. The stronger fix is to send from the business's own domain (verify it with the provider, a one-time DNS change on their side); that depends on whether the claims address is on a domain they control, which is not yet known.

**Check before relying on it:** send three real claims this way and see whether the insurer acknowledges them as it normally does. If it does not, the relay design in §3–§4 is the fallback and most of what is built is shared.

## Intent

The user's goal: **sending to the insurer and all handling after it happen through the system.** Today the system prepares the submission (recipient, subject, body, attachment list) and the פקידה rebuilds it by hand in her own mailbox — copy each field, download and attach each file, then tap "סומן כנשלח". Insurer replies land in that mailbox and never reach the claim.

Phase 1 closes both gaps **without the system ever emailing an insurer**:

- **Outbound:** the system emails the finished packet to the business's own claims mailbox. The פקידה forwards it to the insurer from the address the insurer already knows.
- **Inbound:** a rule in the business mailbox redirects insurer mail to a per-business system address. The system files each message on its claim.

Why this shape (decided with the user, 2026-11-14/15): a claim file arriving from an unknown domain may be filtered or ignored by an insurer's claims desk, and replies would stop reaching the mailbox the פקידה works from. Keeping the business mailbox as the sender removes that risk, needs no permission on the mailbox, and works with any mail provider. Direct sending and mailbox OAuth are later phases (see "Later phases").

## Goals

1. From a submittable claim, one button sends the complete packet — subject, body, all attachments — to the business's claims mailbox.
2. The claim is marked "נשלחה" from evidence when possible: the system sees the פקידה's own copy of the forwarded email. The manual "סומן כנשלח" stays as the fallback.
3. Mail redirected from the business mailbox is stored and attached to the right claim, with its attachments, and is readable on the claim page.
4. Mail that cannot be matched is never lost: it appears in an inbox list where the פקידה assigns it to a claim.
5. Nothing changes for a business that has not been set up: the current prepare-and-confirm screen keeps working as is.

## Non-goals

- The system does not send email to insurers, clients, or anyone except the business's own claims mailbox.
- No reading of the business mailbox (no Microsoft Graph / Gmail OAuth).
- No automatic handling-status change from an insurer's email, and no AI reading of inbound mail. A human reads the mail and updates the status with the existing dialog.
- No automatic filing of inbound attachments as claim documents (see open question 5).
- No composing of free-form replies in the app.
- No change to the collection wizard, the classifier, or the handling lifecycle and its evidence gates.

## Anti-goals

- **A second place to work claims.** The inbox page lists only mail that has no claim yet. Matched mail is reached through its claim, consistent with `2026-10-31-unified-claims-list-design.md` ("router, not a workbench").
- **Lying "sent".** Relaying the packet to the business mailbox is not "sent to the insurer" and must never flip the handling status.
- **Silent loss.** Every accepted inbound message is either on a claim or in the unmatched list. A message the system cannot process must fail loudly (non-200 to the provider, so it retries) rather than be dropped.
- **Trusting inbound content.** An inbound email is third-party input. It is displayed as text, never rendered as HTML, and never drives a state change other than the narrow self-copy rule below.

## Verified facts this design rests on

Checked against vendor documentation on 2026-11-15. Anything not listed here is an assumption and appears under "Spike" or "Open questions".

**Microsoft 365** (the pilot garage's provider):
- External auto-forwarding is governed by the outbound spam policy setting "Automatic forwarding rules". The default is "Automatic – System-controlled", whose effect **varies by tenant** (Off for new tenants and for tenants that were not using forwarding in 2021). An admin should set it explicitly.
- The setting covers Inbox rules and admin mailbox forwarding. An admin can scope "On" to specific users with a custom outbound spam policy.
- When blocked, the NDR reads `5.7.520 Access denied, Your organization does not allow external forwarding`. This is the diagnostic to look for during setup.
- Inbox rule **Redirect**: the message arrives appearing to come from the original sender. **Forward**: it appears to come from the mailbox owner. We want Redirect.

**Mail providers** (both support inbound to a webhook on a custom subdomain via an MX record, any local part):

| | Resend | Postmark |
|---|---|---|
| Outbound size cap (after Base64) | 40 MB | 10 MB |
| Inbound attachments | fetched via a separate API (download URL valid 1 h) | inline Base64 in the webhook, 35 MB total |
| Inbound headers / body | fetched via a separate API | full headers in the webhook |
| Webhook auth | signature verification (page not read) | no signing; Basic Auth in the URL + IP allowlist |

## Design decisions

### 1. Provider: Resend *(my call — confirm, see open question 1)*

The outbound size cap decides it. A claim packet is the accident-notice PDF plus licence, registration and several damage photos; 10 MB after Base64 is about 7.5 MB of files, which a normal packet exceeds. Resend's inbound needs two extra API calls per message, which is acceptable.

One provider-facing module, `web/src/lib/email/provider.ts`, exposes `sendEmail()` and `fetchInbound(id)`. Nothing else imports the SDK, so the provider can be swapped.

### 2. Per-business addresses

Two new columns on `agents`:

- `claims_mailbox text` — where the system sends packets. Defaults in the UI to `agents.email`; the business confirms it in settings.
- `inbound_alias text unique` — the local part of the system address, e.g. `moshe-garage-x7k2p9@in.<our domain>`. It includes a random suffix because **the address is a write credential**: anyone who knows it can put mail in this business's inbox. A business with `inbound_alias null` has the feature off.

### 3. Outbound: relay to the business mailbox

`POST /api/claims/[id]/submission/relay`

1. Auth and RLS ownership probe, as in the existing submission route.
2. `composeSubmission()` — reused unchanged — gives subject, body, recipient, attachments.
3. **Size budget:** sum the attachment sizes. Over 20 MB raw → refuse with a Hebrew message and leave the manual flow available. *(My call: 20 MB keeps the forwarded message under common mailbox limits; the provider cap alone would allow about 30 MB.)*
4. Send to `claims_mailbox`. `From`: `OpenTik <relay@in.<our domain>>`. Subject and body are exactly what the insurer should read — **no instructions in the body**, because the פקידה forwards this message as is.
5. Insert a `claim_emails` row (`direction = 'relay_out'`) and a `claim_events` row `submission_relayed`. **`handling_status` is not touched.**

The instructions live in the app. After relaying, the panel reads: "שלחנו לתיבה שלכם מייל מוכן. העבירו אותו ל-`<recipient>` והוסיפו בהעתק את `<inbound address>`", with copy buttons for both addresses. If the insurer's address is not verified in `INSURER_DIRECTORY`, the recipient line asks her to enter it, as today.

Re-relay is allowed (a document was added) and is recorded as a new row.

### 4. "Sent" from evidence: the self-copy rule

When the פקידה forwards the packet with the system address in CC, that copy arrives at the inbound webhook. It is treated as proof of sending when **all** hold:

- the `From` address equals the business's `claims_mailbox` (case-insensitive);
- the message matches a claim of this business (decision 6);
- the claim's effective handling status is empty.

Then the webhook runs the existing `planConfirm()` with the first non-system `To` address as recipient, and applies it with the same compare-and-set the manual route uses. A concurrent manual confirm simply wins; the webhook treats 0 rows updated as success.

This is the only state change inbound mail can cause. Forging it needs the secret alias and the claim's short id, and the result is a claim marked "נשלחה" — visible, reversible, and low-value to an attacker. Accepted.

### 5. Inbound webhook

`POST /api/inbound/email` — `maxDuration = 60`.

1. Verify the provider signature. Reject otherwise.
2. Idempotency: `claim_emails.provider_id` is unique; a repeated delivery returns 200 without work.
3. Resolve the business from the recipient local part → `agents.inbound_alias`. Unknown alias → 200 and a logged warning (a retry cannot fix it).
4. Fetch headers, text body and attachments from the provider. Store attachments in the existing private bucket under `emails/<agent_id>/<email_id>/<n>-<filename>`. Per-message cap 25 MB; above it, store the message without attachments and flag it `attachments_dropped`.
5. Classify `kind`: `self_copy` (From = `claims_mailbox`), `insurer` (From domain in the directory), else `other`.
6. Match to a claim (decision 6), apply the self-copy rule, insert rows.
7. Any failure after step 3 returns a non-200 so the provider retries; report through `serverError`.

Only the text body is stored and shown. HTML is discarded in phase 1.

### 6. Matching a message to a claim

Pure function `matchClaim()` in `web/src/lib/email/match.ts`, first hit wins, always scoped to this business's claims:

1. **Subject token.** `buildSubject()` already ends every subject with the first 8 hex characters of the claim id, and forwards and replies keep the subject. Extract every 8-hex token from the subject; exactly one claim id with that prefix → match (`match_method = 'subject_id'`).
2. **Thread.** `In-Reply-To` / `References` contains the `Message-ID` of a stored message that is already on a claim → that claim (`'thread'`).
3. Otherwise unmatched (`claim_id null`).

No fuzzy matching on plates or names in phase 1: a wrong auto-match puts one client's correspondence on another client's file. Unmatched mail costs one click; a mismatch is a privacy incident.

**Amended 2026-11-24 — automatic acknowledgements (`'auto_ack'`).** The first real third-party submission (to weSure) came back within two minutes as a canned reply: subject "תגובה על פנייתך", no `In-Reply-To`, nothing of ours quoted in the body. Neither rule above can file it, and it will happen on every send to such an insurer. So one narrow, timing-based rule runs when 1 and 2 find nothing — `matchAck()`:

- the sender's address is exactly an address this business sent to in the last 5 minutes;
- all those sends are for **one** claim (two claims sent to the same address → unmatched, both replies);
- each send accounts for **one** reply (a second message from that address → unmatched).

This is a deliberate exception to "no guessing", accepted by the user. What remains exposed: the first message after a send is not the acknowledgement but unrelated mail from the same address. The clerk's way out of such a mistake is "ביטול שיוך" on the email (`DELETE /api/emails/[id]/assign`), which returns it to the inbox.

### 7. Data model — migration `013_claim_emails.sql` (additive)

```sql
alter table agents add column claims_mailbox text;
alter table agents add column inbound_alias text unique;

create table claim_emails (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,
  claim_id uuid references claims(id) on delete set null,      -- null = unmatched
  direction text not null check (direction in ('relay_out', 'inbound')),
  kind text not null default 'other' check (kind in ('self_copy', 'insurer', 'other')),
  provider_id text unique,                                    -- idempotency key
  message_id text,                                            -- RFC 5322 Message-ID
  in_reply_to text,
  from_addr text not null,
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text not null default '',
  text_body text,
  match_method text check (match_method in ('subject_id', 'thread', 'manual')),
  attachments_dropped boolean not null default false,
  received_at timestamptz not null default now()
);
create index on claim_emails (agent_id, claim_id, received_at desc);
create index on claim_emails (message_id);

create table claim_email_attachments (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references claim_emails(id) on delete cascade,
  filename text not null,
  mime text,
  size_bytes integer,
  storage_path text not null
);
```

RLS on both tables: select for the owning agent (`agent_id in (select id from agents where auth_user_id = auth.uid())`, the attachment table through its email). All writes go through the service client, as with `outbound_events`.

**The migration is applied by hand on dev and prod** (see the promote checklist in `docs/status.md`). The feature must degrade to "off" when the table is missing, following the `loadQueue` pattern: log the migration name, hide the UI, do not 500.

### 8. UI

- **Claim page, sending panel.** Primary action "שליחה לתיבה שלי". After a relay, the instruction block from decision 3 and the relay time. The current copy-and-paste fields stay underneath as "שליחה ידנית". Shown only when `inbound_alias` is set; otherwise the panel is exactly today's.
- **Claim page, correspondence.** "התכתבות": the claim's emails newest first — sender, subject, time, text body collapsed, attachments as signed links. Its place among the tabs is decided together with the pending removal of the "עבודה על התיק" tab, not here.
- **Claims list.** A matched insurer email counts as activity: it feeds `activity_at` and sets the row's `fresh` badge to "מייל חדש", so the existing list routes the פקידה to it. No new column, no new chip.
- **`/dashboard/inbox`, sidebar "דואר נכנס".** Unmatched messages only, with a count badge. Each row: sender, subject, time, and "שיוך לתיק" (search by client name or plate) → `POST /api/emails/[id]/assign`, `match_method = 'manual'`. Empty state when everything is filed.
- **Settings.** The business's inbound address with a copy button, the `claims_mailbox` field, the time of the last inbound message, and the setup steps for the redirect rule.

All strings in a new `web/src/lib/email/copy.ts`.

### 9. Insurer domains

`DirectoryEntry` gains `domains: string[]`, used to classify `kind` and to print the sender list for the redirect rule in settings. It ships empty, like `claimsEmail`: collecting real domains is pilot legwork, and a wrong domain only mislabels a message.

### 10. Setup for a Microsoft 365 business (manual, per customer)

1. We set `inbound_alias` for the agent and confirm `claims_mailbox`.
2. Their 365 admin enables external auto-forwarding for the claims mailbox with a custom outbound spam policy scoped to that user.
3. In the claims mailbox, an Inbox rule: sender address includes any insurer domain → **Redirect to** the inbound address.
4. Test: a message from an address in the rule arrives in the app. If it does not, look for the `5.7.520` NDR, which means step 2 is not in effect.

### 11. Configuration

`EMAIL_PROVIDER_API_KEY`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_INBOUND_DOMAIN`. With any of them unset the feature is off everywhere and the build still passes. Add the three names to `web/.env.example`.

## Spike before building (half a day, no product code)

The design assumes four things nobody has observed yet. Check them with the pilot mailbox first:

1. A message **redirected** from the 365 mailbox is accepted by the provider's inbound and arrives with `From` = the original sender and its attachments intact. (A redirect usually fails SPF for the original domain; confirm the provider still delivers it.)
2. The subject, including the trailing short id, survives a forward and an insurer's reply.
3. The provider accepts our attachment types outbound and its webhook signature scheme works on Vercel.
4. **Draft mode.** A `.eml` attachment carrying the header `X-Unsent: 1` is reported to open in classic Outlook as an unsent draft with recipients, subject, body and attachments filled in. If that holds on the פקידה's machine, the relay can deliver a ready draft: no "Fwd:", recipient and CC pre-filled, so the self-copy rule fires without relying on her memory. Unverified, and known not to apply to new Outlook or Outlook on the web — so it is an optional enhancement on top of the forward flow, never a dependency.

If 1 fails, phase 1 inbound does not work as designed and this spec is revised before any build.

## Build order

1. Migration 013, provider module, config, feature-off paths.
2. Inbound webhook, storage, `matchClaim()`, inbox page and manual assign.
3. Correspondence section on the claim page; list `activity_at` / `fresh` integration.
4. Outbound relay route and the sending panel.
5. Self-copy rule.
6. Settings block and setup steps.

Inbound first: it is useful on its own (insurer replies reach the claim) and it carries the risk.

## Testing

- Vitest for the pure parts: `matchClaim()` (single token, two tokens, token of another business's claim, thread match, no match), self-copy detection, size budget, alias parsing.
- Webhook route against recorded provider payloads: bad signature, duplicate delivery, unknown alias, oversized attachments, matched, unmatched, self-copy on an already-sent claim.
- `planConfirm()` is reused, so its existing tests cover the transition itself.
- Done bar as always: `tsc`, `npm run build` and Vitest green, output pasted.

## Risks

| Risk | Handling |
|---|---|
| Tenant blocks external forwarding | Setup step 2; `5.7.520` is the tell; "last inbound message" in settings shows silence |
| The פקידה forgets the CC | Manual "סומן כנשלח" remains; draft mode (spike 4) removes the step |
| Insurer writes a fresh email with its own claim number | Lands in the unmatched inbox; one manual assign, after which thread matching follows the conversation |
| Mail injected to a leaked alias | Random suffix; content shown as text only; no state change except the self-copy rule |
| A redirect rule that is too broad sends unrelated mail to us | Rule is limited to insurer domains; `kind = 'other'` is visible in the inbox; see open question 4 |
| Forgotten migration on prod | Feature-off degradation plus the migration name in the log line |

## Later phases (not designed here)

- **Phase 2 — the system sends as the business.** For Microsoft 365 customers, Graph permission to send from and read the claims mailbox removes forwarding and rules entirely. It is a permission on the whole mailbox and works only for 365, so it follows evidence that the phase 1 flow fits the פקידה's day.
- **Phase 3 — suggested status.** AI reads an insurer email and proposes "נדרשו מסמכים" / "אושר"; the פקידה confirms. Inbound content is untrusted input to that model and must be treated as such.

## Open questions for the user

1. **Provider and privacy.** Resend would process claim packets containing ID, licence and third-party details. Is that acceptable under חוק הגנת הפרטיות as things stand, and do we need a data-processing agreement or a specific region before the pilot uses it?
2. **Inbound domain.** Which domain do we own for `in.<domain>`? The spec needs one MX record on a subdomain.
3. **Pilot facts.** Who administers the garage's 365 tenant, is it a business tenant or a personal outlook.com mailbox, and does the פקידה use classic Outlook, new Outlook or the browser?
4. **Retention.** How long do we keep stored emails and their attachments, and what happens to mail of `kind = 'other'` that was redirected by mistake — keep, or delete after N days?
5. **Attachments as documents.** A payment notice arriving by email is exactly the evidence the `paid` gate wants. Should phase 1 include "שמירה כמסמך בתיק" on an inbound attachment, or is download-and-upload acceptable for now? *(I left it out to keep phase 1 small; it is a natural first addition.)*
