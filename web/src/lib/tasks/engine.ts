import { TASK_RULES, type RuleCtx } from "./templates";
import {
  STATUS_ORDER,
  type ClaimStatus,
  type EngineInput,
  type EngineResult,
  type TaskSpawn,
} from "./types";

const DAY_MS = 86_400_000;

function buildRuleCtx(input: EngineInput): RuleCtx {
  const { checklist } = input;
  const docDone = new Map<string, boolean>();
  const milestoneDone = new Map<string, boolean>();
  for (const item of checklist) {
    if (item.kind === "doc" && item.docType) docDone.set(item.docType, item.done);
    if (item.kind === "milestone") milestoneDone.set(item.key, item.done);
  }
  return {
    claimType: input.claim.claimType,
    atFaultInsurer: input.claim.atFaultInsurer,
    hasGeneratedForm: input.hasGeneratedForm,
    docDone: (t) => docDone.get(t) === true,
    milestoneDone: (k) => milestoneDone.get(k) === true,
    blockingMissing: () => checklist.some((i) => i.blocking && !i.done),
    mandatoryBaseDocsMissing: () =>
      checklist.some(
        (i) => i.section === "base" && i.kind === "doc" && i.mandatory && !i.done,
      ),
    blockingSectionMissing: (section) =>
      checklist.some((i) => i.section === section && i.blocking && !i.done),
  };
}

// Pure + idempotent: same input → same output; an open task with a rule's key
// suppresses its re-spawn, so replayed events are no-ops.
export function advanceTasks(input: EngineInput): EngineResult {
  const { claim, event, openTasks, now } = input;
  const ctx = buildRuleCtx(input);

  const rules = TASK_RULES.filter(
    (r) => r.track === "all" || r.track === claim.claimType,
  );
  const ruleByKey = new Map(rules.map((r) => [r.key, r]));

  // 1 · auto-complete open template tasks whose condition now holds.
  //     Manual tasks (key null) are the agent's own — never auto-touched.
  const complete: string[] = [];
  for (const t of openTasks) {
    if (!t.key) continue;
    const rule = ruleByKey.get(t.key);
    if (rule?.completeWhen(ctx)) complete.push(t.id);
  }

  // 2 · spawn. Skip if an open task holds the key (idempotency) or the
  //     completion condition already holds (never spawn satisfied work).
  //     Never spawn on a terminal claim (closed/abandoned) — auto-complete
  //     above still runs so stale open tasks get closed out.
  const terminal = claim.status === "closed" || claim.status === "abandoned";
  const openKeys = new Set(openTasks.filter((t) => t.key).map((t) => t.key!));
  const spawn: TaskSpawn[] = [];
  if (!terminal) {
    for (const rule of rules) {
      if (openKeys.has(rule.key)) continue;
      if (!rule.spawnOn(event, ctx)) continue;
      if (rule.completeWhen(ctx)) continue;
      spawn.push({
        key: rule.key,
        title: rule.title,
        track: claim.claimType === "unknown" ? null : claim.claimType,
        due_at: new Date(now.getTime() + rule.dueDays * DAY_MS).toISOString(),
      });
    }
  }

  // 3 · status advance — forward-only, event-gated (see plan table).
  let candidate: ClaimStatus | null = null;
  switch (event.type) {
    case "claim_submitted":
      candidate = "submitted";
      break;
    case "track_confirmed":
      candidate = input.hasGeneratedForm ? "form_generated" : "classified";
      break;
    case "milestone_ticked":
      if (event.done) {
        candidate = event.key === "payment_received" ? "closed" : "checklist_active";
      }
      break;
    case "doc_uploaded":
      break;
  }
  const statusAdvance =
    !terminal && candidate && STATUS_ORDER[candidate] > STATUS_ORDER[claim.status]
      ? candidate
      : null;

  return { spawn, complete, statusAdvance };
}
