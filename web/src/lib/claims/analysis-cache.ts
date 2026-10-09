import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { analyzeClaim, type ClaimAnalysis } from "@/lib/ai/analyze";
import { toClaimData, type State } from "@/lib/collection/claim-state";
import type { ClaimData } from "@/lib/formfill/types";
import { reportError } from "@/lib/observability/report";

export type SummaryJson = {
  collected?: State;
  analysis?: ClaimAnalysis;
  analysis_input_hash?: string;
} | null;

// Hash of the exact classifier input, so a later data edit invalidates a stale cache.
function hashInput(data: ClaimData): string {
  return createHash("sha1").update(JSON.stringify(data)).digest("hex");
}

// Render-path read: the persisted analysis when it's still fresh (input unchanged),
// else null. Never calls the model — a render must not wait on an adaptive-thinking
// call (the cockpit has no Suspense boundary; a cold claim used to hold the whole
// page for the length of the call). Callers degrade to structured-only
// classification on null and schedule warmAnalysis() via after().
export function readCachedAnalysis(summaryJson: SummaryJson): ClaimAnalysis | null {
  const collected = summaryJson?.collected;
  if (!collected || !summaryJson?.analysis) return null;
  return summaryJson.analysis_input_hash === hashInput(toClaimData(collected))
    ? summaryJson.analysis
    : null;
}

// Whether warmAnalysis() has anything to do for this snapshot.
export function needsAnalysis(summaryJson: SummaryJson): boolean {
  return (
    !!summaryJson?.collected &&
    !!process.env.ANTHROPIC_API_KEY &&
    readCachedAnalysis(summaryJson) === null
  );
}

// Off-render: compute the analysis and persist it into summary_json.analysis. Run it
// from after() (at submit, and on a cockpit view that found the cache cold).
// Best-effort — failures are logged and the next view schedules another attempt.
export async function warmAnalysis(claimId: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return;
  // Repeat views of a cold claim each schedule a warm; don't pay for the same
  // model call twice on one instance. (Cross-instance duplicates remain possible.)
  if (inFlight.has(claimId)) return;
  inFlight.add(claimId);
  try {
    await warm(claimId);
  } finally {
    inFlight.delete(claimId);
  }
}

const inFlight = new Set<string>();

async function warm(claimId: string): Promise<void> {
  const svc = createServiceClient();

  const read = async () => {
    const { data, error } = await svc
      .from("claims")
      .select("summary_json")
      .eq("id", claimId)
      .single();
    if (error) throw new Error(`read summary_json: ${error.message}`);
    return (data?.summary_json ?? null) as SummaryJson;
  };

  try {
    const before = await read();
    const collected = before?.collected;
    if (!collected || readCachedAnalysis(before)) return; // nothing to do / already warm

    const data = toClaimData(collected);
    const inputHash = hashInput(data);
    const analysis = await analyzeClaim(data);

    // The model call takes a while; summary_json may have changed meanwhile (e.g. the
    // agent saved form_data). Re-read right before writing and merge onto the fresh
    // copy so this write doesn't revert it. The remaining window is milliseconds; a
    // truly atomic key-scoped write is improvement-log item 0930-17.
    const current = await read();
    if (current?.collected && hashInput(toClaimData(current.collected)) !== inputHash) {
      return; // input changed while we were computing — this result is already stale
    }
    const { error } = await svc
      .from("claims")
      .update({ summary_json: { ...(current ?? {}), analysis, analysis_input_hash: inputHash } })
      .eq("id", claimId);
    if (error) throw new Error(`write analysis: ${error.message}`);
  } catch (e) {
    await reportError("analysis warm", e, { claimId });
  }
}
