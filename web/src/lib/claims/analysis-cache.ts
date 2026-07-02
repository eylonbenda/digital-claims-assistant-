import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { analyzeClaim, type ClaimAnalysis } from "@/lib/ai/analyze";
import { toClaimData, type State } from "@/lib/collection/claim-state";
import type { ClaimData } from "@/lib/formfill/types";

export type SummaryJson = {
  collected?: State;
  analysis?: ClaimAnalysis;
  analysis_input_hash?: string;
} | null;

// Hash of the exact classifier input, so a later data edit invalidates a stale cache.
function hashInput(data: ClaimData): string {
  return createHash("sha1").update(JSON.stringify(data)).digest("hex");
}

// Lazy cache for the AI analysis. Returns the persisted analysis when it's still fresh
// (input unchanged); otherwise computes it once, persists it into summary_json.analysis,
// and returns it. Best-effort: returns null when there's no collected data, the AI isn't
// configured, or the call fails — the caller then degrades to structured-only classification.
export async function getOrCreateAnalysis(
  claimId: string,
  summaryJson: SummaryJson,
): Promise<ClaimAnalysis | null> {
  const collected = summaryJson?.collected;
  if (!collected) return null;

  const data = toClaimData(collected);
  const inputHash = hashInput(data);

  // Fresh cache hit — no API call.
  if (summaryJson?.analysis && summaryJson.analysis_input_hash === inputHash) {
    return summaryJson.analysis;
  }

  if (!process.env.ANTHROPIC_API_KEY) return null;

  let analysis: ClaimAnalysis;
  try {
    analysis = await analyzeClaim(data);
  } catch {
    return null; // degrade gracefully — structured-only classification still works
  }

  // Persist alongside collected (merge, never clobber). Best-effort: a write failure
  // still returns the fresh analysis for this render; next view will retry.
  try {
    const svc = createServiceClient();
    await svc
      .from("claims")
      .update({
        summary_json: { ...(summaryJson ?? {}), analysis, analysis_input_hash: inputHash },
      })
      .eq("id", claimId);
  } catch {
    // ignore
  }

  return analysis;
}
