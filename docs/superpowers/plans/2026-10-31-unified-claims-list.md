# Unified Claims List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard's card list + all-claims table with one filterable, searchable claims list, and move the reminder send into a single cockpit button.

**Architecture:** Pure logic in `web/src/lib/dashboard/` (stage derivation, row composition, search, filter/count/sort), unit-tested with Vitest. One client component `ClaimsList.tsx` renders it; `page.tsx` feeds it. The cockpit header gets one `ReminderButton` fed by a per-claim slice of the existing outbound queue.

**Tech Stack:** Next.js 16 (App Router, `searchParams` is a Promise), TypeScript, Tailwind, Supabase JS, Vitest (node env; no component-test infra).

**Spec:** `docs/superpowers/specs/2026-10-31-unified-claims-list-design.md`. Read it before Task 1. Section numbers (§) below refer to it.

## Global Constraints

- Hebrew UI strings, all in `web/src/lib/dashboard/copy.ts`; English identifiers; RTL (`dir="rtl"`).
- Next.js 16: read `web/node_modules/next/dist/docs/` before touching `page.tsx`.
- No migration, no API or schema change. `/api/outbound/events` stays as is (it still accepts `skipped`; nothing in the UI writes it).
- Done = `npx tsc --noEmit` + `npm run build` + `npm test`, all green, with the output pasted. All commands run from `web/`.
- A fresh worktree has no `web/node_modules`. Run `npm ci` in `web/` first.
- Commit per task on branch `feat/unified-claims-list`, cut from `origin/main`, in its own worktree. Do not reuse the spec branch. End every commit message with `Co-Authored-By: Claude <model> <noreply@anthropic.com>`.
- Stage labels are verbatim: `אצל הלקוח`, `לפני שליחה למבטחת`, `נשלח למבטחת`, `ממתין לתשלום`, `סגורים`. The needs-you chip label is `צריך אותך`, and the all chip is `הכל`.

## Review Focus

1. **A claim with a handling status but no client submit** (the פקידה completed it herself) must sit in `נשלח למבטחת`, not `אצל הלקוח`. Pinned in Task 1.
2. **A closed claim with an open task, or one that is unclassified, or rejected** must not get a red dot and must not count under `צריך אותך`. Pinned in Task 2.
3. **A 1–2 digit query** ("5") must not match every phone. Name matching still works. Pinned in Task 3.
4. **A stale `?tp=2` or a garbage `?stage=xyz` URL** from a bookmark must render the default view, not crash or show an empty list. Pinned in Task 3 (`parseStageFilter`), and Task 4 drops `tp`.
5. **Clicking the copy-link icon** must copy without navigating into the claim. Checked manually in Task 4's browser check, because there is no component-test infra.

---

### Task 1: Stage derivation

**Files:**
- Create: `web/src/lib/dashboard/stage.ts`
- Modify: `web/src/lib/dashboard/copy.ts` (add labels)
- Test: `web/src/lib/dashboard/stage.test.ts`

**Interfaces:**
- Produces:
  - `type Stage = "with_client" | "before_send" | "sent" | "awaiting_payment" | "closed"`
  - `STAGE_ORDER: Stage[]`, in chip order: with_client, before_send, sent, awaiting_payment, closed
  - `claimStage(c: { status: string; submitted_at: string | null; handling_effective: string | null }): Stage`
  - In `copy.ts`: `STAGE_LABEL: Record<Stage, string>`, `ALL_CHIP = "הכל"`, `NEEDS_YOU_CHIP = "צריך אותך"`, `CLOSED_LINE = "התיק נסגר"`, `EMPTY_STAGE_NOTE = "אין תיקים בשלב הזה"`, `SEARCH_PLACEHOLDER = "חיפוש לפי שם, טלפון או לוחית רישוי…"`, `NO_RESULTS = "לא נמצאו תוצאות"`, `ACTIVITY_HEADER = "פעילות אחרונה"`

- [ ] **Step 1: Write the failing tests.** Use the spec §1 table, first match wins, in this order: closed, sent, awaiting_payment, with_client, before_send.

