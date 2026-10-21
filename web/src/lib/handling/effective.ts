import type { ClaimType } from "@/lib/tasks/types";
import { isHandlingStatus, type HandlingStatus } from "./types";
import { sentMilestoneFor } from "./transitions";

// Pilot claims sent by hand before migration 011 have handling_status null
// with the sent-milestone already ticked; read them as 'sent' instead of
// backfilling (spec ruling). The column, once written, always wins.
export function effectiveHandling(
  handlingStatus: string | null,
  checklistState: Record<string, boolean> | null,
  claimType: ClaimType,
): HandlingStatus | null {
  if (isHandlingStatus(handlingStatus)) return handlingStatus;
  // payment_received beats the sent milestone: a legacy claim hand-ticked as
  // paid must not resurface as "נשלחה" in the new surfaces.
  if (checklistState?.payment_received) return "paid";
  const milestone = sentMilestoneFor(claimType);
  if (milestone && checklistState?.[milestone]) return "sent";
  return null;
}
