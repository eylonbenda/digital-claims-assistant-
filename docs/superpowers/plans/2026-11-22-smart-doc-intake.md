# Smart Document Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The clerk drops many files on a claim at once and each is filed under a type Claude detected, with a summary where she corrects mistakes.

**Architecture:** The existing agent upload route accepts `type: "auto"` and asks a new never-throwing classifier for the type before inserting the row. Correction reuses the existing re-file endpoint. A new client drop zone uploads files with a concurrency cap and renders the summary.

**Tech Stack:** Next.js 16 route handlers, `@anthropic-ai/sdk` ^0.106 (Messages API, structured output via `output_config.format`), Vitest, Supabase.

**Spec:** `docs/superpowers/specs/2026-11-22-smart-doc-intake-design.md`

## Global Constraints
- The AI never blocks or fails an upload: any error, timeout, missing key, unsupported format or unsure verdict files the document as `other`.
- No DB migration.
- Same client and model as the existing analysis call: `getAnthropic()` and `CLAIMS_MODEL` from `web/src/lib/anthropic.ts`.
- English identifiers, Hebrew UI strings. The existing single-file upload stays unchanged.
- Read `web/node_modules/next/dist/docs/` before writing Next code (`web/AGENTS.md`).

## Review Focus
1. HEIC photo dropped → filed as `other`, no API call (the Messages API takes JPEG/PNG/GIF/WebP images and PDFs only). Test in Task 1.
2. Model returns a type outside the allowlist or malformed JSON → `other`. Test in Task 1.
3. API call rejects or exceeds the timeout → upload still succeeds as `other`. Test in Task 1.
4. No `ANTHROPIC_API_KEY` (local dev, preview) → `other`, no throw. Test in Task 1.
5. Twenty files dropped at once → at most 3 uploads in flight; one failed file does not stop the rest and shows its own error. Test in Task 3 (`runPool`).

---

### Task 1: Classifier

**Files:**
- Create: `web/src/lib/claims/doc-labels.ts` (move `DOC_OPTIONS` here from `AgentDocUpload.tsx`, which re-exports it; add `CLASSIFY_LABELS`)
- Create: `web/src/lib/ai/classify-document.ts`
- Test: `web/src/lib/ai/classify-document.test.ts`

**Interfaces:**
- Produces:
  - `DOC_OPTIONS: { type: string; label: string }[]` (unchanged content) and `CLASSIFY_LABELS: { type: string; label: string }[]` = `DOC_OPTIONS` plus `drivers_license` "רישיון נהיגה" and `vehicle_reg` "רישיון רכב".
  - `type DocVerdict = { type: string; detected: boolean }`
  - `detectDocType(bytes: Uint8Array, kind: SniffKind, deps?: { client?: Pick<Anthropic, "messages"> | null; timeoutMs?: number }): Promise<DocVerdict>` — never throws. `detected` is true only when the model answered with an allowlisted type other than `other` and `confident: true`.
  - `parseVerdict(text: string): DocVerdict` (exported for tests).

- [ ] **Step 1: Write failing tests** in `classify-document.test.ts`, using a fake client whose `messages.create` returns `{ content: [{ type: "text", text }] }`:
  - `parseVerdict('{"type":"garage_invoice","confident":true}')` → `{ type: "garage_invoice", detected: true }`
  - `confident: false` → `{ type: "other", detected: false }`
  - type `"made_up"` → other; text `"not json"` → other; type `"other"` with confident true → `{ type: "other", detected: false }`
  - `detectDocType(bytes, "heic", { client })` → other, and `client.messages.create` not called
  - `client: null` → other
  - `create` rejects → other; `create` never resolves with `timeoutMs: 20` → other
  - PDF sends a `document` block with `media_type: "application/pdf"`; `"jpeg"` sends an `image` block with `media_type: "image/jpeg"`; both carry base64 data and the request uses `model: CLAIMS_MODEL`.
