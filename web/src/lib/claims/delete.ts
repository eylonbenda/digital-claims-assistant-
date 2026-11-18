import { effectiveHandling } from "@/lib/handling/effective";
import type { ClaimType } from "@/lib/tasks/types";

// Deleting a claim is for one opened by mistake (wrong client, duplicate, test) and
// is permanent, so it is only allowed while nothing left the building: once the
// claim reached the insurer it is closed with a reason, never deleted.
// Spec: docs/superpowers/specs/2026-11-18-delete-claim-design.md
export type DeleteBlocker = "sent" | "emailed";

export const DELETE_BLOCKED_MESSAGE: Record<DeleteBlocker, string> = {
  sent: "התיק כבר נשלח לחברת הביטוח ולכן אי אפשר למחוק אותו. אפשר לסגור אותו דרך ״עדכון סטטוס״ ← סגירה.",
  emailed: "כבר נשלח מייל מהתיק ולכן אי אפשר למחוק אותו. אפשר לסגור אותו דרך ״עדכון סטטוס״ ← סגירה.",
};

// claims.status is deliberately not an input: a never-sent claim that was closed or
// abandoned by mistake is still a mistake.
export function deleteBlocker(input: {
  handlingStatus: string | null;
  checklistState: Record<string, boolean> | null;
  claimType: ClaimType;
  hasOutboundEmail: boolean;
}): DeleteBlocker | null {
  // effectiveHandling also catches pilot claims sent by hand before migration 011.
  if (effectiveHandling(input.handlingStatus, input.checklistState, input.claimType)) return "sent";
  if (input.hasOutboundEmail) return "emailed";
  return null;
}
