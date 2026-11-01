// Where is the claim on its timeline? Pure, derived from facts in the data
// (spec 2026-10-31 §1). First match wins.

export type Stage = "with_client" | "before_send" | "sent" | "awaiting_payment" | "closed";

/** Chip order. */
export const STAGE_ORDER: Stage[] = ["with_client", "before_send", "sent", "awaiting_payment", "closed"];

const SENT = new Set(["sent", "docs_requested", "rejected", "appeal", "legal"]);
const AWAITING_PAYMENT = new Set(["approved_awaiting_payment", "partial_paid"]);

export function claimStage(c: {
  status: string;
  submitted_at: string | null;
  handling_effective: string | null;
}): Stage {
  const h = c.handling_effective;
  if (c.status === "closed" || c.status === "abandoned" || h === "paid") return "closed";
  if (h && SENT.has(h)) return "sent";
  if (h && AWAITING_PAYMENT.has(h)) return "awaiting_payment";
  if (!c.submitted_at) return "with_client";
  return "before_send";
}
