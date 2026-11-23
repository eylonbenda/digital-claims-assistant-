# Appraiser amounts → demand letter — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest the repair cost and diminished value read from the appraiser report, and write them into the demand-letter damages lines on the clerk's click.

**Architecture:** One bounded Claude call per appraiser report, stored as a claim event. A pure function decides what is pending from the events, the live documents and the current damages. A client card applies through the existing form-data route.

**Tech Stack:** Next.js 16, TypeScript, Supabase, `@anthropic-ai/sdk`, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-appraiser-amounts-design.md`

## Global Constraints
- No migration. Events only: `appraiser_amounts_extracted`, `appraiser_amounts_resolved`.
- Only `claim_type === "third_party_report"` (`DEMAND_TRACK`).
- Extraction never throws and never fails an upload or a re-file.
- Amounts: ILS, before VAT, 2 decimals, `0 < n <= MAX_DAMAGE_AMOUNT`.
- English identifiers, Hebrew UI strings.

## Review Focus
- Report that prints only a VAT-inclusive total → derived figure, `verified: false`.
- Report under an older VAT rate → mismatch → `verified: false`, still suggested.
- Total-loss report with no repair cost → diminished value alone, or no suggestion.
- Appraiser report deleted or re-filed after extraction → suggestion disappears.
- Clerk already typed the same amounts → no suggestion.

---

### Task 1: Shared file-call helper + extraction
**Files:** create `web/src/lib/ai/file-call.ts`, `web/src/lib/ai/extract-appraiser-amounts.ts` (+ `.test.ts`); modify `web/src/lib/ai/classify-document.ts`.

**Interfaces — produces:**
- `askAboutFile(bytes, kind, req: { system; question; schema; maxTokens; timeoutMs }, client?): Promise<string | null>`
- `type AppraiserAmounts = { repair: number | null; diminished_value: number | null; verified: boolean }`
- `parseAppraiserAmounts(text: string): AppraiserAmounts | null`
- `extractAppraiserAmounts(bytes, kind, deps?): Promise<AppraiserAmounts | null>`

- [ ] Tests: consistent report → verified; mismatch → unverified; only inclusive total → derived, unverified; not confident / all zero / malformed / over the cap → null; HEIC and missing key → null without a call; thrown call and timeout → null.
- [ ] Implement; `classify-document.ts` moves onto `askAboutFile` with its tests unchanged.

### Task 2: Pending-suggestion logic
**Files:** create `web/src/lib/demand/appraiser-suggestion.ts` (+ `.test.ts`).

**Interfaces — produces:**
- `EV_EXTRACTED`, `EV_RESOLVED`
- `type Suggestion = { documentId: string; verified: boolean; lines: { key: "repair" | "diminished_value"; suggested: number; current: number | null }[] }`
- `pendingSuggestion(events /* newest first */, liveDocIds: Set<string>, damages): Suggestion | null`
- `applySuggestion(damages, lines): Damages`

- [ ] Tests: the five Review Focus cases that live here, a resolution older than a re-extraction does not hide it, `applySuggestion` keeps an existing VAT flag and the other lines.
- [ ] Implement.

### Task 3: Routes
**Files:** create `web/src/lib/demand/suggest-on-file.ts`, `web/src/app/api/claims/[id]/appraiser-amounts/route.ts`; modify `…/documents/route.ts`, `…/documents/[docId]/route.ts`.

- [ ] `recordAppraiserAmounts(svc, claimId, documentId, bytes, kind)` — extract, insert the event, report (never throw) on failure.
- [ ] Upload route: call it when the stored type is `appraiser_report` and the claim is on the demand track.
- [ ] Re-file route: same, downloading the stored object first; `maxDuration = 60`.
- [ ] `POST /api/claims/[id]/appraiser-amounts { document_id, outcome }` — RLS probe, insert the resolution event.

### Task 4: UI
**Files:** create `web/src/app/dashboard/[id]/AppraiserSuggestion.tsx`; modify `page.tsx`.

- [ ] Page reads the two event types (newest first), computes `pendingSuggestion`, renders the card above the drop zone; `FormFieldEditor` is keyed on the number of applied resolutions so its state re-seeds.
- [ ] Card: apply → `PATCH form-data` with `applySuggestion`, then the resolution; dismiss → the resolution.

### Task 5: Verify
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- [ ] Browser on dev: upload a demo appraiser report on a demand claim, apply, check the damages lines and the regenerated letter.
