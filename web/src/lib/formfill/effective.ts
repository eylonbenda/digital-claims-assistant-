import { toClaimData, type State } from "@/lib/collection/claim-state";
import type { ClaimData } from "./types";

// Shape of claims.summary_json. `collected` is the client's original submission and is
// never mutated (audit record). `form_data` is the agent's edited canonical ClaimData —
// present only after the agent corrected/completed fields the client left missing or wrong.
export type ClaimSummaryJson = {
  collected?: State;
  form_data?: ClaimData;
  // analysis + analysis_input_hash also live here (see analysis-cache.ts)
} | null;

// The business handling the claim (an `agents` row). Only a garage's name is a sensible
// "שם המוסך" — an insurance agency's name must never land in the garage box.
export function garageNameDefault(
  business: { name?: string | null; kind?: string | null } | null | undefined,
): string | null {
  const name = business?.name?.trim();
  return business?.kind === "garage" && name ? name : null;
}

// The canonical ClaimData used to fill the accident-notice form: the agent's edited
// version if present, otherwise derived from the client's submission.
// `garageName` pre-fills garage.name on the derived data only: once the agent saves the
// form editor, form_data is what they chose — including a garage name they cleared.
export function effectiveClaimData(
  summary: ClaimSummaryJson,
  opts: { garageName?: string | null } = {},
): ClaimData | null {
  if (summary?.form_data) return summary.form_data;
  if (!summary?.collected) return null;
  const data = toClaimData(summary.collected);
  if (opts.garageName && !data.garage?.name) {
    return { ...data, garage: { ...data.garage, name: opts.garageName } };
  }
  return data;
}
