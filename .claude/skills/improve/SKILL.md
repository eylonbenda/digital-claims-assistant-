---
name: improve
description: Run a dedicated improvement session on this repo — proactively hunt for things that could be improved, simplified, optimized or redesigned across architecture, performance, DX, testing, security/privacy, product UX, ops, automation and needless complexity, then report a ranked (impact × effort) list backed by file:line evidence and record it in docs/improvement-log.md. Use when the user says "/improve", "improvement session", "what should we improve", or "review the system for weaknesses". Review only — never implements during the session.
---

# improve — periodic improvement session

Goal: surface what the user **hasn't** noticed. Obvious lint-level nits are noise; hidden weaknesses, debt that will bite, missed opportunities and simpler designs are signal. Every finding must be earned with evidence from the code, not from general best-practice lists.

## Ground rules
- **Review only.** Don't edit code in this session. Accepted items become their own branch + PR afterwards (one per item, per the repo workflow).
- **Stage-aware.** This is a validation-stage product with one pilot customer (a garage). Weight findings by what matters *now*: pilot reliability, PII safety, anything that blocks getting paid, and dev velocity. Scaling work is only worth raising if there's a concrete trigger (name it) — otherwise put it under "Later".
- **Respect prior decisions.** Read `docs/improvement-log.md` first. Don't re-propose anything marked `rejected` unless something material changed — and then say what changed. Check `docs/superpowers/specs/` and `docs/status.md` so you don't "discover" things that are already planned.
- **Evidence or it didn't happen.** Each finding cites `path:line` (or a query/command output). If you can't point at it, drop it or mark it as a question.

## Procedure

### 1. Load context (yourself, quickly)
- `docs/status.md`, root `CLAUDE.md` traps, `docs/improvement-log.md` (create it on first run — see §4).
- `git log --oneline -40` + `git log --since=<last session date> --stat` — what changed since the last session gets extra scrutiny.
- Auto-memory index (already in context) — past incidents (e.g. the manual-migration prod 500) point at systemic weaknesses.

### 2. Fan out read-only reviewers (parallel)
Dispatch `Explore`/`general-purpose` agents in **one message**, one per lens below. Give each: the stage/constraints above, the prior-log entries for its lens, the "since last session" commit range, and the output contract (§3). Tell them to verify before reporting and to return ≤6 findings, best first.

| Lens | Look especially at |
|---|---|
| Architecture & code quality | module boundaries in `web/src/lib/`, duplicated logic, shallow modules, leaky abstractions, dead code, drift from `docs/architecture.md` |
| Reliability & testing | untested critical paths (formfill engine, classification, state machine, outbound queue), error handling on external calls (Anthropic, Supabase, WhatsApp), idempotency, retries |
| Security & privacy | PII (ID, license, photos) in logs/storage/URLs, RLS coverage vs. every table in `web/db/schema.sql` + migrations, signed-URL lifetimes, secrets, auth on every API route, חוק הגנת הפרטיות retention |
| Performance & cost | N+1 queries, missing indexes, Claude token spend (prompt caching, model choice — consult the `claude-api` skill), image/PDF sizes, cold paths |
| Ops & DX | manual steps (migrations!), deploy/rollback, observability, local setup friction, worktree friction, CI gaps, hooks, flaky scripts |
| Product flows & UX | collection flow drop-off points, claimant-facing Hebrew copy, the פקידה's daily workflow vs. what the dashboard makes easy, what the owner (buyer) sees — cross-check `docs/flow.md` + `docs/validation-guide.md` |
| Simplification | features/config/abstractions nobody uses, over-general code for one customer, things that could be deleted |

Use the `dispatching-parallel-agents` pattern; don't run a Workflow unless the user explicitly asks for one.

### 3. Verify, dedupe, rank
For each returned finding, spot-check the cited evidence yourself (open the file). Drop anything that doesn't hold. Merge duplicates across lenses. Then score:
- **Impact** H/M/L — what breaks, leaks, costs or slows if ignored; tie it to the pilot where possible.
- **Effort** S (<½ day) / M (1–3 days) / L (>3 days).

Order: H/S first ("do now"), then H/M and M/S ("next"), then the rest ("later"). Cap the main list at ~10; park the tail under "Also noticed".

### 4. Report + record
Terminal report, one entry per finding:

```
N. [Impact/Effort] Title — lens
   Why: one or two sentences — the consequence, not the principle.
   Evidence: path:line (…)
   Suggested move: the concrete change, and what "done" looks like.
```

End with: the 2–3 you'd do first and why, plus open questions for the user.

Then append a dated section to `docs/improvement-log.md` (create with a one-line header if missing) listing each finding as `- [ ] <id> <title> — <impact/effort> — proposed`. When the user decides, update the line to `accepted → PR #n`, `done`, or `rejected — <reason>`; the reasons are what keep future sessions from repeating themselves. Commit the log on a `docs/improvement-log-<date>` branch and open a PR (pre-authorized).

Offer to publish the report as an Artifact if the user wants to share it.
