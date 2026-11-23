import type { SupabaseClient } from "@supabase/supabase-js";
import { extractAppraiserAmounts, extractAssessorFee } from "@/lib/ai/extract-appraiser-amounts";
import type { SniffKind } from "@/lib/files/sniff";
import { reportError } from "@/lib/observability/report";
import {
  APPRAISER_REPORT,
  ASSESSOR_FEE_INVOICE,
  EV_EXTRACTED,
  isSourceDocType,
  type SourceDocType,
} from "./appraiser-suggestion";
import { DEMAND_TRACK } from "./inputs";

type Figures = { verified: boolean } & Record<string, number | boolean | null>;

const READERS: Record<SourceDocType, (bytes: Uint8Array, kind: SniffKind) => Promise<Figures | null>> = {
  [APPRAISER_REPORT]: extractAppraiserAmounts,
  [ASSESSOR_FEE_INVOICE]: extractAssessorFee,
};

/** Only a demand claim has damages lines for the figures to land in. */
export function wantsDocAmounts(docType: string, claimType: unknown): docType is SourceDocType {
  return isSourceDocType(docType) && claimType === DEMAND_TRACK;
}

// Reads the figures off a just-filed appraiser report or fee invoice and records
// them as a suggestion for the clerk. Nothing is written to the claim's damages here.
// Never throws: the upload or re-file that calls this has already succeeded.
export async function recordDocAmounts(
  svc: SupabaseClient,
  claimId: string,
  documentId: string,
  docType: SourceDocType,
  bytes: Uint8Array,
  kind: SniffKind,
): Promise<void> {
  const figures = await READERS[docType](bytes, kind);
  if (!figures) return;
  const { error } = await svc.from("claim_events").insert({
    claim_id: claimId,
    type: EV_EXTRACTED,
    payload_json: { document_id: documentId, doc_type: docType, ...figures },
  });
  if (error) await reportError("recordDocAmounts", error, { claimId, step: "event" });
}
