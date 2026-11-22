# Smart document intake (type detection only) — design

**Status:** approved 2026-11-22. Short design for a small feature.

## Intent
The clerk at a garage uploads ~8 handler-side documents per third-party claim, one at a
time, picking a type from a 22-entry list each time. The system should do the sorting:
she drops every file at once, the system files each under the right type, she only
corrects what it got wrong. Part of the wider goal that the system works for the clerk
rather than the clerk reporting to the system.

## Goals
- One drop zone in the cockpit taking many files at once.
- Each file stored once, filed under the detected type.
- A summary straight after upload, one row per file, with a control to change the type.
- Every manual correction recorded, so accuracy on real pilot documents can be measured.

## Non-goals
- Extracting amounts or any other field from the documents (next step, after the pilot
  yields real documents to measure against).
- The claimant wizard — clients keep uploading per slot.
- Changing the handling status from a detected payment notice or rejection letter.
- The privacy notice. Sending documents to Anthropic makes it a sub-processor that the
  notice should name; the owner parked this for separate handling (2026-11-22).

## Anti-goals
- The AI must never block or fail an upload. On error, timeout, low confidence, a
  missing API key or an unsupported format (HEIC) the file is filed as `other`.
- No silent mis-filing left unseen: the summary stays until the clerk dismisses it.

## Approaches considered
1. **Full intake** — detect type, extract amounts, fill the demand letter. Rejected for
   now: extraction accuracy on real invoices and appraiser reports is unknown and a
   wrong amount in a demand letter is costly; there are no real documents to test on.
2. **Type detection only (chosen)** — classification is far easier than extraction,
   gives most of the click saving, and needs no confirmation step for money.
3. **Classify first, upload after confirmation** — the file would travel twice and the
   clerk would confirm every file even when all are right. Rejected.

## Design
- `POST /api/claims/[id]/documents` accepts `type: "auto"`. The route sniffs the file as
  today, then asks `classifyDocument(bytes, kind)` for a type, with a short timeout;
  the stored row gets the detected type or `other`. The response reports `type` and
  `detected: boolean`.
- `web/src/lib/ai/classify-document.ts` — one Claude call per file (PDF as a document
  block, JPEG/PNG/WebP as an image block), structured output `{ type, confident }`
  constrained to the agent-uploadable types. Same client and model setting as the
  existing analysis call (`CLAIMS_AI_MODEL`). Not confident → `other`.
- No migration: correction goes through the existing re-file endpoint
  (`PATCH …/documents/[docId]`), which already logs `document_retyped` and re-runs the
  task engine. Auto-filed uploads log `document_auto_filed { type, detected }`, so
  corrections can be compared against detections.
- UI: a drop zone component in the cockpit next to the existing single upload, which
  stays. Files upload in parallel with a small concurrency cap; the summary lists file
  name → detected type with a type selector per row.

## Known trade-off
Auto-filing runs the task engine. A file wrongly detected as the appraiser report or the
repair invoice can close "collect post-repair documents" and open "submit" until the
clerk corrects it; correction restores the right tasks. Accepted — the summary is shown
immediately and does not close by itself.

## Left to the builder
Prompt wording, timeout value, concurrency cap, exact Hebrew copy, component layout.
