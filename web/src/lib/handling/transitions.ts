import type { ClaimType } from "@/lib/tasks/types";
import { type HandlingStatus } from "./types";

export type { HandlingStatus } from "./types";

// Legality table. Key = from (null while never sent), value = allowed targets.
// Closing is claims.status='closed' + closure reason, orthogonal to this table.
const TRANSITIONS: Record<string, readonly HandlingStatus[]> = {
  null: ["sent"],
  sent: ["docs_requested", "approved_awaiting_payment", "partial_paid", "paid", "rejected"],
  docs_requested: ["sent", "approved_awaiting_payment", "partial_paid", "paid", "rejected"],
  approved_awaiting_payment: ["partial_paid", "paid", "rejected"],
  partial_paid: ["paid", "appeal"],
  paid: [],
  rejected: ["appeal", "legal"],
  appeal: ["paid", "partial_paid", "rejected", "legal"],
  legal: ["paid", "partial_paid"],
};

export function canTransition(from: HandlingStatus | null, to: HandlingStatus): boolean {
  return (TRANSITIONS[from ?? "null"] ?? []).includes(to);
}

export type TransitionRequirement = {
  evidenceDoc?: "payment_notice" | "rejection_letter";
  note?: boolean;
  lawyer?: boolean;
};

// What must accompany a transition INTO the given status (enforced server-side).
export function requirementFor(to: HandlingStatus): TransitionRequirement {
  switch (to) {
    case "paid":
    case "partial_paid":
      return { evidenceDoc: "payment_notice" };
    case "rejected":
      return { evidenceDoc: "rejection_letter" };
    case "docs_requested":
    case "appeal":
      return { note: true };
    case "legal":
      return { lawyer: true };
    default:
      return {};
  }
}

// Milestones the system ticks (submission confirm / handling route); the
// checklist PATCH refuses manual ticks of these.
export const SYSTEM_MILESTONES: ReadonlySet<string> = new Set([
  "submitted_to_insurer",
  "submitted_to_tp_insurer",
  "approval_requested",
  "payment_received",
]);

export function isSystemMilestone(key: string): boolean {
  return SYSTEM_MILESTONES.has(key);
}

// The milestone that means "the submission left" per track. For the
// settlement track that is the approval request (spec ruling).
export function sentMilestoneFor(claimType: ClaimType): string | null {
  switch (claimType) {
    case "own_policy":
      return "submitted_to_insurer";
    case "third_party_report":
      return "submitted_to_tp_insurer";
    case "third_party_settlement":
      return "approval_requested";
    default:
      return null;
  }
}
