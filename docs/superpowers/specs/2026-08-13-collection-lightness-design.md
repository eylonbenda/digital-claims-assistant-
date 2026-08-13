# Collection Wizard Lightness — Client Flow Redesign — Design

**Date:** 2026-08-13
**Status:** approved in visual brainstorm (mockups in `.superpowers/brainstorm/15-1786629219/content/`, git-ignored), pending spec review
**Scope:** the client-facing collection flow (`/c/[token]`, `web/src/components/collection/CollectionWizard.tsx`). Presentation-layer + file-structure change. State shape, submit API, image compression, upload logic, plate lookup, and geolocation are untouched.

## 1. Problem

The wizard collects everything a claim needs in 11 linear steps and announces it ("שלב 4 מתוך 11"). Nothing can be cut — the data is genuinely required — but the flow *feels* long: abandonment risk comes from perceived effort, not actual field count. Typing-heavy screens sit early; one-tap screens are scattered; progress framing emphasizes how much is left.

## 2. The chosen shape (visual brainstorm, 2026-08-13)

Combination of concepts A ("פרקים במקום שלבים") and B ("טאפ קודם, הקלדה אחר כך"). Concept C (one-page collapsible sections) rejected.

## 3. Chapter structure — same questions, new order

**Opening screen:** warm intro + consent checkbox (legal text unchanged) + "בוא נתחיל" button.

| Chapter | Steps (in order) | Notes |
|---|---|---|
| **פרק 1 — כמה שאלות מהירות** (pure taps) | נפגעים? → מי נהג? → מי אשם? → היה צד שני? | Only the choice buttons. The conditional detail fields that today expand inline (driver details, third-party details) move to chapter 2. ~10 seconds of momentum. |
| **פרק 2 — הפרטים** (typing) | הרכב (plate → registry auto-fill) → הפרטים שלך (name/ID/mobile/city/insurer/insurance type) → פרטי הנהג *(only if מי נהג = מישהו אחר)* → פרטי הצד השני *(only if צד שני = כן)* → מתי ואיפה (📍 geolocation) → מה קרה (free text) | Vehicle goes first — the registry auto-fill is the flow's "magic" moment and buys goodwill for the typing that follows. |
| **פרק 3 — מסמכים וסיום** | מסמכים ותמונות (optional, unchanged) → סיכום + הצהרה + שליחה | Summary keeps tap-to-edit rows (jump targets update to the new order). |

**Milestone screens** between chapters: 🎉 + "החלק הראשון מאחוריך! נשארו בערך X דקות" + one continue tap. Milestones are display-only interstitials, not steps — never persisted as a resume position.

**Auto-advance:** on tap-step selection, show a ~250ms selected-state flash, then advance automatically. Exception: נפגעים = כן renders the existing 101/100 emergency warning and waits for an explicit המשך. Back navigation (הקודם) remains on every step; returning to a tap step shows the current selection and does NOT auto-advance again until the user taps a choice.

## 4. Progress display

- Chapter chips at top: `✓ עליך` (done) / current (filled) / upcoming (muted) — with dots for steps within the current chapter.
- "שלב X מתוך 11" is removed everywhere.
- Time-left estimate ("עוד כ־2 דקות") under the chips and on milestones. Static remaining-time map keyed by current chapter — in chapter 1: "עוד כ־3 דקות", chapter 2: "עוד כ־2 דקות", chapter 3: "עוד כדקה" — no dynamic math.
- The reassurance line ("התשובות נשמרות — אפשר לעצור ולחזור לקישור בכל שלב") becomes a persistent small footer.

## 5. Type & feel

Base font on this flow 16→18px (`text-lg` equivalents), headings ~24px, tap targets ≥48px height. No other visual-language change; existing Tailwind idiom.

## 6. Architecture — the 1,000-line file splits

| Piece | Role |
|---|---|
| `web/src/components/collection/steps.ts` | **New, pure, unit-tested.** The step registry: ordered array of `{ key, chapter, isTapStep, isRelevant(state) }` + helpers `visibleSteps(state)`, `firstIncompleteStep(state)`, `chapterOf(key)`. Conditional steps (driver details, third-party details) declare `isRelevant` and are skipped entirely — never rendered-but-empty. |
| `web/src/components/collection/steps/*.tsx` | One file per step; JSX moves out of `CollectionWizard.tsx` largely verbatim (props: slice of state + setters). |
| `web/src/components/collection/WizardShell.tsx` | Chips, dots, time-left, milestone interstitials, back/continue buttons, auto-advance timing. |
| `CollectionWizard.tsx` | Shrinks to state + effects (persistence, plate lookup, geolocation, submit, doc upload) + shell composition. |

The plate-lookup effect currently keys on `step === 4`; it re-keys on the active step's `key === "vehicle"`.

## 7. Persistence migration (the real trap)

`lib/collection/persist.ts` saves a numeric step index; reordering would silently resume clients into the wrong screen. Change:

- Bump the storage schema version.
- Save the active step **key** (string) instead of index.
- On load of a current-version blob: resume at the saved key if it is still relevant for the state, else at `firstIncompleteStep(state)`.
- On load of an old-version blob: restore the **state** (shape is unchanged), discard the saved index, resume at `firstIncompleteStep(state)`.
- Unit-tested (old-blob migration, irrelevant-key fallback, round-trip).

## 8. Testing

- Unit: registry order + relevance (driver details skipped when the insured drove; third-party details skipped when no third party), `firstIncompleteStep` on partial states, persistence migration cases (§7).
- Existing `claim-state` and `persist` tests keep passing.
- Manual mobile pass (375px viewport, per the repo's browser verification workflow): chapter chips, auto-advance + its injuries exception, milestone screens, resume mid-chapter-2, summary edit-jumps, submit.

## 9. Out of scope

Removing/adding questions · submit API or state-shape changes · the post-submit FollowupUpload screen · desktop-specific layout · AI assistance in the flow · the agent-side pages.
