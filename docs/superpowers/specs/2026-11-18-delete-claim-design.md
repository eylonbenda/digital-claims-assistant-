# Delete a claim opened by mistake — design

Date: 2026-11-18 · Size: small change · Approved in conversation 2026-11-18.

## Intent

The person working the claims (at the pilot garage, an employee) sometimes opens a תיק
by mistake: wrong client, a duplicate, a test. Today there is no way to get rid of it,
so it stays in the list, in the task queue and in the funnel numbers. They need to
remove it.

## Goals / non-goals / anti-goals

- **Goal:** one action on the claim page removes the claim and everything that belongs
  to it, including the files in Storage.
- **Non-goal:** undo, a trash view, bulk delete, delete from the claims list.
- **Non-goal:** replacing "close with a reason". A claim that reached the insurer is
  closed, never deleted.
- **Anti-goal:** a mis-click destroying a claim that has real work in it.

## Approaches

1. **Permanent delete, guarded (picked).** `DELETE /api/claims/[id]` removes the row;
   the schema already cascades to every child table. Allowed only while the claim has
   not been sent to the insurer. No migration. No undo.
2. **Soft delete (`deleted_at`).** Undo is possible, but it needs a migration and a
   filter on every claims read, including service-client reads that bypass RLS; one
   missed filter leaks a deleted claim into the list or the stats. It also keeps ID and
   licence photos for a claim that should not exist (חוק הגנת הפרטיות).
3. **Reuse `status = 'abandoned'`.** No delete at all, but the claim stays in the
   closed list and in the funnel, which is the complaint.

Picked 1: the mistake case wants the data gone, and the guard limits the no-undo cost
to claims that have little work in them.

## Design

**Guard — when delete is allowed** (`web/src/lib/claims/delete.ts`, pure, shared by the
route and the page):

- blocked when `effectiveHandling(handling_status, checklist_state, claim_type)` is
  non-null (sent, including legacy claims sent by hand before migration 011);
- blocked when an outbound email exists on the claim (`claim_emails.direction =
  'outbound'`). Until migration 013 is applied the table does not exist, which counts
  as "no emails"; any other read failure is a 500, so a transient error never waves
  the guard through.

`status` (including `closed` / `abandoned`) does not block: a never-sent claim closed
or abandoned by mistake is still a mistake.

**Route — `DELETE /api/claims/[id]`** (new `web/src/app/api/claims/[id]/route.ts`):

1. 401 without a session. Ownership via the auth client (RLS): a foreign id is 404.
2. Guard fails → 409 with a Hebrew message pointing at "עדכון סטטוס → סגירה".
3. Collect `storage_path` from `claim_documents` and `generated_forms`.
4. Delete the `claims` row with the service client, compare-and-set on
   `handling_status is null` so a concurrent send wins (0 rows → 409).
5. Remove the Storage objects. Row first, objects second: a failure leaves an orphan
   blob nobody can reach, never a row pointing at nothing (same rule as document
   delete). A removal error is reported, not returned.

What the cascade does not take: emails filed on the claim. `claim_emails.claim_id` is
`on delete set null`, so inbound mail filed on the deleted claim returns to the inbox
as unfiled, with its attachments. That is the wanted behaviour — the mail was real,
the claim was not.

No audit row survives (`claim_events` cascades); the route logs one line with the claim
id and file count, no PII.

**UI — claim page header** (`DeleteClaimButton.tsx`, rendered by `CockpitHeader`):

- a quiet text button "מחיקת תיק", shown only when the guard allows it;
- a confirm dialog that names the client, states how many files go with it, and says
  it cannot be undone; the confirm button is red;
- on success: `router.replace("/dashboard")` + refresh. On 409/500 the dialog shows
  the server's message.

```
┌──────────────────────────────────────────┐
│ מחיקת התיק של ישראל ישראלי?              │
│ התיק, 4 הקבצים, המשימות וההערות יימחקו   │
│ לצמיתות. אי אפשר לשחזר.                  │
│ הקישור שנשלח ללקוח יפסיק לעבוד.          │
│                    [ביטול]  [מחיקת התיק] │
└──────────────────────────────────────────┘
```

## Left to the builder

Dialog styling (follow `HandlingDialog`), exact Hebrew copy, test fakes.

## Testing

Vitest: the pure guard; the route (happy path order of writes, 401, 404, 409 sent,
409 outbound email, 409 lost race). Then `tsc`, `npm run build`, and a click-through
on a production build.
