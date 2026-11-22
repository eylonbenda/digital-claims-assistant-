import type { ClaimType } from "@/lib/tasks/types";
import type { HandlingStatus } from "./types";

// What the handler owes next after each handling transition. The engine opens one
// follow-up when the claim is sent and closes it on full payment; in between the
// claim moves through several states that each call for a different action and a
// different date, so every transition replaces that task (same key — the engine
// still closes it on payment). Day counts are field assumptions, like DUE_OFFSETS.
export const FOLLOW_UP_AFTER: Partial<Record<HandlingStatus, { title: string; dueDays: number }>> = {
  sent: { title: "מעקב תשובת המבטחת", dueDays: 14 },
  docs_requested: { title: "לשלוח למבטחת את ההשלמות שביקשה", dueDays: 3 },
  approved_awaiting_payment: { title: "לוודא שהתשלום התקבל", dueDays: 14 },
  partial_paid: { title: "לברר את יתרת התשלום מול המבטחת", dueDays: 7 },
  rejected: { title: "להחליט: ערעור או הליך משפטי", dueDays: 7 },
  appeal: { title: "מעקב תשובה לערעור", dueDays: 14 },
  legal: { title: "מעקב מול עורך הדין", dueDays: 30 },
};

// Statuses where the next move is the insurer's: an undue follow-up then means
// "waiting", not work. Everywhere else the follow-up is the handler's own task.
export const AWAITING_INSURER: ReadonlySet<HandlingStatus> = new Set([
  "sent",
  "approved_awaiting_payment",
  "appeal",
]);

// The engine rule that owns the follow-up per track. The settlement track has no
// single post-send follow-up (its chain runs approval → garage → repair), so its
// tasks are left to the engine.
export function followUpKeyFor(claimType: ClaimType): string | null {
  switch (claimType) {
    case "own_policy":
      return "follow_up_insurer";
    case "third_party_report":
      return "follow_up_tp_insurer";
    default:
      return null;
  }
}
