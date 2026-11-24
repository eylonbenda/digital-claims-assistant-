// Which inbound emails still ask the clerk for a status update, and what she can
// answer. Pure — spec: docs/superpowers/specs/2026-11-22-insurer-email-actions-design.md
import { canTransition } from "@/lib/handling/transitions";
import { HANDLING_STATUSES, type HandlingStatus } from "@/lib/handling/types";

/** handled_as for an email dismissed without a status change. */
export const HANDLED_NONE = "none";

export type PendingClaim = { handlingEffective: HandlingStatus | null; closed: boolean };

// Not narrowed by `kind`: a reply the business forwards from its own mailbox is
// still the insurer's answer. Mail that arrived before the claim was sent, or on
// a closed claim, has no status to update.
export function isPendingEmail(
  email: { direction: "outbound" | "inbound"; handled_at: string | null },
  claim: PendingClaim,
): boolean {
  return (
    email.direction === "inbound" && !email.handled_at && !!claim.handlingEffective && !claim.closed
  );
}

// Whether a filed message may go back to the inbox. Only inbound mail is ever filed
// by a match that can be wrong; and a message the claim's status was set from stays,
// because it is the record of why the status changed.
export function canUnassign(email: { direction: "outbound" | "inbound"; handled_as: string | null }): boolean {
  return email.direction === "inbound" && (!email.handled_as || email.handled_as === HANDLED_NONE);
}

// The statuses an insurer's email can move the claim to. "sent" is the business's
// own move (completions went out), never something an inbound email reports.
export function emailTargets(effective: HandlingStatus | null): HandlingStatus[] {
  if (!effective) return [];
  return HANDLING_STATUSES.filter((s) => s !== "sent" && canTransition(effective, s));
}

/** The email body as a starting point for "what did the insurer ask for?". */
export function prefillNote(body: string | null, max = 600): string {
  const text = (body ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
