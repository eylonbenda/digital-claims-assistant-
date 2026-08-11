# Outbound Queue — Phase-2 Step C v1 (C1) — Design

**Date:** 2026-08-09
**Status:** approved in brainstorm, pending spec review
**Supersedes:** nothing — step C was never previously specced. Context: `docs/mvp-scope.md` phase-2 list, task-engine spec §8 ("no auto-sends (C)"), morning-brief spec (2026-07-23).

## 1. What this is

The first slice of "automated outbound": a **two-lane approval queue** on `/dashboard`. The system computes, each morning, exactly which chase messages are due and drops them in front of the agent as one-tap `wa.me` sends. Nothing leaves the building without a human tap in C1 — but every tap and skip is recorded, and the design's central seam makes flipping an individual task type to automatic a config change, not a rewrite.

**Decisions taken in the brainstorm (2026-08-06 → 09):**

| Question | Decision |
|---|---|
| Trust gradient | **(a) approval queue**, built so task types can flip to auto later |
| Queue unit | **(b) two lanes** — client messages ("לשלוח") + agent actions ("לטפל") |
| Persistence | **event log** (`outbound_events`), queue derived on read — no materialized proposals |
| Authorship | **deterministic templates only** — no LLM in the send loop |
| Channel | **`wa.me` from the agent's own WhatsApp** — no BSP, no per-message cost |
| Scheduler | **none in C1** — queue computed on dashboard read; cron arrives with auto-send |

**Why this shape:** the task engine already dates every chase (`DUE_OFFSETS`), and `wa.ts` (`chaseMessage`/`chaseHref`) already composes the exact text. C1 is "stop requiring the agent to *find* the click" — and, critically, it instruments every send decision so the auto-flip later is a measured call, not a leap (see §8).

## 2. Scope: which rules, which lanes

Of the 12 rules in `web/src/lib/tasks/templates.ts`, only 3 are client-directed messages we can compose and send today. 4 are agent-does-a-thing (portal/email submission, milestone work). The rest chase third parties for whom **no contact fields exist in the schema at all** — out of scope (§7).

**Lane 1 — "לשלוח היום" (send; writes events):**

| Task key | Message |
|---|---|
| `chase_missing_docs` | existing `chaseMessage` (blocking-doc labels + upload link) |
| `get_tp_insurer` | new builder — ask the client for the at-fault driver's insurer |
| `collect_private_report_docs` | new builder — ask for the still-missing **mandatory** private-report docs (קבלה על תשלום, אישור אי-הגשה). Optional items (עבר ביטוחי, `mandatory: false` in the checklist) are deliberately not auto-chased — the checklist's domain model governs message content. |

**Lane 2 — "לטפל היום" (do; derived, nothing sent):** every other open template task with `due_at <= today` — e.g. `open_claim_with_insurer`, `follow_up_insurer`, `submit_to_tp_insurer` — shown with the overdue clock, linking into the claim cockpit. Plus the escalation rows from §5.

## 3. Data model — migration `008`

Append-only event log. **Only what happened is persisted** (sends, skips); what is *proposable* is derived on every read from `tasks` + checklist state, and is therefore never stale by construction. No proposal state machine, no expiry, no race-prone partial-unique dance.

```sql
create table outbound_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  task_key text not null,
  recipient_kind text not null default 'client',
  channel text not null default 'whatsapp',
  kind text not null,                          -- 'sent' | 'skipped'
  body_snapshot text,                          -- what actually went out (kind='sent')
  actor text not null default 'agent',         -- 'agent' | 'system'
  created_at timestamptz not null default now()
);
create index outbound_events_cooldown_idx
  on outbound_events (claim_id, task_key, created_at desc);
```

