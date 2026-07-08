# Task Engine — Design Spec (Phase-2 Step A)

> Status: **approved design, pre-implementation** · Date: 2026-07-08
> First step of the phase-2 automation theme: **A · task engine** → then B · agentic claim manager → C · automated outbound → D · TP deliverables.
> Scope decision: **track & surface only** — the engine generates, dates, transitions, and surfaces tasks. It sends nothing (C) and ranks/drafts nothing (B). SLA-clock fields (`sla_clock_started_at` / `decision_due_at`) are **deferred** pending verification of the legal citations in `regulatory-clock.md`.

---

## 1. Context & decisions locked

The MVP checklist (`web/src/lib/claims/checklist.ts`) is a **derived view**: doc/form items auto-resolve from `claim_documents` / `generated_forms`, milestones are manual boolean ticks in `claims.checklist_state`. The `tasks` table exists in `web/db/schema.sql` (with `task_status` enum + RLS) but **no code touches it** — dormant DDL.

| Decision | Choice | Why |
|---|---|---|
| Task model | **Hybrid** — doc/form items stay derived (never stored as tasks, no drift); milestones + new dated *action-tasks* become persisted `tasks` rows | Natural extension of the existing "derived + stored ticks" grain; no migration of existing claims |
| Generation | **Reactive spawn** — events (track confirm, milestone tick, doc upload) spawn the next task(s) with relative due dates | Due dates anchored to real events, not guesses; the model B/C extend |
| Scheduler | **None** — engine runs inline in existing mutation routes; "overdue" computed at read time | No cron infra needed until C |
| Scope | Track & surface only | Keeps the spec validation-sized |

## 2. Data model — migration `006_tasks_engine.sql`

Extend the existing `tasks` table:

```sql
alter table tasks
  add column key text,                                  -- stable template identifier, e.g. 'chase_appraiser'
  add column source text not null default 'template',   -- 'template' | 'manual'
  add column note text,
  add column completed_at timestamptz;
create index tasks_claim_status_due_idx on tasks (claim_id, status, due_at);
create unique index tasks_claim_key_open_uniq on tasks (claim_id, key)
  where key is not null and status <> 'done';
```

- `key` is the idempotency anchor: at most one **open** template task per (claim, key), enforced by the partial unique index. A `done` task frees the key, allowing a justified re-spawn (see §10). Manual tasks have `key = null`.
- Existing columns reused as-is: `title`, `track`, `status` (`todo/in_progress/blocked/done`), `due_at`, `assignee` (free text).
- RLS already covers `tasks` via `claim_belongs_to_me` — no policy changes.

## 3. Task templates + spawn rules — `web/src/lib/tasks/templates.ts`

Declarative, same style as `checklist.ts`. Each rule: **trigger → task(s) with relative due offset**, plus optional **auto-complete** matchers (a doc upload or milestone that closes an open task).

### Triggers
- `track_confirmed` (agent confirms via `PATCH /classify`)
- `milestone_ticked:<key>` (via `PATCH /checklist`)
- `doc_uploaded:<docType>` (via `POST /documents`, client or agent)
- `claim_submitted` (client finishes the wizard)

### Initial rule set (due-date offsets are field assumptions — tune with the design partner)

**All tracks**
| Trigger | Task (`key`) | Title | Due | Auto-completed by |
|---|---|---|---|---|
| `claim_submitted` with blocking docs missing | `chase_missing_docs` | להשלים מסמכים חסרים מהלקוח | +3d | all blocking base docs present |

**`own_policy`**
| Trigger | Task | Title | Due | Auto-completed by |
|---|---|---|---|---|
| `track_confirmed` | `open_claim_with_insurer` | פתיחת תביעה מול מבטח הלקוח | +2d | milestone `submitted_to_insurer` |
| milestone `car_at_garage` | `chase_appraiser` | לוודא תיאום שמאי / דוח שמאי | +3d | doc `appraiser_report` |
| milestone `submitted_to_insurer` | `follow_up_insurer` | מעקב תשובת מבטח | +14d | milestone `payment_received` |

**`third_party_report`**
| Trigger | Task | Title | Due | Auto-completed by |
|---|---|---|---|---|
| `track_confirmed`, `at_fault_insurer` empty | `get_tp_insurer` | להשיג פרטי מבטח צד ג' | +2d | `at_fault_insurer` set |
| milestone `car_at_garage` | `chase_appraiser` | לוודא דוח שמאי | +3d | doc `appraiser_report` |
| doc `garage_invoice` | `collect_private_report_docs` | לאסוף מסמכי "דוח פרטי" (קבלה, אישור אי-הגשה, עבר ביטוחי) | +5d | all blocking late docs present |
| all blocking docs present | `submit_to_tp_insurer` | להגיש למבטח צד ג' | +2d | milestone `submitted_to_tp_insurer` |
| milestone `submitted_to_tp_insurer` | `follow_up_tp_insurer` | מעקב אישור / דחייה / השלמות | +14d | milestone `payment_received` |

