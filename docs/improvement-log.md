# Improvement log

Ledger of `/improve` sessions (`.claude/skills/improve/`). Each finding keeps its status here: `proposed` → `accepted → PR #n` / `done` / `rejected — <reason>`. Rejection reasons stop later sessions from proposing the same idea again.

## 2026-09-30 — session 1 (baseline, @ d4a9e12)

Seven read-only lenses. Every item below was spot-checked against the code. Impact/Effort: H/M/L · S (<½d) / M (1–3d) / L (>3d).

### Context from the user (2026-09-30)
- The owner pricing conversation is **next week (week of 2026-10-05)**, so 0930-09 moves to the top. Split it: 09a starts timestamping milestones now, because historical ticks have no dates and every day without them is lost data. 09b is the owner report.
- The garage **does handle third-party claims**, so the third-party task-engine rules stay. The "prune third-party rules" idea is withdrawn.

### Main list
- [ ] 0930-01 Submit integrity: `submit/route.ts:77-88` ignores the claims-update error yet returns `ok`, and the wizard then clears localStorage. The status check is SELECT-then-UPDATE, so a double tap duplicates side-effects, and a retry after a lost response dead-ends on a raw "already submitted". The draft autosave (`draft/route.ts:73-89`, a blind `summary_json` rewrite with no status predicate) can race submit and wipe `collected`. Fix: a CAS update `.in("status",[created,in_progress])` with `count`, check errors, have the client treat 409 as done, and make the draft write status-guarded. First run a prod query for `status<>'created' and summary_json->'collected' is null`. — H/S — accepted → PR #74
- [ ] 0930-02 Delete the unauthenticated `/api/analyze` (an open Opus proxy on our key) and `/api/forms/[insurer]`. Neither has a caller, and middleware doesn't cover `/api`. — H/S — accepted → PR #75
- [ ] 0930-03 Anon role holds `grant all` on all current and future tables (`002_grants.sql`, `schema.sql:222-231`), and `agencies` has no RLS, so it is world-writable with the public anon key. Any future table that forgets `enable row level security` is open the same way. Fix: enable RLS on `agencies`, drop the anon default privileges, and add a CI check that every `create table` has a matching RLS line. — H/S — accepted → PR #73
- [ ] 0930-04 Prod errors are invisible: 17 `status: 500` returns log nothing, there is no `instrumentation.ts`/`onRequestError`, no error tracking, and no alerting. Fix: `onRequestError` → one structured log + a notifier, plus an uptime ping. — H/S — accepted → PR #78
- [ ] 0930-05 Schema drift is undetectable. `/api/health` checks only env booleans, and `/api/version` always returns `0.1.0`. Fix: a `schema_migrations` table, a health check that compares against the highest `NNN_` file, the version route returning `VERCEL_GIT_COMMIT_SHA`, and a post-deploy check. This closes the 007 class of incident. — H/S-M — accepted → PR #76
- [ ] 0930-06 `/dashboard/[id]` awaits the Opus analysis during render on first open (`page.tsx:146`, 120s timeout × 1 retry, no `maxDuration`). The write-back also clobbers `summary_json` from a stale snapshot. Fix: warm the analysis in `after()` at submit, read the page from cache only, and merge the write. — H/S-M — accepted → PR #77
- [ ] 0930-07 Stalled claimants are invisible: every unsubmitted claim reads "ממתינים ללקוח", `in_progress`/`abandoned` are never set, and there is no "finish the form" send rule, even though `draft.max_step_key`/`saved_at` already exist. Fix: a stall line on the card plus a `finish_wizard` outbound rule. — H/S — proposed
- [ ] 0930-08 New submissions and late uploads send no signal. The list sorts by link `created_at`, and `claim_events` is written but never read. Fix: sort by latest activity, add a "חדש" badge, refresh on focus, and count classification wait from `submitted_at`. — H/S — proposed
- [ ] 0930-09 The owner (buyer) has no value view, and the data isn't captured: milestone ticks are bare booleans (`checklist/route.ts:37`) and there is no repair value. Fix: `{done, at}` milestones, an optional repair value, and an owner report (claims/month, self-completion, cars to garage, submit→insurer→paid days). — H/M — proposed
- [ ] 0930-10 Send-to-insurer is download-and-reattach per file. The `submission_packet` in `architecture.md:102` was never built. Fix: a merged-PDF packet route, one button, and marking it sent ticks a timestamped milestone. — M-H/M — proposed

### Also noticed
- [ ] 0930-11 PII to Anthropic: `analyze.ts:83` sends the full `ClaimData` (ID, DOB, licence, bank) even though the prompt only reads the narrative. Fix: an analysis-input projection plus a test. — M/S — proposed
- [ ] 0930-12 Uploads are proxied through a Vercel function. The platform body limit (~4.5MB, verify) is below the app's 8MB/20MB caps, and HEIC falls through uncompressed. Fix: signed direct-to-Storage uploads. — M-H/M — proposed
- [ ] 0930-13 doc-sync commits leave a red `ci` run on every PR head (e.g. 3d71a0c, 1ace2cb), so red is now normal. Fix: add `[skip ci]` to doc-sync commits, then protect `main`. — M/S — proposed
- [ ] 0930-14 `docs/status.md` says "not deployed / needs keys / blocked on provisioning" while the pilot is live, and it is a 338-line diary. Fix: rewrite the header and next step, and move the changelog out. — M/S — proposed
- [ ] 0930-15 No test covers the 11 formfill templates, and the form-generation failure at submit is swallowed silently. Fix: a per-template fill test plus a `form_generation_failed` event. — M/S — proposed
- [ ] 0930-16 Claimant-link hygiene: tokens never expire (`architecture.md:178` says they do), the draft reads back until submit, consent is client-only and never recorded as an event, and there is no claim/Storage deletion path or draft retention. — M/M — proposed
- [ ] 0930-17 `summary_json` has 5 writers and 3 types. Fix: key-scoped atomic writers (`jsonb_set`/`||`). This subsumes the clobbers in 01 and 06. — M/M — proposed
- [ ] 0930-18 Form "missing fields" (tab badge + next action) come from the cached AI list keyed on `collected`, so the פקידה's edits in FormFieldEditor never clear them. Fix: derive it deterministically from the template fields minus `effectiveClaimData`. — M/M — proposed
- [ ] 0930-19 Claimant follow-up page: it doesn't list what is actually missing, "הסר" doesn't delete the upload server-side, upload errors show in English with no retry, and the first touch doesn't name the garage. — M/S — proposed
- [ ] 0930-20 The insurer/doc-type catalogs are copy-pasted in 4 places (already caused the שומרה bug, PR #40→#44), and the agent-route ownership probe is hand-copied in about 10 routes. Fix: `lib/insurers.ts`, `doc-types.ts`, a `withOwnedClaim` helper. — M/S — proposed
- [ ] 0930-21 Repo/DX hygiene: about 19MB of tracked PNG/PDF in `.pdfwork/` and `poc/` that the folder's own `.gitignore` excludes; `.claude/worktrees/` isn't gitignored; 4 worktrees and about 50 branches are already merged; the tsc Stop hook silently skips worktrees that have no `node_modules`. — L-M/S — proposed
- [ ] 0930-22 Small items: the dashboard shows the open list twice (TodayList + ClaimsTable); the brief flag has no delete-by date; the vehicle lookup caches transient failures as "not found"; the dashboard makes 6 serial DB hops; evaluate `claude-opus-5-5` with explicit `effort` for analysis; no `.env.example`; `middleware.ts` → `proxy.ts` (Next 16). — L/S — proposed
