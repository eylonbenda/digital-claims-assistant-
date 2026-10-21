import type { ClaimType, ClaimStatus } from "@/lib/tasks/types";
import { canTransition, requirementFor, sentMilestoneFor } from "./transitions";
import { effectiveHandling } from "./effective";
import { isHandlingStatus, type HandlingStatus } from "./types";
import { REQUIREMENT_ERROR } from "./copy";

export type Lawyer = { name: string; phone?: string; email?: string };

export const CLOSURE_REASONS = [
  "paid_closed",
  "rejected_final",
  "for_information",
  "other",
] as const;
export type ClosureReason = (typeof CLOSURE_REASONS)[number];

export type HandlingInput = {
  to?: HandlingStatus;
  close?: { reason: ClosureReason; note?: string };
  // Correction path: undo a mistaken "sent" (only while still at sent).
  revert?: boolean;
  note?: string;
  lawyer?: Lawyer;
  current: {
    handling_status: string | null;
    checklist_state: Record<string, boolean> | null;
    claim_type: ClaimType;
    status: ClaimStatus | string;
  };
  docs: { type: string }[];
  now: Date;
};

export type HandlingPlan = {
  update: Record<string, string | null>;
  summaryPatch?: Record<string, unknown>;
  event: { type: string; payload: Record<string, unknown> };
  milestoneTick?: string;
  milestoneUntick?: string;
};

// Pure planner behind PATCH /api/claims/[id]/handling. The route is I/O glue.
export function planHandlingUpdate(input: HandlingInput): { error: string } | HandlingPlan {
  const { current, now } = input;

  if (input.close) {
    if (!CLOSURE_REASONS.includes(input.close.reason)) {
      return { error: "סיבת סגירה לא מוכרת" };
    }
    const closure = { reason: input.close.reason, ...(input.close.note ? { note: input.close.note } : {}) };
    return {
      update: { status: "closed", closed_at: now.toISOString() },
      summaryPatch: { handling: { closure } },
      event: { type: "claim_closed", payload: closure },
    };
  }

  const from = effectiveHandling(current.handling_status, current.checklist_state, current.claim_type);

  if (input.revert) {
    if (from !== "sent") return { error: "ניתן לבטל שליחה רק כל עוד הסטטוס הוא נשלחה" };
    const milestone = sentMilestoneFor(current.claim_type);
    return {
      update: { handling_status: null, handling_status_changed_at: now.toISOString() },
      event: { type: "handling_reverted", payload: { from: "sent" } },
      ...(milestone ? { milestoneUntick: milestone } : {}),
    };
  }

  if (!isHandlingStatus(input.to)) return { error: "סטטוס יעד לא מוכר" };
  const to = input.to;
  // "sent" is only ever set by the confirm route (which also ticks the
  // milestone + logs the submission event); setting it here would wedge the claim.
  if (to === "sent" && from === null) {
    return { error: "סימון כנשלחה נעשה דרך מסך השליחה" };
  }
  if (!canTransition(from, to)) {
    return { error: `מעבר לא חוקי: ${from ?? "טרם נשלחה"} → ${to}` };
  }

  const req = requirementFor(to);
  if (req.evidenceDoc && !input.docs.some((d) => d.type === req.evidenceDoc)) {
    return { error: REQUIREMENT_ERROR[to] ?? "חסר מסמך מגבה" };
  }
  const note = input.note?.trim();
  if (req.note && !note) return { error: REQUIREMENT_ERROR[to] ?? "חסרה הודעה" };
  if (req.lawyer && !(input.lawyer?.name?.trim() && (input.lawyer.phone?.trim() || input.lawyer.email?.trim()))) {
    return { error: REQUIREMENT_ERROR[to] ?? "חסרים פרטי עורך דין" };
  }

  const plan: HandlingPlan = {
    update: {
      handling_status: to,
      handling_status_changed_at: now.toISOString(),
    },
    event: {
      type: "handling_changed",
      payload: { from, to, ...(note ? { note } : {}) },
    },
  };
  if (req.lawyer && input.lawyer) {
    const lawyer: Lawyer = { name: input.lawyer.name.trim() };
    if (input.lawyer.phone?.trim()) lawyer.phone = input.lawyer.phone.trim();
    if (input.lawyer.email?.trim()) lawyer.email = input.lawyer.email.trim();
    plan.summaryPatch = { handling: { lawyer } };
  }
  // Only a FULL payment ticks payment_received — the engine closes the claim
  // on that milestone, and a partially-paid claim must stay open (spec ruling).
  if (to === "paid") plan.milestoneTick = "payment_received";
  return plan;
}
