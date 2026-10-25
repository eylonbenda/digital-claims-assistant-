// Post-send handling lifecycle (spec: docs/superpowers/specs/2026-10-21-claim-handling-design.md).
// Stored in claims.handling_status (text + CHECK); null = not yet sent.
export const HANDLING_STATUSES = [
  "sent",
  "docs_requested",
  "approved_awaiting_payment",
  "partial_paid",
  "paid",
  "rejected",
  "appeal",
  "legal",
] as const;

export type HandlingStatus = (typeof HANDLING_STATUSES)[number];

export function isHandlingStatus(v: unknown): v is HandlingStatus {
  return typeof v === "string" && (HANDLING_STATUSES as readonly string[]).includes(v);
}
