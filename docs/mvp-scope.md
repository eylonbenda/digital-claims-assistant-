# MVP Scope — What's In, What's Deferred

> Decisions locked 2026-06-17. This is the build blueprint and the source of truth for "what's in the MVP."

---

## Locked decisions
| Topic | Decision | Source |
|---|---|---|
| Client channel | **Manual web-link** (agent sends via WhatsApp) | T2 |
| MVP scope | **Collection + accident-notice form + static per-track checklist.** Active task automation deferred to phase 2 | user decision + domain research |
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
- **Static per-track checklist:** for the chosen track, show required documents/steps + what's missing + the next step. **Document items auto-check** from uploads (at intake, or the agent uploads later docs from the dashboard with a type tag — Option A); a few **action-milestones are manual ticks** (stored in `checklist_state` on the claim). No automation/chasing — that's phase 2. This is where the third-party value lives.
- **Basic dashboard**: claim list + status + claim card (documents, summary, generated form, checklist) + create client link.

## ⏭️ Out of MVP (phase 2+)
- **Active** task workflow: reminders, chasing the garage / appraiser / insurer, status automation.
- WhatsApp Business API (automated channel).
- Document OCR, billing, multi-agency, subrogation track, payment tracking.

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