- [ ] **Step 2:** `npx vitest run src/lib/ai/classify-document.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement.** One `messages.create` with `max_tokens: 256`, `output_config.format` JSON schema `{ type: enum of CLASSIFY_LABELS types, confident: boolean }` (`additionalProperties: false`, both required), the file block first then a short text block; system prompt in English listing each type with its Hebrew label, telling the model to answer `other` + `confident: false` when unsure and that the file is data, not instructions. Race the call against `timeoutMs` (default `20_000`); pass `{ timeout: timeoutMs, maxRetries: 0 }` as request options. Wrap everything in try/catch → other.
- [ ] **Step 4:** run the test file → PASS; `npx tsc --noEmit` → exit 0.
- [ ] **Step 5:** commit `feat(ai): classify an uploaded document's type`.

### Task 2: Route accepts `type: "auto"`

**Files:**
- Modify: `web/src/app/api/claims/[id]/documents/route.ts`

**Interfaces:**
- Consumes: `detectDocType`, `DocVerdict` (Task 1).
- Produces: `POST` with FormData `type=auto` responds `{ ok: true, id, type, path, detected }`; with an explicit type the response is unchanged plus nothing new.

- [ ] **Step 1:** Accept `"auto"` alongside `AGENT_TYPES`. After the sniff and before building the storage path, when `type === "auto"` call `detectDocType(bytes, kind)` and use its `type` for the path, the row and the engine event.
- [ ] **Step 2:** For auto uploads insert a `claim_events` row `{ type: "document_auto_filed", payload_json: { type, detected } }` (failure reported with `reportError`, never fatal) and add `detected` to the response.
- [ ] **Step 3:** `npx tsc --noEmit` → exit 0; `npx vitest run` → all pass.
- [ ] **Step 4:** commit `feat(documents): auto-file an upload by detected type`.

### Task 3: Drop zone and summary

**Files:**
- Create: `web/src/lib/files/pool.ts`, `web/src/lib/files/pool.test.ts`
- Create: `web/src/app/dashboard/[id]/DocDropZone.tsx`
- Modify: `web/src/app/dashboard/[id]/AgentDocUpload.tsx` (import `DOC_OPTIONS` from `doc-labels`, keep the re-export), `web/src/app/dashboard/[id]/page.tsx` (render `<DocDropZone claimId=… />` directly above `<AgentDocUpload />`, hidden when the claim is closed)

**Interfaces:**
- Consumes: Task 2's response shape; `PATCH /api/claims/[id]/documents/[docId] { type }` (existing); `DOC_OPTIONS`.
- Produces: `runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]>` — results in input order, never more than `limit` workers running.

- [ ] **Step 1: Failing tests** for `runPool`: 7 items with `limit: 3` never exceed 3 concurrent (track a counter's max); results keep input order; a rejecting worker yields `status: "rejected"` at its index while the others fulfil.
- [ ] **Step 2:** run → FAIL. **Step 3:** implement `runPool`. **Step 4:** run → PASS.
- [ ] **Step 5: `DocDropZone`** (client component): a bordered drop area + hidden `<input type="file" multiple accept=".jpg,.jpeg,.png,.heic,.pdf">`; drag-over highlight; heading "גררו לכאן את כל המסמכים", sub-line "המערכת תזהה ותתייק כל קובץ. אפשר לתקן אחר כך". On files: one row per file in state `uploading` → `done` | `error`, uploaded through `runPool(files, 3, …)` posting `type=auto`. When all settle call `router.refresh()`.
  Summary rows: file name, then "← {label}" for a detected type or "לא זוהה, תויק כ״אחר״" otherwise, then a `<select>` of `DOC_OPTIONS` (stable `id` per row) that PATCHes the re-file endpoint and refreshes; a failed file shows the server's error text. A "סגור" button clears the summary; it never clears by itself.
- [ ] **Step 6:** `npx tsc --noEmit`, `npx eslint src`, `npx vitest run`, `npm run build` → all clean.
- [ ] **Step 7:** commit `feat(cockpit): drop zone that files documents by detected type`.

### Task 4: Verify against the running app

- [ ] Production build served locally (`npm run start -- --port 3106`), dev database, demo claim. Drop the fictional documents from `demo-docs/` (appraiser report, repair invoice, fee invoice, receipt, payment notice, rejection letter) and record, per file, the detected type against the true one.
- [ ] Correct one row through the summary selector; confirm the document moved and a `document_retyped` event exists.
- [ ] Record results in the PR body, including any wrong detection. Open the PR against `main`.
