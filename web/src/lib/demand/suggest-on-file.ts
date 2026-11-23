import type { SupabaseClient } from "@supabase/supabase-js";
import { extractAppraiserAmounts } from "@/lib/ai/extract-appraiser-amounts";
import type { SniffKind } from "@/lib/files/sniff";
import { reportError } from "@/lib/observability/report";
import { EV_EXTRACTED } from "./appraiser-suggestion";
import { DEMAND_TRACK } from "./inputs";

export const APPRAISER_REPORT = "appraiser_report";

/** Only a demand claim has damages lines for the figures to land in. */
export function wantsAppraiserAmounts(docType: string, claimType: unknown): boolean {
  return docType === APPRAISER_REPORT && claimType === DEMAND_TRACK;
}

// Reads the figures off a just-filed appraiser report and records them as a
// suggestion for the clerk. Nothing is written to the claim's damages here.
// Never throws: the upload or re-file that calls this has already succeeded.
export async function recordAppraiserAmounts(
  svc: SupabaseClient,
  claimId: string,
  documentId: string,
  bytes: Uint8Array,
  kind: SniffKind,
): Promise<void> {
  const amounts = await extractAppraiserAmounts(bytes, kind);
  if (!amounts) return;
  const { error } = await svc.from("claim_events").insert({
    claim_id: claimId,
    type: EV_EXTRACTED,
    payload_json: { document_id: documentId, ...amounts },
  });
  if (error) await reportError("recordAppraiserAmounts", error, { claimId, step: "event" });
}
