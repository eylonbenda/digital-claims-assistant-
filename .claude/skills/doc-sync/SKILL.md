---
name: doc-sync
description: Reconcile docs/ with the actual code after building. Detects where the markdown specs in docs/ (architecture, flow, claim-management, form-field-map, status, mvp-scope) have drifted from what the code now does, applies the fixes, refreshes the docs/status.md breadcrumb, and keeps the "Docs index" in CLAUDE.md accurate. Invoke at checkpoints — after finishing a feature, before stopping a session, or whenever code and docs may have diverged. Use when the user says "sync the docs", "update docs to match code", "/doc-sync", or "docs are stale".
---

# doc-sync

Keep `docs/` the **live source of truth** it claims to be. Code is authoritative; docs follow code. Never invent state — only write what the code actually shows. When unsure, flag it instead of guessing.

## Scope (what this skill may edit)
- Everything in `docs/` (the spec markdown).
- `docs/status.md` — the session breadcrumb (date + build-order table + "where we are").
- The **"Docs index"** section of the root `CLAUDE.md` (file list + one-line descriptions only). Do **not** rewrite the rest of CLAUDE.md.

Out of scope: code, `web/CLAUDE.md`, `web/AGENTS.md`, `poc/README.md` (those track themselves), and anything under `node_modules`.

## Doc → code ownership map
Use this to know which code to diff a doc against. (Re-derive from the "Docs index" in CLAUDE.md if it has changed.)

| Doc | Authoritative source in code |
|---|---|
| `architecture.md` | `web/src/` structure, `web/db/schema.sql` + migrations, `web/src/lib/ai/`, `next.config.ts` |
| `flow.md` | `web/src/components/collection/`, claim state handling, API routes under `web/src/app/api/` |
| `claim-management.md` | claim-type logic, `web/src/lib/ai/analyze.ts`, classification code, task workflows |
| `form-field-map.md` | `web/src/lib/formfill/` (`types.ts`, `engine.ts`, `labels.ts`, `templates/*`); `.pdfwork/` coordinate lab |
| `mvp-scope.md` | the build-order list vs. what actually exists in `web/` |
| `status.md` | **all of the above** — it summarizes current state |
| `validation-guide.md`, `assumptions-canvas.md` | customer/validation artifacts — only touch if the user changed them; not code-derived |

## Procedure

### 1. Determine what changed
Run, from the project root:
```
git status --short
git log --oneline -15
```
Find the **last commit that touched `docs/` or `CLAUDE.md`** (the last sync point):
```
git log -1 --format=%H -- docs/ CLAUDE.md
```
Then diff code since that point, plus uncommitted work:
```
git diff <syncpoint>..HEAD --stat -- web/ poc/ .pdfwork/
git diff <syncpoint>..HEAD -- web/src web/db next.config.ts
git diff -- web/ poc/ .pdfwork/      # uncommitted
```
If no clear sync point (or the user said "all" / "full audit"), audit every doc against its owning code per the table above.

### 2. Detect drift
For each doc whose owned code changed, read the doc and the code and look specifically for:
- **API routes** — do the routes named in docs match files under `web/src/app/api/`? (methods, paths, guards like the 503-without-`ANTHROPIC_API_KEY`)
- **Data model** — do tables/columns/RLS in docs match `web/db/schema.sql` + `web/db/migrations/`?
- **File paths** — every path a doc names must exist. Renamed/moved/deleted files are the most common drift.
- **Model IDs / SDK surface** — Anthropic model IDs, env vars (`CLAIMS_AI_MODEL`, `ANTHROPIC_API_KEY`). If editing anything Anthropic-related, **consult the `claude-api` skill first** — do not assert model facts from memory.
- **Form-fill** — which insurer templates exist (`web/src/lib/formfill/templates/`), which preview routes work, OCR-pending insurers.
- **Build/scope state** — `mvp-scope.md` build order and `status.md` table: flip ❌/✅/🚧 to match reality. Verify "build passes" claims are still plausible (don't run a full build unless asked, but flag if you suspect it broke).
- **Counts & lists** — "9 insurer PDFs", "done: הכשרה, מגדל", step counts in the wizard, etc.

### 3. Apply edits
- Edit the docs in place. Make the **minimal** change that restores accuracy — don't rewrite prose that's still correct.
- **Respect doc-language conventions** (from CLAUDE.md): technical docs (`architecture.md`, `flow.md`, `mvp-scope.md`) in **English**; domain docs (`claim-management.md`, `form-field-map.md`, `validation-guide.md`) in **Hebrew**. Keep Hebrew domain terms ("הודעה על תאונה", "מי אשם", insurer names) everywhere. In Hebrew/mixed lines, insert RLM (U+200F) after markdown markers so RTL order holds.
- Preserve each doc's existing structure, heading style, and table format.

### 4. Refresh `status.md`
- Update **"Last updated"** to today's date (use the current date from the environment context).
- Sync the build-order table states and the "In one line" summary to match what now exists.
- Update "what's next" only if the prior next-step is clearly done.

### 5. Update the CLAUDE.md "Docs index"
Only if docs were added/removed/renamed or a one-line description is now wrong. Keep entries one line each; don't expand into prose.

### 6. Report
End with a concise summary:
- **Synced:** bullet per doc changed, one line each (`form-field-map.md — added libra template, marked phoenix OCR-pending`).
- **Flagged (not auto-fixed):** anything ambiguous, contradictory, or needing a human call — with the specific question.
- **Clean:** docs verified still-accurate, no change needed.

If the user passed `--commit`, stage **only the doc files you changed** and create a single commit:
`docs: sync with code (<short scope>)` ending with the standard `Co-Authored-By` trailer. Never commit code or unrelated changes. Otherwise leave edits in the working tree for the user to review.

## Guardrails
- Code wins. If a doc and the code disagree, the doc is wrong — fix the doc, never the code (unless the user explicitly asks).
- Don't fabricate. If you can't confirm something from code, flag it; don't write an optimistic guess.
- Don't touch validation/customer docs from code signals alone.
- Stay minimal — this is a reconciler, not a rewrite pass.
