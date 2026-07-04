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

// The canonical ClaimData used to fill the accident-notice form: the agent's edited
// version if present, otherwise derived from the client's submission.
export function effectiveClaimData(summary: ClaimSummaryJson): ClaimData | null {
  if (summary?.form_data) return summary.form_data;
  if (summary?.collected) return toClaimData(summary.collected);
  return null;
}
