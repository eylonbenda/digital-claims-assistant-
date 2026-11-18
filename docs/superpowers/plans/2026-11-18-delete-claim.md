# Delete Claim Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the business permanently delete a claim opened by mistake, as long as it was never sent to the insurer.

**Architecture:** A pure guard decides whether a claim may be deleted; a new `DELETE /api/claims/[id]` route enforces it, deletes the row (the schema cascades) and removes the Storage objects; the claim page header shows a delete button with a confirm dialog only when the guard allows it.

**Tech Stack:** Next.js 16 route handlers, Supabase (auth client for ownership, service client for writes), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-18-delete-claim-design.md`

## Global Constraints

- No DB migration.
- English identifiers, Hebrew UI strings. Bucket is `claim-docs`.
- Ownership is always proven through the auth client (RLS); the service client only writes.
- Row delete before Storage removal; a Storage error is reported (`reportError`), never returned.
- Read `web/node_modules/next/dist/docs/` before writing Next code that isn't a copy of an existing pattern.

## Review Focus

1. Claim sent between page render and click → route returns 409, nothing deleted (Task 2 test "409 when sent").
2. Concurrent send racing the delete → compare-and-set matches 0 rows → 409, no Storage removal (Task 2 test "409 on lost race").
3. `claim_emails` table missing (migration 013 not applied) → read error counts as no emails, delete proceeds (Task 2 test "proceeds when the emails read fails").
4. Claim with zero files → Storage `remove` is not called with an empty array (Task 2 test "no files").
5. Legacy claim sent by hand (`handling_status` null, sent milestone ticked) → blocked (Task 1 test).

---

### Task 1: Guard

**Files:**
- Create: `web/src/lib/claims/delete.ts`
- Test: `web/src/lib/claims/delete.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type DeleteBlocker = "sent" | "emailed";
  export function deleteBlocker(input: {
    handlingStatus: string | null;
    checklistState: Record<string, boolean> | null;
    claimType: ClaimType;
    hasOutboundEmail: boolean;
  }): DeleteBlocker | null;
  export const DELETE_BLOCKED_MESSAGE: Record<DeleteBlocker, string>; // Hebrew, points at closing instead
  ```
  `"sent"` when `effectiveHandling(...)` is non-null (checked first), `"emailed"` when `hasOutboundEmail`.

- [ ] **Step 1:** Write failing tests: fresh claim → `null`; `handlingStatus: "sent"` → `"sent"`; null status + `own_policy` sent milestone ticked (use `sentMilestoneFor("own_policy")`) → `"sent"`; `hasOutboundEmail` → `"emailed"`; `status`-independent (no status input at all).
- [ ] **Step 2:** Run `npx vitest run src/lib/claims/delete.test.ts` — fails (module missing).
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run again — passes.
- [ ] **Step 5:** Commit `feat(claims): guard for deleting a claim`.

### Task 2: Route

**Files:**
- Create: `web/src/app/api/claims/[id]/route.ts`
- Test: `web/src/app/api/claims/[id]/route.test.ts` (fakes modelled on `documents/[docId]/route.test.ts`)

**Interfaces:**
- Consumes: `deleteBlocker`, `DELETE_BLOCKED_MESSAGE` (Task 1).
- Produces: `DELETE /api/claims/[id]` → `200 {ok:true}` · `401` · `404` · `409 {error: <Hebrew>}` · `500`.

Order inside the handler: session → auth-client read of `claims` (`id, handling_status, checklist_state, claim_type`) → auth-client count of outbound `claim_emails` (error ⇒ false) → guard → auth-client reads of `claim_documents.storage_path` and `generated_forms.storage_path` → service `claims.delete({count:"exact"}).eq("id").is("handling_status", null)` → `count === 0` ⇒ 409 → Storage `remove(paths)` if any → one `console.info` line (claim id, file count).

- [ ] **Step 1:** Write failing tests: happy path asserts writes `["delete claims", "remove <doc path>,<form path>"]`; 401; 404; "409 when sent"; "409 on an outbound email"; "409 on lost race" (delete count 0, no remove); "proceeds when the emails read fails"; "no files" (no remove call).
- [ ] **Step 2:** Run `npx vitest run "src/app/api/claims/[id]/route.test.ts"` — fails.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run again — passes.
- [ ] **Step 5:** Commit `feat(api): DELETE /api/claims/[id]`.

### Task 3: UI

**Files:**
- Create: `web/src/app/dashboard/[id]/DeleteClaimButton.tsx`
- Modify: `web/src/app/dashboard/[id]/CockpitHeader.tsx` (new props `canDelete: boolean`, `fileCount: number`; render the button under the days-open line)
- Modify: `web/src/app/dashboard/[id]/page.tsx` (compute `canDelete` with `deleteBlocker`; `hasOutboundEmail` from `claimEmails`; `fileCount` = docs + all generated forms)

**Interfaces:**
- Consumes: `deleteBlocker` (Task 1), the route (Task 2).
- Produces: `<DeleteClaimButton claimId clientName fileCount />`.

- [ ] **Step 1:** Build the button + dialog (style after `HandlingDialog`; copy from the spec sketch; red confirm; Escape/backdrop cancel while not busy). On 200: `router.replace("/dashboard")` then `router.refresh()`. Otherwise show `json.error ?? "המחיקה נכשלה"`.
- [ ] **Step 2:** Wire props through `page.tsx` → `CockpitTabs` header → `CockpitHeader`.
- [ ] **Step 3:** `npx tsc --noEmit`, `npm run test`, `npm run lint`, `npm run build` — all green.
- [ ] **Step 4:** Click-through on `next start` (production build): button absent on a sent claim; on a fresh test claim the dialog opens, cancel keeps the claim, confirm lands on the list without it.
- [ ] **Step 5:** Update `docs/app-map.md` (route table) and `docs/flow.md` (edge case), commit `feat(dashboard): delete a claim opened by mistake`, push, open PR.