```ts
it("closed/abandoned status → closed, whatever else is set", ...)          // status "closed" and "abandoned"
it("paid → closed even if status is still open", ...)                      // handling_effective "paid", status "form_generated"
it.each(["sent","docs_requested","rejected","appeal","legal"])("%s → sent", ...)
it.each(["approved_awaiting_payment","partial_paid"])("%s → awaiting_payment", ...)
it("handling status outranks a missing submit → sent", ...)                // submitted_at null, handling "sent" → "sent"
it("no submit, no handling → with_client", ...)
it("submitted, no handling → before_send", ...)
```

- [ ] **Step 2:** `npx vitest run src/lib/dashboard/stage.test.ts` should FAIL, because the module isn't found.
- [ ] **Step 3:** Implement `claimStage` and the copy constants.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dashboard): derive claim stage`.

---

### Task 2: Compose one row per claim

**Files:**
- Modify: `web/src/lib/dashboard/compose.ts`
- Modify: `web/src/lib/dashboard/compose.test.ts`, `web/src/lib/dashboard/compose-handling.test.ts`

**Interfaces:**
- Consumes: `claimStage`, `Stage`, `CLOSED_LINE` (Task 1).
- Produces:
  - `ComposeClaim` gains `phone: string | null; urgent: boolean; access_token: string; client_plate: string | null; tp_plates: string[]; handling_changed_at?: string | null`.
  - `ClaimRow = ClaimCard & { stage: Stage; phone: string | null; urgent: boolean; closed: boolean; access_token: string; client_plate: string | null; tp_plates: string[] }`.
  - `composeDashboard(input)` keeps its input shape (`claims` now includes closed claims) and **returns `ClaimRow[]`**, sorted by `activity_at` desc. `DashboardList`, `attention`, `waiting` and `ok` are deleted.

- [ ] **Step 1: Rewrite the tests.**
  - Delete the `sections` and `ordering` describes, which test attention/waiting/ok and tier sort. Keep `honest fallback lines`, `card anatomy`, `ai_line provenance`, `activity` and `compose-handling`, adapted to read from the returned array.
  - Extend the `cl()` fixture with the new fields: `phone: "0520000000", urgent: false, access_token: "tok", client_plate: null, tp_plates: []`.
  - Add:

```ts
it("includes closed claims, marked closed, with stage closed and CLOSED_LINE", ...)
it("closed claim with a handling status uses handlingLine, not CLOSED_LINE", ...)   // handling_effective "paid" → "שולמה"
it("closed claim never needs_action — even unclassified, rejected, or with a send/do item", ...)
it("docs_requested and rejected set needs_action", ...)
it("appeal and legal alone do not set needs_action", ...)
it("handling_changed_at counts as activity", ...)   // older created/submitted, handling_changed_at today → sorts first, activity_at === handling_changed_at
it("carries phone, urgent, access_token, client_plate, tp_plates through", ...)
```

- [ ] **Step 2:** `npx vitest run src/lib/dashboard/compose` should FAIL.
- [ ] **Step 3: Implement.** Closed rows (`status ∈ {closed, abandoned}` or stage `closed`) skip the action-line machinery:
  - `action_line = handling_effective ? handlingLine(...) : CLOSED_LINE`
  - `needs_action = false`, `send = null`, `also_line = null`
  - `needs_action` for open rows = `!!send || dos.length > 0 || unclassified || handling_effective ∈ {docs_requested, rejected}`
  - Add `handling_changed_at` to `latest(...)`.
  - Remove the brief tier sort and `futureBy` if nothing else reads it. `briefBy` stays for `ai_line`.
- [ ] **Step 4:** `npm test` should PASS in full, including all other suites.
- [ ] **Step 5:** Commit `refactor(dashboard): compose one row per claim, incl. closed`.

---

### Task 3: Search, filter, counts, sort

**Files:**
- Create: `web/src/lib/dashboard/list.ts`
- Test: `web/src/lib/dashboard/list.test.ts`

**Interfaces:**
- Consumes: `ClaimRow`, `Stage`, `STAGE_ORDER`.
- Produces:
  - `type StageFilter = "all" | "needs_you" | Stage`
  - `parseStageFilter(raw: string | string[] | undefined): StageFilter`. Unknown or array garbage gives `"all"`.
  - `normalizeDigits(s: string | null | undefined): string`. Keeps `0-9` only.
  - `matchesQuery(row: Pick<ClaimRow, "client_name" | "phone" | "client_plate" | "tp_plates">, q: string): boolean`
  - `visibleRows(rows: ClaimRow[], filter: StageFilter, q: string): ClaimRow[]`. Filtered and sorted.
  - `chipCounts(rows: ClaimRow[], q: string): Record<Exclude<StageFilter, "closed">, number>`

Rules (spec §3–4, decided):
- `matchesQuery`: an empty or whitespace query matches everything. Otherwise it matches if the trimmed query is a substring of `client_name`, **or** the query has ≥ 3 digits and `normalizeDigits(q)` is a substring of the normalized phone, client plate, or any TP plate.
- `visibleRows`:
  - `"all"` gives non-closed rows. When `q` is non-empty, closed rows that match are added too.
  - `"needs_you"` gives `needs_action && !closed`.
  - A stage gives `stage === filter`.
  - Then `matchesQuery` is applied.
  - Sort: `"needs_you"` sorts by `overdue_days` desc, then `activity_at` desc. Everything else sorts by `activity_at` desc.
- `chipCounts`: counts query-matching rows. `all` = non-closed matches, `needs_you` = needs-you matches, each non-closed stage = its matches. There is no `closed` key.

- [ ] **Step 1: Write the failing tests.**

```ts
expect(normalizeDigits("12-345-67")).toBe("1234567")
it("plate query matches across formats", ...)                 // client_plate "12-345-67", q "1234567" → true; q "12 345 67" → true
it("matches a second third-party vehicle's plate", ...)       // tp_plates ["11-111-11","22-333-44"], q "2233344" → true
it("phone digits match with dashes in the query", ...)        // phone "0521234567", q "052-123" → true
it("fewer than 3 digits never digit-matches", ...)            // q "5", phone "0555555555", name "דנה" → false
it("name substring matches; null name doesn't throw", ...)
it("'all' hides closed rows unless the query matches them", ...)
it("needs_you excludes closed and sorts most-overdue first", ...)
it("stage filter returns only that stage", ...)
it("chipCounts follow the query", ...)                        // two rows in different stages, q matches one → that stage 1, other 0, all 1
it.each([undefined, "xyz", ["sent","x"], ""])("parseStageFilter(%j) → 'all'", ...)
it("parseStageFilter accepts every valid key", ...)
```

- [ ] **Step 2:** `npx vitest run src/lib/dashboard/list.test.ts` should FAIL.
- [ ] **Step 3:** Implement `list.ts`.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(dashboard): search, stage filter, chip counts`.

