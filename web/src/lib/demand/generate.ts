import { createServiceClient } from "@/lib/supabase/service";
import { effectiveClaimData, type ClaimSummaryJson } from "@/lib/formfill/effective";
import { MILESTONE_EVENT } from "@/lib/claims/milestone-dates";
import { FORM_KIND } from "@/lib/forms/kinds";
import { runEngine } from "@/lib/tasks/runner";
import { reportError } from "@/lib/observability/report";
import { buildDemandData } from "./data";
import { renderDemandPdf } from "./render";
import { DEMAND_TRACK, demandInputs } from "./inputs";

const BUCKET = "claim-docs";
const WHERE = "lib/demand/generate";

export type GenerateDemandResult =
  | { ok: true; storagePath: string }
  | { ok: false; reason: "not_third_party_report" | "not_found" | "error" };

// Build, render and store the claim's one demand form (spec Decisions 2, 5, 7, 8).
// Service role: callers must have checked ownership. Never throws — a failure is
// reported (ids only, never claim content) and returned as { ok: false, reason: "error" }.
export async function generateDemandForm(claimId: string): Promise<GenerateDemandResult> {
  try {
    const svc = createServiceClient();

    const { data: claim, error: claimErr } = await svc
      .from("claims")
      .select("id, claim_type, agent_id, at_fault_insurer, summary_json")
      .eq("id", claimId)
      .maybeSingle();
    if (claimErr) throw claimErr;
    if (!claim) return { ok: false, reason: "not_found" };
    if (claim.claim_type !== DEMAND_TRACK) return { ok: false, reason: "not_third_party_report" };

    const [agentRes, tpRes, evRes, priorRes] = await Promise.all([
      claim.agent_id
        ? svc.from("agents").select("name, phone, email").eq("id", claim.agent_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      svc.from("third_parties").select("insurer").eq("claim_id", claimId),
      svc
        .from("claim_events")
        .select("type, payload_json, created_at")
        .eq("claim_id", claimId)
        .eq("type", MILESTONE_EVENT),
      svc
        .from("generated_forms")
        .select("id, storage_path")
        .eq("claim_id", claimId)
        .eq("kind", FORM_KIND.demand),
    ]);
    for (const r of [agentRes, tpRes, evRes, priorRes]) if (r.error) throw r.error;

    const inputs = demandInputs({
      atFaultInsurer: (claim.at_fault_insurer as string | null) ?? null,
      tpInsurers: (tpRes.data ?? []).map((t) => (t.insurer as string | null) ?? null),
      agent: agentRes.data as { name: string | null; phone: string | null; email: string | null } | null,
      events: (evRes.data ?? []) as { type: string; payload_json: unknown; created_at: string }[],
    });
    const doc = buildDemandData({
      data: effectiveClaimData(claim.summary_json as ClaimSummaryJson),
      ...inputs,
      now: new Date(),
    });
    const pdf = await renderDemandPdf(doc);

    // Upload + insert the new copy before removing the old one, so a failed upload
    // never leaves the claim without its demand form.
    const storagePath = `${claimId}/forms/demand-${Date.now()}.pdf`;
    const { error: upErr } = await svc.storage
      .from(BUCKET)
      .upload(storagePath, pdf, { contentType: "application/pdf", upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await svc.from("generated_forms").insert({
      claim_id: claimId,
      kind: FORM_KIND.demand,
      insurer: null,
      storage_path: storagePath,
    });
    if (insErr) {
      await svc.storage.from(BUCKET).remove([storagePath]);
      throw insErr;
    }

    const prior = priorRes.data ?? [];
    if (prior.length) {
      // Best-effort cleanup: a leftover old row is harmless next to the new one.
      const { error: rmErr } = await svc.storage.from(BUCKET).remove(prior.map((p) => p.storage_path as string));
      if (rmErr) await reportError(WHERE, rmErr, { claimId, step: "remove prior objects" });
      const { error: delErr } = await svc.from("generated_forms").delete().in("id", prior.map((p) => p.id as string));
      if (delErr) await reportError(WHERE, delErr, { claimId, step: "delete prior rows" });
    }

    await runEngine(claimId, { type: "doc_uploaded", docType: FORM_KIND.demand });
    return { ok: true, storagePath };
  } catch (e) {
    await reportError(WHERE, e, { claimId }).catch(() => {});
    return { ok: false, reason: "error" };
  }
}
