# Status update from an insurer email — design

Date: 2026-11-22 · Status: awaiting approval

## Intent

When the insurer answers by email, the clerk today reads the message under
"התכתבות", downloads the attached letter, uploads it again as a claim document,
opens the status dialog and picks the status. The system already holds the
message, the file and the claim; it should do the filing for her. One click on
the email updates the status, files the attachment as the evidence, and swaps
the follow-up task.

This is step 1 of "status from insurer emails". Step 2 (the system proposes the
status itself) is deliberately not built now: there is no real insurer mail to
build or measure a classifier on — every inbound message so far is a test.

## Goals

- From an inbound email on a sent claim: update the handling status without
  downloading or re-uploading anything.
- The claim says "an insurer email is waiting" until the clerk has dealt with it.
- Every decision is stored as (email, chosen outcome), so step 2 has labelled
  examples to be built and measured against.

## Non-goals

- No AI reading of inbound mail. The rule in the phase-1 email spec stands, and
  no new data goes to Anthropic.
- No automatic status change. Nothing changes without a click.
- No filing of attachments for statuses that need no evidence (requests for
  documents, approvals) — the letter stays visible under "התכתבות".
- No change to matching, forwarding, or the unmatched inbox.

## Anti-goals

- A status set from the wrong email or with the wrong file as "evidence".
  The clerk always sees which file is being filed, and the existing transition
  rules (legal targets, required evidence, required note) are enforced
  unchanged by the same server code.
- A claim that nags about an email forever. Every email can be dismissed with
  "אין שינוי בסטטוס".

## Approaches considered

- **A. AI reads the mail and proposes the status now.** Rejected for now: the
  classifier would be written from a guess at how insurers phrase things and
  tested on mail we wrote ourselves; it also widens the parked privacy item.
- **B. One-click actions on the email, no AI; record each choice. (chosen)**
  Most of the clerk's saving is the removed download/upload and the single
  click, not the recognition. Works for any insurer wording from day one, and
  everything built here stays in use when the proposal is added.
- **C. Wait for real examples, then build A.** Gives the clerk nothing in the
  meantime. The request for 15–20 old insurer replies from the garage goes out
  in parallel with B instead.

## Design

### Which emails get actions

An email is **pending** when all hold: `direction = 'inbound'`,
`handled_at is null`, its claim has a handling status (the claim was sent) and
the claim is not closed. Not narrowed by `kind`: a reply forwarded from the
garage's own mailbox is still the insurer's answer.

### On the email card (claim page, "התכתבות")

A pending email shows a row under the body:

    עדכון סטטוס לפי המייל:  [ביקשו השלמות] [אושרה] [שולמה חלקית] [שולמה] [נדחתה]   אין שינוי בסטטוס

The buttons are the legal targets from the claim's current status
(`canTransition`), so the row differs after a rejection or a partial payment.
A handled email shows one muted line instead: "עודכן לפי המייל: נדחתה" or
"סומן: אין שינוי".

### The dialog

A button opens the existing `HandlingDialog` with the target preselected and
the email as context:

- **Evidence statuses** (paid, partial_paid, rejected): instead of the file
  input, the email's attachments as radio options, the first selected, plus
  "קובץ אחר" which reveals the file input. An email with no attachment shows
  the file input as today.
- **docs_requested**: the note ("מה המבטחת ביקשה?") is prefilled with the
  email body, trimmed to 600 characters, editable.
- Everything else (amount field, lawyer fields) as today.

On confirm: file the chosen attachment as the evidence document → set the
amount if given → `PATCH /handling` with `email_id` → the email is marked
handled. "אין שינוי בסטטוס" marks it handled directly, no dialog.

### Server

- **Migration 015** (manual, dev and prod): `claim_emails.handled_at
  timestamptz`, `claim_emails.handled_as text` (a handling status or `none`).
  Backfill `handled_at = now(), handled_as = 'none'` for existing inbound rows
  so test mail does not light up.
- `POST /api/claims/[id]/documents/from-email` `{ attachment_id, type }`:
  checks through the user's client that the attachment's email is filed on this
  claim; downloads the stored object, runs the same content sniff and size
  rules as an upload, writes a **copy** under the claim's documents path and
  inserts the `claim_documents` row. A copy, because deleting a claim document
  removes its storage object and must not break the email. `type` is limited to
  `payment_notice` / `rejection_letter`. An unsupported file type returns the
  normal upload error; the dialog then offers "קובץ אחר".
- `PATCH /api/claims/[id]/handling` accepts optional `email_id`: after a
  successful transition sets `handled_at/handled_as` on that email (only if it
  belongs to this claim) and adds `email_id` to the `handling_changed` event.
- `PATCH /api/emails/[id]/handled` `{ outcome: "none" }` for the dismiss.

### Next action

`deriveCockpit` gets `pendingInsurerEmail: boolean`. When true it wins over the
other post-send lines (docs requested, awaiting insurer, follow-up task):
"הגיע מייל מהמבטחת — עדכנו את הסטטוס", target the tab holding "התכתבות". It
does not outrank closed / awaiting client / classify / chase.

## Left to the builder

Copy wording, the exact dialog layout, where the `EmailCard` action slot is
filled from (it already takes `children`), and test layout.

## Open after this ships

- Ask the pilot garage for 15–20 past insurer replies (forwarded to the system
  address) — the examples step 2 needs.
- Step 2: preselect the button from an AI reading, measured against
  `handled_as`. Needs the privacy notice item settled first.