---

### Task 4: The list UI, and wiring the page

**Files:**
- Create: `web/src/app/dashboard/ClaimsList.tsx` (client component)
- Modify: `web/src/app/dashboard/page.tsx`
- Delete: `web/src/app/dashboard/TodayList.tsx`, `web/src/app/dashboard/ClaimsTable.tsx`
- Modify: `web/src/lib/dashboard/paginate.ts` (doc comment only: `?tp=` is gone)

**Interfaces:**
- Consumes: `composeDashboard` → `ClaimRow[]` (Task 2); `visibleRows`, `chipCounts`, `parseStageFilter`, `StageFilter` (Task 3); `STAGE_LABEL` and the copy constants (Task 1); `paginate`, `parsePage`, `Pager`, `useUrlPage` (existing).
- Produces: `ClaimsList({ rows, greeting, dateLabel, name, initialPage, initialStage }: { rows: ClaimRow[]; greeting: string; dateLabel: string; name: string | null; initialPage: number; initialStage: StageFilter })`

- [ ] **Step 1: Wire `page.tsx`.**
  - `searchParams` is `{ p?, stage? }`. Drop `tp`.
  - Add `client_plate:summary_json->collected->vehicle->>plate` to the claims select.
  - Add one RLS-scoped query, `supabase.from("third_parties").select("claim_id, plate")`, grouped into `Map<string, string[]>` and skipping null plates.
  - Pass **all** claims to `composeDashboard`, with the new `ComposeClaim` fields and `handling_changed_at: c.handling_status_changed_at`.
  - Render `<NewClaimForm />` header row + `<ClaimsList … initialStage={parseStageFilter(stage)} />`. Remove the `TodayList`/`ClaimsTable` imports.
  - Keep `BriefAutoRefresh`, `RefreshOnFocus` and the queue/brief loading untouched.
