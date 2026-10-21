import type { ClaimType } from "@/lib/tasks/types";
import { effectiveHandling } from "@/lib/handling/effective";
import { sentMilestoneFor } from "@/lib/handling/transitions";

// Basic shape check so a PII packet can't be "confirmed sent" to garbage.
export function validRecipient(s: string): string | null {
  const t = s.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

export type ConfirmInput = {
  recipient: string;
  subject: string;
  insurerKey?: string;
  current: {
    claim_type: ClaimType;
    handling_status: string | null;
    checklist_state: Record<string, boolean> | null;
  };
  now: Date;
};

export type ConfirmPlan = {
  milestone: string;
  update: Record<string, string>;
  event: { type: "submission_confirmed"; payload: Record<string, unknown> };
};

// Pure planner behind POST /api/claims/[id]/submission.
export function planConfirm(input: ConfirmInput): { error: string } | ConfirmPlan {
  const recipient = validRecipient(input.recipient);
  if (!recipient) return { error: "כתובת הנמען אינה תקינה" };

  const milestone = sentMilestoneFor(input.current.claim_type);
  if (!milestone) return { error: "יש לסווג את התביעה לפני שליחה למבטחת" };

  const effective = effectiveHandling(
    input.current.handling_status,
    input.current.checklist_state,
    input.current.claim_type,
  );
  if (effective) return { error: "התביעה כבר סומנה כנשלחה" };

  const update: Record<string, string> = {
    handling_status: "sent",
    handling_status_changed_at: input.now.toISOString(),
  };
  // Persist the canonical at-fault insurer on TP tracks — this is also what
  // finally auto-completes the get_tp_insurer task.
  if (input.current.claim_type !== "own_policy" && input.insurerKey) {
    update.at_fault_insurer = input.insurerKey;
  }

  return {
    milestone,
    update,
    event: {
      type: "submission_confirmed",
      payload: {
        recipient,
        subject: input.subject,
        ...(input.insurerKey ? { insurerKey: input.insurerKey } : {}),
      },
    },
  };
}
