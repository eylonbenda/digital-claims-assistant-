# Unified claims list — design

**Date:** 2026-10-31 · **Status:** design agreed with the user, awaiting final read · **Area:** `web/src/app/dashboard/` (the agent's landing page)

## Intent

The landing page today shows every open claim **twice**: a card list on top (`TodayList.tsx` — next action, colour, send/skip buttons) and an "all claims" table below (`ClaimsTable.tsx` — search, phone, track, handling status, date, copy-link, closed toggle). Neither is a subset of the other, so the פקידה gets two half-tools for one job, and the handling-status work (spec `2026-10-21-claim-handling`) already had to bolt a column onto the second one.

The user's framing of what the page is for, which drives every call below:

- **It is a router, not a workbench.** The פקידה scans the list, spots the relevant claim, and opens it. The work (form, documents, sending, handling status) happens inside the claim (the cockpit, `/dashboard/[id]`).
- **She mostly scans rather than searches** (user's estimate, not measured) — so default order and at-a-glance state matter more than search, but search must exist.
- **Today the main use is the accident-notice form; the goal is the whole claim lifecycle.** The list must hold claims at every stage for weeks, not just fresh intake.

## Goals

1. One list, one row per claim, replacing both current components.
2. Every row answers three questions at a glance: **who** (client), **where is the claim** (stage), **what happens next** (next-step line).
3. Filter by stage with counts; a "needs you" filter; search by name, phone, or licence plate (the client's and any third party's).
4. Scales to hundreds of claims (pagination already exists — keep it).

## Non-goals

- No new actions on the list. Actions live in the claim.
- No change to the cockpit beyond the reminder parity in §6.
- No change to how the next-step line is computed (`compose.ts` logic stays; only its shape/consumers change), except the `activity_at` input in §3.
- No schema migration.
- No kanban, no per-stage sections, no column sorting (decided: direction "A — smart table", chosen over grouped list and kanban in the mockup round).

## Anti-goals

- **A status zoo.** Five chips including "סגורים". The 2026-10-21 spec's anti-goal ("the פקידה needs at most לשלוח / נשלחה / מחכים לכסף / נגמר") holds here too. A stage the user can't explain in one sentence is a failure.
- **Stages that are judgments.** A stage must be derived from a fact in the data, so the same claim always sits in the same place. "להכנת טופס" was rejected by the user as unclear for exactly this reason — it mixed *where* with *what to do*.
- **Stages that jump backwards.** A claim does not move back to "אצל הלקוח" because a document is missing. Who-is-blocking-now lives in the next-step line, not in the stage.
- **Losing anything the two current views do** (see the parity table, §7).

## The two axes

| Axis | Question | Shown as | Derived from |
|---|---|---|---|
| **Stage** | Where is the claim on its timeline? | Stage badge + stage filter chips | Collection status + `effectiveHandling` (pure, forward-only) |
| **Needs you** | Does the פקידה have something to do on it now? | Red dot on the row + "צריך אותך" chip | Existing `needs_action` (+ two handling states, §3) |

They are independent: any stage can have a red dot.

## 1. Stages (decided with the user)

Pure function, new module `web/src/lib/dashboard/stage.ts`:

| Key | Hebrew label (chip + badge) | Rule (first match wins) |
|---|---|---|
| `closed` | סגורים | `status ∈ {closed, abandoned}` **or** `effectiveHandling = paid` |
| `sent` | נשלח למבטחת | `effectiveHandling ∈ {sent, docs_requested, rejected, appeal, legal}` |
| `awaiting_payment` | ממתין לתשלום | `effectiveHandling ∈ {approved_awaiting_payment, partial_paid}` |
| `with_client` | אצל הלקוח | `submitted_at` is null |
| `before_send` | לפני שליחה למבטחת | otherwise (submitted, no handling status) |

- **Handling status outranks `submitted_at`** *(my call, from the builder check)*: neither the handling route nor the checklist route requires a client submission, so a claim the פקידה completed and sent herself must not sit in "אצל הלקוח".

- **Rejected / appeal / legal are folded into `sent`** — user decision ("for now"), because they're rare in the pilot and a near-always-zero chip is noise. The next-step line already says "נדחתה — לטפל בערעור" etc. (`handlingLine`). Splitting them out later is a one-line change to this table.
- **`paid` → `closed`** *(my call)*: per the 2026-10-21 spec, `paid` ticks `payment_received` and the engine closes the claim, so this only matters for a transient or legacy row; showing a paid claim under "נשלח" would be a lie.
- **Missing documents after submit stay in `before_send`** (user asked; answer agreed): the row's next-step line reads "מחכים ל… מהלקוח · …" and carries a red dot. The stage does not regress.
- `effectiveHandling` is the existing helper (`lib/handling/effective.ts`) — reuse, don't re-derive.
- All five labels live in `lib/dashboard/copy.ts` per the copy-module convention.

## 2. Page layout

Top to bottom, single column, `max-w-5xl` as today:

1. Header row — "תביעות" + `NewClaimForm` (unchanged). The greeting line ("בוקר טוב, X 👋 · date") stays as a small subtitle *(my call — it's cheap and the pilot liked it)*.
2. **Search box** — placeholder "חיפוש לפי שם, טלפון או לוחית רישוי…".
3. **Chip row** — `הכל · N` · `● צריך אותך · N` · `אצל הלקוח · N` · `לפני שליחה למבטחת · N` · `נשלח למבטחת · N` · `ממתין לתשלום · N` · `סגורים`. Single-select. "הכל" = all non-closed. "צריך אותך" is styled red. "סגורים" shows no count *(my call — it only grows and the number means nothing)*.
4. **Table** — columns below.
5. **Pager** — existing `Pager` / `paginate`, one page param `p`, 25 rows *(my call: reuse the table's current size)*.

### Columns

| Column | Content |
|---|---|
| לקוח | Red dot if needs-you · ⚑ if `urgent` · name (or "ללא שם") · fresh badge ("חדש" / "מסמך חדש", existing `fresh`) · second line, small grey: phone · client plate |
| שלב | Stage badge (one colour per stage) · second line, small grey: track label (`TRACK_LABEL`) |
| הצעד הבא | `action_line` (colour: red when the row has a `send` item, amber when `needs_action`, grey otherwise — same tone rule as today's cards) · optional `also_line` (small, amber) · optional `ai_line` (small, grey) |
| פעילות אחרונה | Relative: "היום" / "אתמול" / "לפני N ימים", from `activity_at` *(my call: header says activity because that's the sort key; the mockup's "פתוח" was a placeholder)* |
| (last, narrow) | Copy-client-link icon button (existing `CopyLinkButton` behaviour) on every non-closed row *(my call: it's the one action the list keeps — the cockpit has no copy button, and `/c/[token]` keeps accepting uploads after submit until the claim closes, so the link stays useful in every open stage)* |

**The whole row is the link** to `/dashboard/[id]` (not just the name). The copy button stops propagation.

Closed rows render greyed (as `ClaimsTable` does today).

### Mobile (< `md`)

No horizontal scroll. Each row collapses to two lines: **name + dot + stage badge** / **next-step line**. Phone, plate, track, activity and the copy button hide. Chips scroll horizontally in their own row (that's the one allowed horizontal scroller).

## 3. "Needs you"

`needs_action` as computed today (`send || doToday || unclassified`), **plus** `effectiveHandling ∈ {docs_requested, rejected}` *(my call — the user asked that rejected claims folded into "sent" keep a red dot; `docs_requested` is the same kind of ball-in-our-court state. `appeal` and `legal` are waiting on someone else and get a dot only via an overdue task, which `doToday` already covers)*. Closed claims never carry a dot *(my call)*.

**Meaning of the dot: "there is something to do today", not "something is incomplete"**. See the section on missing documents below.

**`activity_at`** gains `handling_status_changed_at` as a fourth input *(my call — otherwise a claim the insurer approved yesterday reads "לפני 40 ימים" and sinks; a handling change is activity on the claim)*.

**Order:** everywhere, by `activity_at` descending (today's intake-first rule from pilot feedback). Under the "צריך אותך" chip only, order by `overdue_days` descending, then `activity_at` *(my call — when she has explicitly asked "what needs me", most-late first is the useful order)*.

## 4. Search

- One text box; matches if **any** of: client name contains the query (as today), digits-only phone contains digits-only query, digits-only client plate contains digits-only query, digits-only third-party plate contains digits-only query. Digit-normalising makes `12-345-67`, `1234567` and `12 345 67` equivalent. A digit match requires ≥ 3 query digits *(my call — avoids "1" matching everything)*.
- **Scope:** search applies within the selected chip, **except** under "הכל", where it also matches closed claims (greyed) — a client calling about last month's claim must be findable without knowing to tick "סגורים" *(my call)*.
- **Chip counts reflect the current search** *(my call — tells her which stage the match is in)*.
- The query is **not** put in the URL (it's PII — names/phones would land in history and logs). Stage chip and page **are** in the URL (`?stage=…&p=…`) so Back from a claim returns to the same filtered view.
- Client-side filtering over the already-loaded book, as today. No server search in this phase.

### Where the plates come from (no migration)

- **Client plate:** `summary_json.collected.vehicle.plate`, written at submit (`api/claims/submit/route.ts`). Select it with a JSON path in the existing claims query, e.g. `client_plate:summary_json->collected->vehicle->>plate` — the page already pulls `draft:summary_json->draft` the same way. Absent before submit; that's fine (`with_client` claims match by name/phone).
- **Third-party plates:** `third_parties.plate`, one row per vehicle (multi-TP shipped in #91). One extra RLS-scoped query `select claim_id, plate from third_parties`, grouped into `Map<claim_id, string[]>`, same pattern as the existing `docRows` query.

## 5. Data flow / code shape

- `page.tsx`: one claims query (adds `client_plate`), the existing tasks + documents queries, plus the third-parties query. Pass **all** claims (open and closed) to compose.
- `compose.ts`: produces **one** `rows: ClaimRow[]` for every claim, each carrying the existing card fields plus `stage`, `needs_action` (extended per §3), `phone`, `client_plate`, `tp_plates`, `urgent`, `closed`, `access_token`. Closed claims get an `action_line` from `handlingLine` when handling is set, else "התיק נסגר" *(my call — they don't need the full next-step machinery)*.
- **Remove** `attention` / `waiting` / `ok` and the brief-sectioned render path. The brief flag (off by default) keeps only its `ai_line` contribution. `getOrCreateBrief` / `BriefAutoRefresh` wiring stays as is.
- New client component (e.g. `ClaimsList.tsx`) owns search, chip, and paging state. `TodayList.tsx` and `ClaimsTable.tsx` are deleted. `Pager` / `useUrlPage` / `paginate` reused.
- Pure helpers (`stage.ts`, a `matchesQuery`/`normalizeDigits` helper, the chip-count function) live in `lib/dashboard/` with Vitest coverage.

## 6. Reminder parity — the cockpit gets the queue's send/skip

The list's "📤 שלח תזכורת" / "לא היום" (`SendButtons`) move into the cockpit. Parity does **not** exist today (verified by the builder check): the outbound queue sends **four** kinds of item (`SEND_RULES` in `lib/outbound/rules.ts`: `chase_missing_docs`, `get_tp_insurer`, `collect_private_report_docs`, `finish_wizard`), while `CockpitHeader`'s own chase builds a different message from blocking labels only, logs without `task_id`, ignores the cooldown and the one-per-day cap, and has no skip.

Decision *(my call — flag in the PR)*: **one chase control in the cockpit header, not two.**
- When the queue has a `SendItem` for this claim, the header's chase **is** that item: same body, `task_id`, `task_key`, send + "לא היום" skip, same `postEvent` contract (keep the synchronous `window.open` trap comment).
- When it doesn't (cooldown, cap, not yet due), the existing ad-hoc chase stays available as a secondary "שלח בכל זאת" action, so the פקידה can always ask the client — but the queue's own path is the default and is what feeds suppression.
- `loadQueue` loads the whole book by agent; add a per-claim variant (or filter) for the cockpit — builder's choice.

## 7. Parity table (nothing is lost)

| Today | Where it goes |
|---|---|
| Card next-action / also / AI lines, tone colours | הצעד הבא column |
| Fresh badges (חדש / מסמך חדש) | Next to the name |
| Send / skip buttons | Cockpit (§6) |
| "פתח את התיק ←" | Whole row is the link |
| Table search (name, phone) | Search box (+ plates) |
| Phone | לקוח column, second line |
| Track (סוג) | שלב column, second line |
| "מול המבטחת" column | The stage + next-step line |
| Date column | פעילות אחרונה |
| Copy link | Icon on `with_client` rows |
| ⚑ urgent | Next to the name |
| "כולל סגורים" checkbox | "סגורים" chip + search under "הכל" |
| Empty state ("צור את התביעה הראשונה שלך") | Kept, when the book is empty |
| Two pagers (`p`, `tp`) | One pager (`p`) |

## Empty and edge states

- Book empty → existing first-claim CTA, no chips, no search.
- Chip with no rows → "אין תיקים בשלב הזה".
- "צריך אותך" with no rows → `ALL_DONE_NOTE` ("הכל טופל להיום ✅").
- Search with no match → "לא נמצאו תוצאות" (existing string).
- Unknown/invalid `?stage=` → treat as "הכל".

## Constraints

- Next.js 16 — read `web/node_modules/next/dist/docs/` before route/component work (`searchParams` is a Promise here, as `page.tsx` already handles).
- Hebrew UI strings via `lib/dashboard/copy.ts`; English identifiers; RTL.
- Branch + PR from a worktree; never commit to `main`.
- Done = `tsc` + `npm run build` + Vitest green, output pasted.
- No migration. (If the builder finds one is needed, that's a stop-and-ask.)

## Missing documents and the red dot (decided by the user)

**The dot appears only when a reminder is due.** A submitted claim with missing documents gets a dot and a "מחכים ל… מהלקוח" line while the queue has a `SendItem` for it. It has neither in the first 3 days after submit (`DUE_OFFSETS.chase_missing_docs`) or in the 3-day cooldown after a send or skip. After 3 unanswered sends it becomes a phone-call task, which carries the dot via `doToday`. Between those points the line falls back to "במעקב: …". No logic change, and no checklist computation on the dashboard. The alternative, a dot for as long as anything is missing, was rejected: it would stay on right after a reminder went out, and the dot would stop meaning "something to do today".

## Left to the builder

- Exact badge colours per stage and chip styling (keep the zinc/red/amber palette already on the page).
- Component split inside `ClaimsList`.
- Whether `ClaimRow` extends or replaces `ClaimCard` in `compose.ts`.
- Test shape — but stage derivation, search normalisation, needs-you extension, and chip counts must be unit-tested; compose tests updated for the removed sections.

## Acceptance

- The landing page shows each claim exactly once.
- Each of the five chips filters correctly; counts match the rows shown; counts follow the search.
- Searching `1234567` finds a claim whose client plate is `12-345-67`, and one whose second third-party vehicle has that plate.
- A submitted claim with missing documents sits under "לפני שליחה למבטחת"; while a reminder is due it has a red dot and its next-step line names the missing documents.
- A rejected claim appears under "נשלח למבטחת" with a red dot.
- Opening a claim from a filtered view and pressing Back returns to the same chip and page.
- From the cockpit of a claim with a pending reminder, the פקידה can send that exact reminder and skip it.
- At 375px width: no horizontal page scroll; rows are two lines.