- [ ] **Step 2: Build `ClaimsList.tsx`** per spec §2:
  - **Order:** greeting subtitle, search input (state only, never in the URL), chip row, list, `Pager`.
  - **State:**
    - `query` is `useState("")`.
    - The stage is mirrored to `?stage=` with the same `replaceState` pattern as `useUrlPage`. Add a sibling hook `useUrlStage(initial: StageFilter)` in `Pager.tsx`. It deletes the param for `"all"`.
    - Changing the stage or the query resets the page to 1.
    - Page size is 25. The page param is `p`.
  - **Chips:**
    - Labels and counts come from `chipCounts(rows, query)` (`· N`); `סגורים` has no count.
    - The active chip is `bg-zinc-900 text-white`. `צריך אותך` is red-tinted (`border-red-300 bg-red-50 text-red-700`) when inactive.
    - On narrow screens the chip row is `flex overflow-x-auto`.
  - **Rows:**
    - A `<ul>` of `<li className="relative …">`. Do not use `<table>`.
    - On `md+`, use a 4-column grid: לקוח | שלב | הצעד הבא | פעילות אחרונה, plus a narrow copy column. A header row sits above it, hidden below `md`.
    - The whole row is clickable via a `<Link>` on the client name with `after:absolute after:inset-0`.
    - The copy button is `relative z-10` and calls `e.stopPropagation()`. It shows only when `!row.closed`. Reuse the existing `CopyLinkButton` behaviour, moved into this file.
  - **Cells:**
    - **לקוח:** red dot (`needs_action`), `⚑` (`urgent`), name or `ללא שם`, fresh badge (`חדש` / `מסמך חדש`, same classes as today's card). Second line, `hidden md:block`: phone · client_plate.
    - **שלב:** badge, one colour per stage: with_client zinc, before_send amber, sent blue, awaiting_payment violet, closed zinc-muted. Second line, `hidden md:block`: `track_label`.
    - **הצעד הבא:** `action_line`. Tone is red if `send`, amber if `needs_action`, otherwise zinc-500. Below it, `also_line` (amber, xs) and `ai_line` (zinc-400, xs).
    - **פעילות אחרונה:** "היום" / "אתמול" / "לפני N ימים", from `activity_at`, `hidden md:block`.
  - **Closed rows** use `text-zinc-400` on the name.
  - **Mobile (< md):** each row stacks as name + dot + stage badge on line 1 and the next-step line on line 2.
  - **Empty states:**
    - `rows.length === 0`: the existing first-claim CTA, moved verbatim from `TodayList`, with no chips and no search.
    - No visible rows under `needs_you` with no query: `ALL_DONE_NOTE`.
    - No visible rows with a query: `NO_RESULTS`.
    - Otherwise: `EMPTY_STAGE_NOTE`.
- [ ] **Step 3: Delete the old components.** Delete `TodayList.tsx` and `ClaimsTable.tsx`, then `grep -rn "TodayList\|ClaimsTable\|DashboardList" src`. Expected: no hits.
- [ ] **Step 4: Verify.** Run `npx tsc --noEmit && npm test && npm run build` and paste the output. Expected: all green.
- [ ] **Step 5: Browser check.** Use `preview_start` (see the `claims-worktree-dev-server` memory: Next 16 singleton guard, verify on :3101), against dev Supabase. Check that:
  - each claim appears once
  - every chip filters and the counts match
  - a plate search works (pick a real plate from a dev claim)
  - the copy icon copies without navigating
  - Back from a claim keeps `?stage=` and `?p=`
  - at 375px there is no horizontal page scroll and rows show two lines

  Take a screenshot as proof.
- [ ] **Step 6:** Commit `feat(dashboard): unified claims list`.

---

### Task 5: One reminder button in the cockpit

**Files:**
- Modify: `web/src/lib/outbound/load.ts`
- Modify: `web/src/app/dashboard/[id]/page.tsx`, `web/src/app/dashboard/[id]/CockpitHeader.tsx`
- Create: `web/src/app/dashboard/[id]/ReminderButton.tsx`

**Interfaces:**
- Produces:
  - `loadQueue(agentId, origin, brief, opts?: { claimId?: string })`. When `claimId` is set, the claims query adds `.eq("id", claimId)`. Nothing else changes, and every existing caller works unchanged.
  - `CockpitHeaderProps` gains `pendingSend: SendItem | null` and `claimOpen: boolean`.
  - `ReminderButton({ claimId, pendingSend, fallbackHref, fallbackBody, size }: { claimId: string; pendingSend: SendItem | null; fallbackHref: string | null; fallbackBody: string; size: "primary" | "secondary" })`

- [ ] **Step 1: Per-claim queue.**
  - Add `opts.claimId` to `loadQueue`.
  - In the cockpit `page.tsx`, add `id` to the `agents` select.
  - Call `loadQueue(agentRow.id, origin, null, { claimId: claim.id })` and set `pendingSend = queue?.send.find((s) => s.claim_id === claim.id) ?? null`. A null queue gives `null`, and the fallback still works.
  - Pass `pendingSend` and `claimOpen` (`status ∉ {closed, abandoned}`) into the header props.
- [ ] **Step 2: `ReminderButton.tsx`.**
  - The label is `💬 שלח תזכורת ללקוח ↗`.
  - On click it **synchronously** calls `window.open(href, "_blank", "noopener,noreferrer")` first. Keep the TRAP comment from `TodayList`'s `send()` verbatim. Then it POSTs `/api/outbound/events`:
    - with `pendingSend`: `{ claim_id, task_id, task_key, kind: "sent", body }` from the item, and `href = pendingSend.href`.
    - otherwise: `{ claim_id, task_key: "chase_missing_docs", kind: "sent", body: fallbackBody }` and `href = fallbackHref`. This is today's `logChase` payload.
  - On success, `router.refresh()`. On failure, show `הרישום נכשל — נסה שוב`, same as today's `SendButtons`.
  - It is disabled with the title `מספר טלפון חסר או לא תקין` when `href` is null.
  - There is no skip control.
- [ ] **Step 3: Header placement.** The button appears exactly once while `claimOpen`:
  - in the next-action slot (size `primary`) when `na.kind === "chase"`, replacing today's `<a>` + `logChase`
  - otherwise as a `secondary` button under the phone line

  Remove `logChase`. Keep building `chaseBody` and `chaseHref`, because they are the fallback.
- [ ] **Step 4: Verify.** Run `npx tsc --noEmit && npm test && npm run build` and paste the output. Browser check:
  - On a dev claim with a due `finish_wizard` or `chase_missing_docs` item, the button opens WhatsApp with **that** item's text, and the new `outbound_events` row has a non-null `task_id`. Check with Supabase MCP `execute_sql`, read-only.
  - On a claim with nothing due, it sends the ad-hoc chase.
  - After a send, the list's red dot for that claim clears on refresh, because the cooldown is now active.
- [ ] **Step 5:** Commit `feat(cockpit): single reminder button fed by the outbound queue`.

---

### Task 6: Docs and PR

- [ ] **Step 1:** Run the `doc-sync` skill in this worktree. It updates `docs/app-map.md` (dashboard module map: `ClaimsList`, `lib/dashboard/stage.ts` + `list.ts`, the removed `TodayList`/`ClaimsTable`), `docs/flow.md` if it describes the dashboard sections, and the `docs/status.md` breadcrumb.
- [ ] **Step 2:** Final `npx tsc --noEmit && npm test && npm run build`. Paste the output.
- [ ] **Step 3:** Push and open the PR with `gh pr create`. In the body, state:
  - no migration
  - the `לא היום` skip is removed (user decision; the API still accepts `skipped`)
  - known cost: a held-back reminder keeps its dot

  Leave it for the user to merge.
