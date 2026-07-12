# MVP Scope — What's In, What's Deferred

> Decisions locked 2026-06-17. This is the build blueprint and the source of truth for "what's in the MVP."

---

## Locked decisions
| Topic | Decision | Source |
|---|---|---|
| Client channel | **Manual web-link** (agent sends via WhatsApp) | T2 |
| MVP scope | **Collection + accident-notice form + per-track checklist.** Active task automation was deferred to phase 2, but the **task engine has since been pulled forward** (event-driven spawn/complete + status advance; reminders/notifications still deferred) | user decision + domain research |
| Claim types | **4-way:** `own_policy` / `third_party_report` (דוח פרטי) / `third_party_settlement` (הסדר) / `unknown` | domain research |
| Classification | **AI proposes + agent confirms**; defaults to `unknown` when unsure; revisable | user decision |
| The form | per-insurer, ~80% shared, flat PDF → canonical schema + per-insurer overlay | [form-field-map.md](form-field-map.md) |
| Stack | Next.js + TS + Supabase + Anthropic, Vercel, RTL | [architecture.md](architecture.md) |

---

## MVP flow (end-to-end)
```
report → guided collection → AI summary + missing-info
       → AI proposes claim type (agent confirms; may be "unknown")
       → fill "הודעה על תאונה" form (PDF)
       → static per-track checklist (what's missing + next step)
       → organized case file + basic dashboard
```

---

## ✅ In the MVP
- **Collection web-app** (RTL, mobile-first): consent, injuries triage, collection steps, photo upload, **"מי אשם" (who's at fault)** field (classification input), bank-account field (Clal/כלל form).
- **AI processing** (Claude): structured event summary + missing-info checklist.
- **4-way classification** (label): AI proposes `own_policy` / `third_party_report` / `third_party_settlement` / `unknown`; agent confirms; revisable.
- **Form fill** of the "הודעה על תאונה" form: canonical schema → overlay. Start with 1–2 insurers per the design partner's book.
- **Static per-track checklist:** for the chosen track, show required documents/steps + what's missing + the next step. **Document items auto-check** from uploads (at intake, or the agent uploads later docs from the dashboard with a type tag — Option A); a few **action-milestones are manual ticks** (stored in `checklist_state` on the claim). This is where the third-party value lives. Milestone ticks / doc uploads / submit / classify now also drive the **task engine** (below), which spawns and completes the per-track worklist and advances claim status.
- **Basic dashboard**: claim list + status + claim card (documents, summary, generated form, checklist) + create client link.

## ⏭️ Out of MVP (phase 2+)
- **Active** task workflow — **partly built** (`web/src/lib/tasks/`): the engine spawns/completes per-track tasks and advances status on events. Still deferred: automated reminders/notifications, outbound chasing of the garage / appraiser / insurer.
- WhatsApp Business API (automated channel).
- Document OCR, billing, multi-agency, subrogation track, payment tracking.

## Candidates from 2026-06-29 research (not yet locked — validate before building)

These emerged from the domain research review as high-value and relatively cheap to add.
Pending validation / product decision before committing to MVP scope.

| Candidate | Why it's high value | Build cost | Decision needed |
|---|---|---|---|
| **Regulatory-clock widget** in claim card | Cheapest differentiator: "clock not started — missing X" / "decision due in N days". Fields (`sla_clock_started_at`, `decision_due_at`) are in the data model; constants are fixed. | Low — derived view from checklist blocking state | Does this move to MVP? (Recommended: yes) |
| **Conditional checklist** (per circumstance flags) | Theft/lien/business/activated-policy forks make the checklist accurate instead of generic. New fields on `claims` already specced in `architecture.md`. | Low — config change in checklist engine | Move to MVP as part of step 6? (Recommended: yes, with step 6 build) |
| **Demand letter generation** (`demand_letter` kind) | The TP route's primary deliverable beyond the accident form. Needed for the "organized submission packet" value prop. | Medium — new template engine pass | Is this in MVP or phase 2? |
| **WhatsApp as primary intake channel** | Research recommends WhatsApp-first; agents/clients already work there. Web wizard reusable as link target inside a WA flow. | Medium-High (Meta BSP, approval) | Validate channel preference with agents before deciding |

---

## MVP claim states (subset of [flow.md](flow.md))
```
created → in_progress → submitted → classified (route; may be unknown)
        → form_generated → checklist_active → (handed to agent / closed)
```
Active handling states (`claim_opened`, `in_handling`, `pending_*`, the granular `WAITING_FOR_*` statuses) → phase 2.

---

## Suggested build order
1. **Scaffold** — Next.js + Supabase + Anthropic, RTL, deploy to Vercel.
2. **Data model + agent Auth** + claim creation and personal link.
3. **Collection web-app** — steps + photo upload to Storage.
4. **AI processing** — summary + missing-info + 4-way classification proposal.
5. **Form overlay fill** — first template (הראל/Harel or כלל/Clal) → `generated_forms`.
6. **Static per-track checklist** — config per `claim_type` + presence check against collected docs/fields.
7. **Basic dashboard**.
8. **UX polish** + run with the design partner.

> 💡 Steps 5–6 (form fill + per-track checklist) are the **validation demo** — especially the third-party checklist, which is the sharpest pain.
