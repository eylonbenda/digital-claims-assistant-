// Pure cockpit derivation: (already-loaded page data) → one next action + tab badges.
// No I/O, no clock reads — the caller passes `now` (spec §5).
import type { ItemKind } from "@/lib/claims/checklist";
import type { HandlingStatus } from "@/lib/handling/types";
import { isSystemMilestone } from "@/lib/handling/transitions";
import {
  CLASSIFY_LINE, FILL_FORM_LINE, NO_ACTION_LINE,
  PREPARE_SUBMISSION_LINE, UPDATE_HANDLING_LINE,
  chaseLine, formFieldsLine, formReadyLine, milestoneLine, taskLine,
} from "./copy";

export type TabKey = "overview" | "work" | "form" | "files";
export type TaskLite = { title: string; status: string; due_at: string | null };
export type BlockingLite = { key: string; label: string; kind: ItemKind };

export type CockpitInput = {
  classificationNeedsAttention: boolean;
  classificationUnconfirmed: boolean;
  blocking: BlockingLite[];
  chaseLabels: string[];
  tasks: TaskLite[];
  missingFieldCount: number;
  hasGeneratedForm: boolean;
  nextMilestone: { key: string; label: string } | null;
  insurerLabel: string | null;
  docsCount: number;
  // Post-send handling (spec 2026-10-21-claim-handling §4). Optional so older
  // call sites behave as before (no handling, not submittable).
  handlingEffective?: HandlingStatus | null;
  submissionReady?: boolean; // checklist-submittable ∧ unsent ∧ track known
  handlingOverdue?: boolean; // follow-up task due/overdue (14d fallback)
};

export type NextAction =
  | { kind: "classify"; line: string; targetTab: "overview" }
  | { kind: "chase"; line: string; targetTab: "work" }
  | { kind: "task"; line: string; targetTab: "work" }
  | { kind: "form_fields"; line: string; targetTab: "form" }
  | { kind: "form_fill"; line: string; targetTab: "form" }
  | { kind: "form_ready"; line: string; targetTab: "form" }
  | { kind: "milestone"; line: string; targetTab: "work"; milestoneKey: string; milestoneLabel: string }
  | { kind: "prepare_submission"; line: string; targetTab: "work" }
  | { kind: "update_handling"; line: string; targetTab: "work" }
  | { kind: "none"; line: string; targetTab: "overview" };

export type Badges = { overview: boolean; work: number; form: number; files: number };

const DAY_MS = 86_400_000;

function nextOpenTask(tasks: TaskLite[], now: Date): { title: string; overdueDays: number } | null {
  const open = tasks.filter((t) => t.status !== "done");
  if (!open.length) return null;
  const dated = open.filter((t) => t.due_at);
  const pick = dated.length
    ? dated.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0]
    : open[0];
  const overdueDays = pick.due_at
    ? Math.max(0, Math.floor((now.getTime() - new Date(pick.due_at).getTime()) / DAY_MS))
    : 0;
  return { title: pick.title, overdueDays };
}

export function deriveCockpit(input: CockpitInput, now: Date): { nextAction: NextAction; badges: Badges } {
  const badges: Badges = {
    overview: input.classificationNeedsAttention,
    work:
      input.tasks.filter((t) => t.status !== "done").length +
      input.blocking.filter((b) => b.kind === "doc").length,
    form: input.missingFieldCount,
    files: input.docsCount,
  };

  let nextAction: NextAction;
  const task = nextOpenTask(input.tasks, now);
  if (input.classificationUnconfirmed) {
    nextAction = { kind: "classify", line: CLASSIFY_LINE, targetTab: "overview" };
  } else if (input.chaseLabels.length > 0) {
    nextAction = { kind: "chase", line: chaseLine(input.chaseLabels), targetTab: "work" };
  } else if (input.submissionReady && !input.handlingEffective) {
    nextAction = { kind: "prepare_submission", line: PREPARE_SUBMISSION_LINE, targetTab: "work" };
  } else if (
    (input.handlingEffective === "sent" || input.handlingEffective === "docs_requested") &&
    input.handlingOverdue
  ) {
    nextAction = { kind: "update_handling", line: UPDATE_HANDLING_LINE, targetTab: "work" };
  } else if (task) {
    nextAction = { kind: "task", line: taskLine(task.title, task.overdueDays), targetTab: "work" };
  } else if (input.missingFieldCount > 0) {
    nextAction = { kind: "form_fields", line: formFieldsLine(input.missingFieldCount), targetTab: "form" };
  } else if (
    input.hasGeneratedForm &&
    input.nextMilestone &&
    // System milestones are no longer manually tickable — their actions are the
    // prepare/handling entries above.
    !isSystemMilestone(input.nextMilestone.key)
  ) {
    nextAction = {
      kind: "milestone", line: milestoneLine(input.nextMilestone.label), targetTab: "work",
      milestoneKey: input.nextMilestone.key, milestoneLabel: input.nextMilestone.label,
    };
  } else if (input.hasGeneratedForm) {
    nextAction = { kind: "form_ready", line: formReadyLine(input.insurerLabel), targetTab: "form" };
  } else if (input.tasks.length || input.docsCount) {
    nextAction = { kind: "form_fill", line: FILL_FORM_LINE, targetTab: "form" };
  } else {
    nextAction = { kind: "none", line: NO_ACTION_LINE, targetTab: "overview" };
  }
  return { nextAction, badges };
}
