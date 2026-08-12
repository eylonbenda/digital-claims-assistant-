# Claim Cockpit — Claim Detail Page Redesign — Design

**Date:** 2026-08-12
**Status:** approved in visual brainstorm (mockups in `.superpowers/brainstorm/355-1786557321/content/`, git-ignored), pending spec review
**Builds on:** the dashboard redesign (spec 2026-08-11, PR #43) — same philosophy applied to the claim detail page (`/dashboard/[id]`): a **presentation-layer recomposition**. No engine, queue, task, checklist, or classification logic changes; no schema or API changes.

## 1. Problem

The claim detail page stacks nine surfaces at once — hero, readiness strip, classification, tasks, checklist, form generation, notes, agent upload, form-field editor, documents grid — in every lifecycle phase. The pain is uniform: whatever the agent came to do, the other eight surfaces are noise. There is no narrative ("what needs me here?") and no calm glance state. The dashboard redesign fixed this for the list; this spec fixes it for the single claim.

## 2. The chosen shape (visual brainstorm, 2026-08-12)

| Question | Decision |
|---|---|
| Overall structure | **A — tabbed case file**: persistent cockpit header + 4 tabs (B "תורך-list + rail" and C "summary + drawers" rejected) |
| Tab grouping | **4 tabs**: סקירה / עבודה על התיק / טופס ההודעה / קבצים (merging עבודה+טופס rejected) |
| Default tab | **Always סקירה** — predictable; the header CTA routes to the right tab, and dashboard cards may deep-link via `?tab=` |
| Phase-awareness (shape-shifting page) | **Rejected for now** — no pilot signal yet; the next-action precedence (§3) captures most of its value. Revisit after pilot |
| Surfaces removed | **None** — every existing surface survives, regrouped |

## 3. Cockpit header (always visible)

Replaces the current hero section *and* `ReadinessStrip`:

- **Identity row:** client name, phone, ⚑ דחוף flag, status pill, days open · last-activity age (amber when stale ≥ 4 days, as today).
- **🤖 story line:** `analysis.summary` from the cached AI analysis. Null analysis → the line is omitted; everything else on the page is deterministic and unaffected.
- **Primary next-action row:** one action in human language plus its buttons. Precedence, evaluated top-down, first match wins:
  1. Classification unconfirmed / needs agent choice → "אשר את סיווג המסלול" (routes to סקירה, opens the confirm panel)
  2. Blocking client-suppliable docs missing → chase action (💬 WhatsApp reminder + 📞), **identical send semantics to today's ReadinessStrip** — same message body, same `window.open` flow, same instrumentation
  3. Overdue or nearest open task → "תורך: [כותרת]" (routes to עבודה)
  4. Missing form fields → "השלם N שדות חסרים" (routes to טופס)
  5. Everything ready → download/submit the generated form (routes to טופס)
- CTA behavior: switches to the target tab client-side and scrolls to the relevant item. No second button row — one primary action, one optional secondary (📞 / "פתח").

Copy strings live in the language layer (§6) — the header never shows task keys or raw system vocabulary.

## 4. Tabs

Badges are derived from data already loaded by the page; red = needs the agent, gray = informational count.

| Tab | Contents (existing components, reused untouched unless noted) | Badge |
|---|---|---|
| **סקירה** (default) | Snapshot list: track + ✓ confirm state, client insurer, readiness ("X מתוך Y פריטים · חסרים: …"), last activity. `ClaimTypeConfirm` — auto-expanded when classification needs attention, else a collapsed one-liner (as today). `NotesPanel` | red dot when classification needs attention |
| **עבודה על התיק** | `TasksPanel`, `ChecklistPanel`, `AgentDocUpload` | red: open tasks + blocking missing docs |
| **טופס ההודעה** | Generated-forms list, `FormFieldEditor` (**open by default** — the `<details>` collapse is dropped now that it has its own tab), `FormGenerator` | red: missing form fields count |
| **קבצים** | `ClaimDocuments` grid | gray: document count |

Deep-linking: `?tab=overview|work|form|files` (absent/invalid → overview). Dashboard cards whose action is tab-specific (e.g. "פתח את התיק ←" for a form task) may append the parameter; no dashboard changes are required by this spec — it's an affordance.

## 5. Architecture

| Piece | Role |
|---|---|
| `web/src/lib/cockpit/derive.ts` | **New, pure, unit-tested.** `(checklistItems, tasks, classification+confirmed, formMissing, analysis?) → { nextAction, badges }` — the precedence in §3 and badge math in §4. No I/O, no clock reads (caller passes `now`) |
| `web/src/lib/cockpit/copy.ts` | **New, pure.** Language layer for the header + badges, following `lib/dashboard/copy.ts` idiom. Reuses/extends dashboard copy where the vocabulary overlaps (chase lines, "תורך: …") rather than duplicating |
| `web/src/app/dashboard/[id]/CockpitTabs.tsx` | **New client component.** Receives the four panes as `ReactNode` props from the server page — all panes are server-rendered once; tab switching is show/hide (CSS), no navigation, no refetch. Syncs `?tab=` via `history.replaceState`. Renders the tab bar + badges |
| `web/src/app/dashboard/[id]/CockpitHeader.tsx` | **New client component.** Identity + story + next-action row; owns the chase-send handler moved from `ReadinessStrip.tsx`, and the "switch tab + scroll" CTA behavior (via a small context or callback from `CockpitTabs`) |
| `web/src/app/dashboard/[id]/page.tsx` | Slims to data loading + derivation calls + composition: header, `CockpitTabs` with four panes |
| Removed | `ReadinessStrip.tsx` (absorbed into `CockpitHeader`) |

All Supabase queries, RLS posture, signed-URL minting, checklist computation, classification, and analysis caching stay exactly as they are.

**Failure contract:** as today — analysis is best-effort (null → no story line, precedence rule 1 falls through on deterministic signals only); everything else is deterministic. A derivation error must not blank the page: `derive.ts` is pure and total over its inputs.

## 6. Language layer

The header speaks agent Hebrew, never system vocabulary. Examples (final strings live in `copy.ts`):

- Chase: "מחכים ל[תמונות נזק ורישיון נהיגה] מהלקוח/ה" + last-reminder age where available
- Task: "תורך: [כותרת המשימה]" (+ "באיחור N ימים" when overdue)
- Classification: "התיק מחכה לאישור מסלול"
- Form: "נותרו N שדות חסרים בטופס" / "הטופס מוכן להורדה — [מבטח]"

## 7. Testing

- Unit tests for `derive.ts`: precedence order (each rule wins when it should), badge math, null-analysis degradation, empty-claim edge (no tasks, no checklist → sensible fallback action = chase or form per data).
- Unit tests for `copy.ts` string mapping where non-trivial.
- Existing `checklist.test.ts` and dashboard tests untouched.
- No E2E; manual verification in the dev server (RTL, tab switching, deep-link param).

## 8. Out of scope

Engine/queue/task/checklist logic changes · new data capture · mobile-specific layout (tabs wrap; fine for now) · phase-aware shape-shifting · guided mode · dashboard changes (deep-link param is optional, additive).