**`third_party_settlement`**
| Trigger | Task | Title | Due | Auto-completed by |
|---|---|---|---|---|
| `track_confirmed` | `request_settlement_approval` | לשלוח בקשת אישור הסדר למבטח צד ג' | +2d | milestone `approval_requested` |
| milestone `approval_requested` | `follow_up_approval` | מעקב אישור מסלול הסדר | +5d | milestone `route_approved` |
| milestone `route_approved` | `schedule_garage` | לתאם כניסה למוסך הסדר | +3d | milestone `car_at_garage` |
| milestone `car_at_garage` | `follow_up_repair` | מעקב סיום תיקון | +7d | milestone `payment_received` |

Due offsets live in one exported constants block (`DUE_OFFSETS`) for easy tuning.

## 4. Engine — `web/src/lib/tasks/engine.ts`

Pure function:

```ts
advanceTasks(input: {
  claim: ClaimRow;                 // incl. claim_type, status, flags, at_fault_insurer
  event: EngineEvent;              // the trigger that just happened
  checklist: ComputedItem[];       // from computeChecklist — blocking-state source
  openTasks: TaskRow[];            // existing tasks for the claim
}): { spawn: NewTask[]; complete: string[] /* task ids */; statusAdvance?: ClaimStatus }
```

- **Idempotent**: a spawn is skipped if a non-`done` task with the same `key` already exists for the claim. Replayed events are no-ops. (A `done` task frees the key — deliberate, see §10.)
- **Auto-complete**: after each event, open template tasks whose completion condition now holds are marked `done` (+ `completed_at`).
- Runs **inline** in the four existing mutation routes (`PATCH classify`, `PATCH checklist`, `POST documents` ×2, submit). The route applies the returned mutations in the same request and logs a `claim_events` row per spawn/complete/advance.
- **Overdue** is not a stored state: computed at read time (`status != 'done' && due_at < now()`).

## 5. Claim status auto-advance

Same engine pass moves `claims.status` **forward only** along
`submitted → classified → form_generated → checklist_active`:
- `classified` — agent confirmed a track
- `form_generated` — a `generated_forms` row exists
- `checklist_active` — any milestone tick or task activity

`closed` remains manual. Agent overrides always win; the engine never moves status backward. Each transition logs a `claim_events` row (`status_advanced`).

## 6. API

| Route | Method | Purpose |
|---|---|---|
| `/api/claims/[id]/tasks` | `POST` | Manual ad-hoc task (`title`, optional `due_at`, `note`) — `source='manual'` |
| `/api/claims/[id]/tasks/[taskId]` | `PATCH` | Status change (`done` / `blocked` / `in_progress` / reopen), edit `due_at`/`note` |

Task list rides on the existing detail-page server fetch — no new GET. Both routes RLS-gated like the existing claim child routes; mutations log `claim_events`.

## 7. UI (hybrid view)

- **Cockpit (`/dashboard/[id]`)** — new `TasksPanel`: open action-tasks sorted by `due_at`, overdue in red, done-collapse; complete/block/add-manual inline. Sits alongside the existing `ChecklistPanel` (docs stay derived there — no duplication: doc items never appear as tasks).
- **ReadinessStrip** — when not blocked on docs, the "advance next milestone" affordance also shows the **next due task**.
- **Dashboard list (`/dashboard`)** — new "משימה הבאה" column (earliest open task + due date), overdue indicator, sortable by due date. This is the proto-worklist B will later rank.

## 8. Out of scope (explicit)

- Automatic outbound messages / reminders / scheduling — **C**
- AI ranking, next-action reasoning, message drafting — **B**
- `sla_clock_started_at` / `decision_due_at` + clock widget — deferred (verify `regulatory-clock.md` citations first)
- Assignees beyond the existing free-text column; multi-agent routing
- Backfill/migration of existing claims' historical state (engine picks up from the next event)

## 9. Testing

`templates.ts` + `engine.ts` are pure — unit tests per rule:
- each trigger spawns the right task(s) with the right relative `due_at`
- idempotency: replaying an event spawns nothing
- auto-complete: uploading the matching doc / ticking the matching milestone closes the open task
- status advance: forward-only, correct event logging, no backward moves
- hybrid boundary: no doc-type item ever materializes as a task

## 10. Open questions (non-blocking)

- Due-date offsets — validate ranges with the design partner (current values are educated guesses from `regulatory-clock.md` §3 field assumptions).
- Whether `chase_missing_docs` should re-spawn if new blocking items appear later (e.g. a circumstance flag flips `theft` on) — initial answer: yes, the unique key is freed once the prior task is `done`; revisit if noisy.
