import { createServiceClient } from "@/lib/supabase/service";
import { templates, fillForm } from "@/lib/formfill";
import { toClaimData, type State } from "@/lib/collection/claim-state";
import { after } from "next/server";
import { runEngine } from "@/lib/tasks/runner";
import { warmAnalysis } from "@/lib/claims/analysis-cache";
import { ALREADY_SUBMITTED, SUBMITTED_STATUSES, parseSubmitBody } from "@/lib/collection/submit";
import { reportError, serverError } from "@/lib/observability/report";

export const runtime = "nodejs"; // form-fill reads the template PDF + font from disk
// Bounds the post-response analysis warm (after()); the claimant's request itself
// returns long before this.
export const maxDuration = 60;

const BUCKET = "claim-docs";

export async function POST(request: Request) {
  const body = parseSubmitBody(await request.json().catch(() => null));
  if (!body) {
    return Response.json({ error: "token and collected are required" }, { status: 400 });
  }
  const { token, collected } = body;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Local demo mode only. In a deployed env a missing key must fail loudly — a fake
    // "ok" makes the wizard clear the claimant's answers while nothing was stored.
    if (process.env.NODE_ENV === "production") {
      await reportError("/api/claims/submit", "Supabase env missing in production");
      return Response.json({ error: "not configured" }, { status: 503 });
    }
    return Response.json({ ok: true, demo: true });
  }

  const svc = createServiceClient();

  const { data: claim } = await svc
    .from("claims")
    .select("id, status, created_at, summary_json")
    .eq("access_token", token)
    .single();

  if (!claim) return Response.json({ error: "invalid token" }, { status: 404 });
  if (SUBMITTED_STATUSES.has(claim.status)) {
    return Response.json({ error: "already submitted", code: ALREADY_SUBMITTED }, { status: 409 });
  }

  const insured = (collected?.insured ?? {}) as Record<string, string>;
  const thirdParty = (collected?.thirdParty ?? {}) as Record<string, unknown>;
  // "unknown" is the wizard's "client isn't sure" sentinel — store as no insurer;
  // the raw value is still preserved in summary_json.collected.
  const rawInsurer = (collected?.policyInsurer as string) || null;
  const policyInsurer = rawInsurer === "unknown" ? null : rawInsurer;

  const clientName =
    [insured.first_name, insured.last_name].filter(Boolean).join(" ") || null;

  // Carry the funnel forward. summary_json is replaced by { collected } here, which
  // drops summary_json.draft — and with it how far this claimant had to travel. A
  // completed session that stalled at documents is exactly as interesting as an
  // abandoned one, so keep the compact record instead of losing it at the finish line.
  const prevDraft =
    ((claim.summary_json as Record<string, unknown> | null)?.draft as Record<string, unknown> | null) ??
    {};
  const deferred = Object.entries(
    (collected?.docsDeferred ?? {}) as Record<string, boolean>,
  )
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  const funnel = {
    completed: true,
    max_step_key: "summary",
    ...(typeof prevDraft.first_saved_at === "string"
      ? { first_saved_at: prevDraft.first_saved_at }
      : {}),
    submitted_at: new Date().toISOString(),
    ...(deferred.length ? { docs_deferred: deferred } : {}),
  };

  // Persist collected data; summary_json.analysis filled later by AI flow.
  // Compare-and-set on the status we read: of two concurrent submits (double tap,
  // two tabs, a retry racing the original) exactly one flips the row and runs the
  // side-effects below; the other gets the same "already submitted" as a late retry.
  const { data: flipped, error: updateErr } = await svc
    .from("claims")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      client_name: clientName,
      client_phone: insured.mobile || null,
      policy_insurer: policyInsurer,
      fault: (collected?.fault as string) || null,
      summary_json: { collected, funnel },
    })
    .eq("id", claim.id)
    .eq("status", claim.status)
    .select("id");

  if (updateErr) {
    // The claimant's answers were NOT stored. Fail so the wizard keeps its local copy.
    return serverError("/api/claims/submit", updateErr, { claimId: claim.id, step: "claim update" });
  }
  if (!flipped?.length) {
    return Response.json({ error: "already submitted", code: ALREADY_SUBMITTED }, { status: 409 });
  }

  // Everything below is best-effort: the submission itself is committed, and the
  // collected data (incl. third party) lives in summary_json regardless. Failures are
  // reported, not returned — the claimant can't fix them and a retry would just 409.
  const logFailure = async (step: string, error: { message: string } | null) => {
    if (error) await reportError("/api/claims/submit", error, { claimId: claim.id, step });
  };

  // Auto-generate the accident-notice form once, here, when we have a coordinate
  // template for the claimant's insurer. Stored in the case file so the agent never
  // regenerates it. Best-effort: a fill failure must not fail the submission.
  if (policyInsurer && policyInsurer in templates) {
    try {
      const template = templates[policyInsurer as keyof typeof templates];
      const pdf = await fillForm(template, toClaimData(collected as unknown as State));
      const formPath = `${claim.id}/forms/${policyInsurer}-${Date.now()}.pdf`;
      const { error: upErr } = await svc.storage
        .from(BUCKET)
        .upload(formPath, new Uint8Array(pdf), {
          contentType: "application/pdf",
          upsert: false,
        });
      await logFailure("form upload", upErr);
      if (!upErr) {
        const { error: formErr } = await svc.from("generated_forms").insert({
          claim_id: claim.id,
          kind: "accident_notice",
          insurer: policyInsurer,
          storage_path: formPath,
        });
        await logFailure("generated_forms insert", formErr);
        const { error: evErr } = await svc.from("claim_events").insert({
          claim_id: claim.id,
          type: "form_generated",
          payload_json: { insurer: policyInsurer },
        });
        await logFailure("form_generated event", evErr);
      }
    } catch (e) {
      // The agent can still fill on demand from the dashboard.
      await logFailure("form fill", { message: e instanceof Error ? e.message : String(e) });
    }
  }

  if (thirdParty.present) {
    const { error: tpErr } = await svc.from("third_parties").insert({
      claim_id: claim.id,
      name: (thirdParty.name as string) || null,
      phone: (thirdParty.phone as string) || null,
      plate: (thirdParty.plate as string) || null,
      insurer: (thirdParty.insurer as string) || null,
    });
    await logFailure("third_parties insert", tpErr);
  }

  const { error: submittedEvErr } = await svc.from("claim_events").insert({
    claim_id: claim.id,
    type: "submitted",
    payload_json: { sections: Object.keys(collected) },
  });
  await logFailure("submitted event", submittedEvErr);

  // Reactive task engine: spawn the doc-chase task if base docs are missing.
  await runEngine(claim.id, { type: "claim_submitted" });

  // Warm the AI analysis now, after the claimant has their response, so the agent's
  // first open of this claim reads it from cache instead of waiting on the model.
  const claimId = claim.id;
  after(() => warmAnalysis(claimId));

  return Response.json({ ok: true });
}
