// Pure cockpit derivation: (already-loaded page data) → one next action + tab badges.
// No I/O, no clock reads — the caller passes `now` (spec §5).
import type { ItemKind } from "@/lib/claims/checklist";
import type { HandlingStatus } from "@/lib/handling/types";
import { isSystemMilestone } from "@/lib/handling/transitions";
import { AWAITING_INSURER } from "@/lib/handling/followup";
import {
  AWAITING_CLIENT_LINE, CLASSIFY_LINE, CLOSED_LINE, FILL_FORM_LINE, NO_ACTION_LINE,
  INSURER_EMAIL_LINE, PREPARE_SUBMISSION_LINE, UPDATE_HANDLING_LINE,
  awaitingInsurerLine, chaseLine, docsRequestedLine, formFieldsLine, formReadyLine, milestoneLine, taskLine,
} from "./copy";

// "send" exists only while the claim has a submission to prepare (the page decides).
export type TabKey = "overview" | "send" | "form" | "files";
export type TaskLite = { title: string; status: string; due_at: string | null; key?: string | null };
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
  // The client has not submitted the wizard yet — nothing to classify or prepare.
  awaitingClient?: boolean;
  claimClosed?: boolean;
  hasSendTab?: boolean; // the send tab is rendered (classified and not yet sent)
  // Post-send handling (spec 2026-10-21-claim-handling §4). Optional so older
  // call sites behave as before (no handling, not submittable).
  handlingEffective?: HandlingStatus | null;
  submissionReady?: boolean; // checklist-submittable ∧ unsent ∧ track known
  handlingOverdue?: boolean; // follow-up task due/overdue (14d fallback)
  // What the insurer asked for at the last docs_requested transition, if recorded.
  docsRequestNote?: string | null;
  // An inbound email on the sent claim still waits for the handler's decision.
  pendingInsurerEmail?: boolean;
};

export type NextAction =
  | { kind: "classify"; line: string; targetTab: "overview" }
  | { kind: "chase"; line: string; targetTab: "overview" }
  | { kind: "task"; line: string; targetTab: "overview" | "send" }
  | { kind: "form_fields"; line: string; targetTab: "form" }
  | { kind: "form_fill"; line: string; targetTab: "form" }
  | { kind: "form_ready"; line: string; targetTab: "form" }
  | { kind: "milestone"; line: string; targetTab: "overview"; milestoneKey: string; milestoneLabel: string }
  | { kind: "prepare_submission"; line: string; targetTab: "send" }
  | { kind: "update_handling"; line: string; targetTab: "overview" }
  | { kind: "insurer_email"; line: string; targetTab: "overview" }
  | { kind: "none"; line: string; targetTab: "overview" };

// overview counts what waits on the agent there: an unconfirmed track, open tasks
// and missing blocking documents. send is 1 while a ready claim has not been sent.
export type Badges = { overview: number; send: number; form: number; files: number };

const DAY_MS = 86_400_000;

// Tasks whose work happens on another tab: "פתח" must land where the task can be done.
// The at-fault insurer is chosen on the send tab (and saved from there).
const TASK_TAB: Record<string, "send"> = { get_tp_insurer: "send" };

function nextOpenTask(
  tasks: TaskLite[],
  now: Date,
): { title: string; overdueDays: number; key: string | null; dueAt: Date | null } | null {
  const open = tasks.filter((t) => t.status !== "done");
  if (!open.length) return null;
  const dated = open.filter((t) => t.due_at);
  const pick = dated.length
    ? dated.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())[0]
    : open[0];
  const overdueDays = pick.due_at
    ? Math.max(0, Math.floor((now.getTime() - new Date(pick.due_at).getTime()) / DAY_MS))
    : 0;
  return {
    title: pick.title, overdueDays, key: pick.key ?? null,
    dueAt: pick.due_at ? new Date(pick.due_at) : null,
  };
}

export function deriveCockpit(input: CockpitInput, now: Date): { nextAction: NextAction; badges: Badges } {
  const badges: Badges = {
    overview:
      (input.classificationNeedsAttention ? 1 : 0) +
      input.tasks.filter((t) => t.status !== "done").length +
      input.blocking.filter((b) => b.kind === "doc").length,
    send: input.submissionReady && !input.handlingEffective ? 1 : 0,
    form: input.missingFieldCount,
    files: input.docsCount,
  };

  let nextAction: NextAction;
  const task = nextOpenTask(input.tasks, now);
  if (input.claimClosed) {
    nextAction = { kind: "none", line: CLOSED_LINE, targetTab: "overview" };
  } else if (input.awaitingClient) {
    nextAction = { kind: "none", line: AWAITING_CLIENT_LINE, targetTab: "overview" };
  } else if (input.classificationUnconfirmed) {
    nextAction = { kind: "classify", line: CLASSIFY_LINE, targetTab: "overview" };
  } else if (input.chaseLabels.length > 0) {
    nextAction = { kind: "chase", line: chaseLine(input.chaseLabels), targetTab: "overview" };
  } else if (input.submissionReady && !input.handlingEffective) {
    nextAction = { kind: "prepare_submission", line: PREPARE_SUBMISSION_LINE, targetTab: "send" };
  } else if (input.pendingInsurerEmail && input.handlingEffective) {
    // The insurer's answer outranks every other post-send line: it is what the
    // follow-ups below are waiting for, and it may already change the status.
    nextAction = { kind: "insurer_email", line: INSURER_EMAIL_LINE, targetTab: "overview" };
  } else if (input.handlingEffective === "docs_requested") {
    // The ball is with the handler from the moment the insurer asks, not only once
    // the follow-up is overdue — and the line says what was asked.
    nextAction = {
      kind: "update_handling",
      line: docsRequestedLine(input.docsRequestNote?.trim() || null),
      targetTab: "overview",
    };
  } else if (input.handlingEffective === "sent" && input.handlingOverdue) {
    nextAction = { kind: "update_handling", line: UPDATE_HANDLING_LINE, targetTab: "overview" };
  } else if (
    task && task.key?.startsWith("follow_up") && input.handlingEffective &&
    AWAITING_INSURER.has(input.handlingEffective) &&
    task.dueAt && task.dueAt.getTime() > now.getTime()
  ) {
    // The only open work is a follow-up that is not due, in a status where the next
    // move is the insurer's. After a rejection or a partial payment the follow-up is
    // the handler's own task and falls through to the task line below.
    nextAction = { kind: "none", line: awaitingInsurerLine(task.dueAt), targetTab: "overview" };
  } else if (task) {
    nextAction = {
      kind: "task",
      line: taskLine(task.title, task.overdueDays),
      targetTab: (task.key && input.hasSendTab && TASK_TAB[task.key]) || "overview",
    };
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
      kind: "milestone", line: milestoneLine(input.nextMilestone.label), targetTab: "overview",
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