- **RLS mirrors `agent_briefs`:** agent reads own rows via `claim_belongs_to_me`; writes are service-role only (through the API route).
- **`kind='sent'` means "the agent tapped the link," not "delivered."** `wa.me` reports nothing back; the agent can abandon the composer. A tap is adequate evidence of intent for cooldown purposes. This proxy must be stated in a schema comment — the auto-flip (C2) is exactly where `sent` has to become a real delivery record (BSP receipts).
- **`body_snapshot`** is the audit copy of what was actually sent. It is never a source of truth for what *will* be sent — that is always rendered live.
- ⚠️ Migrations are manual, two-place: dev SQL editor while building, prod (`claims-pilot`) SQL editor before merge. Also fold into `web/db/schema.sql` (fresh-install snapshot), declared **before** the grants block.

## 4. Module layout — `web/src/lib/outbound/`

Pure core + one I/O wrapper, mirroring `web/src/lib/brief/`:

| File | Purpose |
|---|---|
| `rules.ts` | Per-task-key descriptor: `lane` (`send`/`do`), `recipientKind`, `channel`, `cooldownDays`, `auto: boolean` (always `false` in C1 — **the flip-to-auto seam**), body builder reference. The builders themselves live in `wa.ts` beside `chaseMessage`. |
| `queue.ts` | Pure. `buildQueue(tasks, checklists, events, now) → { send: [], do: [] }`. Eligibility, cooldown, per-claim daily cap, give-up escalation — all decided here, no DB in sight. |
| `load.ts` | The only I/O. Reads open tasks + recent events + checklist inputs, calls `buildQueue`, returns the queue. **Best-effort: returns `null` on any failure** so the dashboard still renders (the `getOrCreateBrief` contract, for the same reason). |

**Flip-to-auto is two one-line changes:** `auto: true` on a rule descriptor, and a cron sender that writes the same `outbound_events` rows with `actor='system'`. The cooldown logic in `queue.ts` governs both actors without modification.

## 5. Cadence & guards

Per-rule cooldowns (a `skipped` event suppresses exactly like a `sent` one — one code path; "not today" means not-for-the-cooldown):

| Rule | Due offset | Cooldown | Rationale |
|---|---|---|---|
| `chase_missing_docs` | 3d | **3d** | matches the task's own re-surface cadence |
| `get_tp_insurer` | 2d | **3d** | time-sensitive, but the client often must phone someone to answer |
| `collect_private_report_docs` | 5d | **4d** | effortful docs; faster chasing just annoys |

Two guards above the per-rule level:

1. **One message per claim per day, globally.** Two due rules on one claim would otherwise send the client two WhatsApps back to back. Highest-priority rule takes the day's slot; the other waits. (The C-note's "don't chase twice in 24h" requirement, placed above the rules rather than inside each.)
2. **Give up after 3.** Count `sent` events per `(claim, task_key)` **since the claim's last document upload**. At 3 with nothing arriving: stop proposing, emit a lane-2 escalation row instead — **"הלקוח לא מגיב על X חסרים — ליצור קשר טלפוני"**. The correct fourth touch is a phone call, and the system says so.

**Stop conditions are free:** the queue proposes only against `status='todo'` tasks; the engine's existing `completeWhen` closes them when the doc lands, and the item drops out of the next read on its own. No new completion logic anywhere in C1.

## 6. Surface & flow

**Relationship to the morning brief — the line that prevents a duplicate surface:** the brief is **per-claim triage** (which claims matter, including ones with nothing due); the queue is **per-task dispatch** (what leaves the building today). For that line to hold, the action moves: **`MorningBrief.tsx` loses its inline chase button; the queue is the only place anything is sent.** In exchange, the brief's `tier` + Hebrew `reason` flow into the queue — `act_now` rows sort first, each row shows the reason beside the message. (The `do` lane is *not* the deleted `FollowupsPanel` returning: that was a read-only mirror of the tasks list; this is one lane of an instrumented dispatch surface with escalations.)

