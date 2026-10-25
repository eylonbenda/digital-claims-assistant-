// The doc types an agent may upload from the cockpit. Shared by the documents
// route's server allowlist and the upload UI so the two cannot drift — the
// handling evidence gates are unsatisfiable if a required type is missing here
// (enforced by agent-doc-types.test.ts).
export const AGENT_DOC_TYPES: ReadonlySet<string> = new Set([
  "appraiser_report",
  "garage_invoice",
  "repair_receipt",
  "assessor_fee_invoice",
  "assessor_fee_receipt",
  "no_claim_confirmation",
  "loss_confirmation",
  "bank_details",
  "demand_form",
  "police_report",
  "insurance_history",
  "lien_release",
  "info_consent",
  "power_of_attorney",
  "vat_offset_confirmation",
  "keys",
  "id_card",
  "car_photo",
  "third_party_doc",
  "drivers_license",
  "vehicle_reg",
  "other",
  // Evidence docs gating handling transitions (migration 011)
  "payment_notice",
  "rejection_letter",
]);
