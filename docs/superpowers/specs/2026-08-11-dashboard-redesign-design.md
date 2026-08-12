# Dashboard Redesign — "מקשה אחת" — Design

**Date:** 2026-08-11
**Status:** approved in visual brainstorm (mockups in `.superpowers/brainstorm/1880-1786478169/content/`, git-ignored), pending spec review
**Builds on:** the outbound queue (spec 2026-08-09, PR #39) — this is a **presentation-layer recomposition** of the same data; no engine, queue, brief, or events change.

## 1. Problem

After the queue landed, the dashboard stacked three surfaces — "יוצא היום", "תדריך בוקר", and the claims table — each speaking system vocabulary (task keys, tiers, statuses like "טופס נוצר"). The same claim appeared up to three times. A first-time insurance agent has no narrative to follow: what needs me, what's fine, where do I click first.

## 2. The chosen shape (visual brainstorm, 2026-08-11)

| Question | Decision |
|---|---|
| Overall structure | **One list — every claim appears exactly once, carrying its own next action** (concept A; B and C rejected as primary structures) |
| List organization | **Three human-language sections** (A2): 🔔 צריך אותך היום / ⏳ בהמתנה לאחרים / ✅ תקינים (collapsed count) |
| AI reason ("🤖" line) | **Kept**, as a small muted line inside the card — the brief panel dissolves into the cards |
| Page header | **Greeting + date + three numbers** mirroring the three sections; clicking a number scrolls to its section. The numbers are derived from the sections themselves — no new data, no AI dependency |
| Claims table | **Stays, as a compact archive** at the bottom: name · track · date · copy-link, with client search and a "כולל סגורים" toggle (open-only by default). Status chips leave the main screen (they live in the cockpit) |
| Guided mode ("עבור איתי אחת-אחת", concept C) | **Deferred — phase 2 fast-follow.** The header reserves no space for it now; when built, it is a button beside the greeting that walks the "צריך אותך" cards one at a time |

The old `MorningBrief` and `OutboundQueue` panels are **replaced** by the new composition. The morning-brief *computation* (facts → score → AI ranking → day cache) and the outbound queue *derivation* (rules, cooldowns, caps, events) are untouched — this feature consumes their outputs.

## 3. Card anatomy (one card per claim — always)

```
[שם לקוח]  [chip: מסלול]                              [כפתור פעולה ראשית]
שורת פעולה בשפה אנושית (צבע לפי מקטע)
🤖 שורת הנימוק מהתדריך (אפור, קטן)                     [כפתור משני]
וגם: פעולה משנית (אם קיימת, קטן)
▸ מה יישלח? "שלום דנה…"        ← רק בכרטיס עם שליחה, מקופל
```

**Primary-action rule** when a claim has several things today: **client message wins** (send button + "לא היום" + collapsed "מה יישלח?" preview); otherwise the most-overdue do-task ("פתח את התיק ←"); otherwise the classification prompt. Everything that lost the primary slot appears as one "וגם: …" line (the most overdue of the rest). The card never grows a second button row.

**Send semantics unchanged:** the send button = the queue's send (synchronous `window.open`, then the event POST); "לא היום" = the queue's skip. Same `POST /api/outbound/events`, same cooldown/cap/give-up behavior, same instrumentation — the skip-rate metric that gates auto-send keeps accumulating.

**Escalation** renders as the card's action line in warm language: "הלקוח לא מגיב על „X" (3 תזכורות) — כדאי להתקשר 📞", primary action = פתח את התיק.

## 4. Section assignment (deterministic)

Evaluated top-down; first match wins. Inputs: today's queue (send/doToday), the brief item (tier, reason), open tasks.

| Section | Rule |
|---|---|
| 🔔 צריך אותך היום | has a queue item today (send, do, or escalation) · OR submitted-but-unclassified · OR tier `act_now` |
| ⏳ בהמתנה לאחרים | any open task with a future due date, or tier `waiting`/`this_week` — i.e., the system is tracking it and will resurface it. The row carries a calming note ("🤖 תקין — המעקב ייפתח אוטומטית…") |
| ✅ תקינים | everything else (incl. tier `ok`); rendered as a collapsed count row, expandable |

Within צריך אותך: existing queue ordering (tier → score → overdue). Within בהמתנה: nearest due date first. A null brief (AI down) degrades gracefully: sections still compute (queue + tasks are deterministic), the 🤖 line falls back to the deterministic fact line or is omitted, tier-based rules treat tier as unknown.

## 5. Language layer

A single copy module maps system vocabulary → agent Hebrew, so no card ever shows a task key or raw overdue math:

- `chase_missing_docs` + labels → "מחכים ל[רישיון נהיגה ותמונות נזק] מהלקוח/ה" · last touch → "תזכורת אחרונה לפני N ימים" (from `outbound_events`; none → "טרם נשלחה תזכורת")
- do-tasks → "תורך: [כותרת המשימה]" (+ insurer name where the task title carries it)
- unclassified → "התיק מחכה לסיווג מסלול כבר N יום"
- waiting → "ממתינים לתשובת המבטח · N ימים"
- The greeting is time-aware (בוקר טוב / צהריים טובים / ערב טוב) — the current "תדריך בוקר" header showing at 22:43 is exactly the kind of dissonance this kills.

## 6. Empty state (first-run)

A brand-new agent with zero claims sees an onboarding card instead of empty sections: "צור את התביעה הראשונה שלך — לחץ 'תביעה חדשה', שלח ללקוח את הקישור, והמערכת תאסוף את הכל" (+ the existing NewClaimForm affordance). Zero *actions* but existing claims → "הכל טופל להיום ✅" over the בהמתנה/תקינים sections.

## 7. Architecture

New composition layer, pure + testable, feeding one new panel:

| Piece | Role |
|---|---|
| `web/src/lib/dashboard/compose.ts` | Pure: `(queue, brief, openTasks, claims, now) → DashboardList` — section assignment (§4), one-card merge (§3), ordering. Unit-tested |
| `web/src/lib/dashboard/copy.ts` | Pure: the language layer (§5). Unit-tested |
| `web/src/app/dashboard/TodayList.tsx` | Renders header numbers + sections + cards; owns the send/skip client handlers (moved from `OutboundQueue.tsx`) |
| `web/src/app/dashboard/page.tsx` | Calls existing `getOrCreateBrief` + `loadQueue`, passes to compose; renders `TodayList` + compact archive table |
| Removed | `MorningBrief.tsx`, `OutboundQueue.tsx` (superseded); `ClaimsTable.tsx` slims to the archive form |

Failure contract as today: composition is best-effort; on failure the page still renders the archive table.

## 8. Out of scope

Guided mode (C) · any queue/brief/engine logic change · new data capture · mobile-specific layout (cards already wrap) · the cockpit page.