**Panel:** `OutboundQueue.tsx` on `/dashboard`, **above** the brief (actionable-first; amended 2026-08-11 after the first render showed payload duplication), two lanes. Division of labor with the brief, sharpened at the same time: the queue owns *tasks* (the brief's next-task line was removed — triage keeps to who + why), the brief owns *reasons* (the queue shows tier as a colored dot with the reason as hover title, not repeated text); the brief's passive tiers (waiting/ok) start collapsed:

- Lane-1 row: client name · track · overdue badge · brief tier/reason · rendered message preview · **[שלח בוואטסאפ]** **[דלג]**.
- Lane-2 row: claim · task title · overdue badge → links to `/dashboard/[id]`. **No "בוצע" button** — template tasks are engine-owned (`completeWhen` on milestones/docs); a manual complete here would desync status from reality or be overwritten by the next `runEngine` pass. Milestone controls in the cockpit remain the single completion path.

**Send mechanics (trap):** the click handler calls `window.open(chaseHref)` **synchronously**, then fires the event POST after. Any `await` before `window.open` and the popup blocker eats the send. A failed event write merely costs a re-proposal tomorrow (absorbed by cooldown); a blocked window costs the agent the send. Skip = event POST only.

**API:** `POST /api/outbound/events` — `{ claim_id, task_key, kind, body }`; verifies claim ownership like the other claim routes; inserts via service client. Rejects unknown `task_key` (must exist in `rules.ts`) and unknown `kind`.

**Empty state:** both lanes empty → panel hides entirely. **Failure:** `load.ts` → `null` → panel doesn't render; dashboard/brief/list unaffected.

## 7. Non-goals (C1) — with the trigger that pulls each into C2

| Deferred | Pulled in when |
|---|---|
| Cron + auto-send | a rule's skip rate proves out (§8) |
| WhatsApp Business API / BSP | auto-send lands — `wa.me` cannot send unattended |
| Garage/appraiser/insurer contact capture + email channel | the design partner names which third party they most hate chasing |
| AI-drafted messages | C2's non-client recipients, where tone actually varies |
| Delivery receipts | BSP provides them; until then `sent` = tap |
| Quiet hours / Shabbat + חג suppression | **auto-send — mandatory then, meaningless now**: the agent's finger is the quiet-hours policy in C1 |
| Regulatory/consent work beyond the wizard's existing data-consent declaration | something sends without a human — C1's sender is still the agent, from their own number, to a consented client |

## 8. What the pilot run must produce

`outbound_events` is an instrumented record of every chase decision. After a few weeks with the design partner it answers:

- **Which rules actually fire** — dead rules in `templates.ts` get deleted, not automated.
- **Time-to-document after a chase** vs. unchased claims — the number that says whether any of this works.
- **Skip rate per rule — the empirical gate for `auto: true`.** A rule sent 40× and skipped 2× has 95% agent agreement; flipping it is a measured decision with a real denominator. A rule skipped 30% of the time has *wrong timing*, and automating it would ship that error at machine speed.

The queue is not a stepping stone to auto-send; it is the instrument that determines which messages have earned it.

## 9. Testing

- `queue.test.ts` (pure): cooldown suppression; skip-suppresses-like-send; per-claim daily cap picks highest priority; give-up-after-3 emits the escalation row and resets on doc upload; lane split; tier ordering; completed task drops out.
- `rules.test.ts` (pure): the three Hebrew builders (existing `chaseMessage` behaviour already covered by `wa.test.ts`).
- `load.ts` I/O stays untested, matching how `brief/` is tested today.

## 10. Files touched (summary)

| Path | Change |
|---|---|
| `web/db/migrations/008_outbound_events.sql` | new table + RLS + index |
| `web/db/schema.sql` | fold in `008` (fresh-install snapshot) |
| `web/src/lib/outbound/{rules,queue,load}.ts` | new module |
| `web/src/lib/wa.ts` | two new builders (`getTpInsurerMessage`, `collectPrivateReportMessage`) beside `chaseMessage` — `rules.ts` only maps keys to builders |
| `web/src/app/api/outbound/events/route.ts` | new POST route |
| `web/src/app/dashboard/OutboundQueue.tsx` | new panel |
| `web/src/app/dashboard/page.tsx` | mount panel; pass brief tiers |
| `web/src/app/dashboard/MorningBrief.tsx` | remove inline chase button |
