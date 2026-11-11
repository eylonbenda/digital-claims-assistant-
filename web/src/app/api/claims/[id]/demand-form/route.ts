import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { generateDemandForm } from "@/lib/demand/generate";
import { DEMAND_TRACK, parseDemandFormBody } from "@/lib/demand/inputs";
import { serverError } from "@/lib/observability/report";

export const runtime = "nodejs"; // the PDF render reads the Hebrew font from disk

const WHERE = "/api/claims/[id]/demand-form";

// POST /api/claims/[id]/demand-form
// Body: { at_fault_insurer?: string } — a directory key; persisted before (re)generating.
// Generates the claim's demand form (third_party_report only) and replaces any prior one.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = parseDemandFormBody(await request.json().catch(() => null));
  if (!body.ok) return Response.json({ error: "invalid at_fault_insurer" }, { status: 400 });

  // RLS verify ownership via the auth client — a foreign id returns null.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, claim_type")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });
  if (claim.claim_type !== DEMAND_TRACK) {
    return Response.json({ error: "demand form is for third_party_report claims only" }, { status: 409 });
  }

  if (body.atFaultInsurer) {
    const svc = createServiceClient();
    const { error } = await svc
      .from("claims")
      .update({ at_fault_insurer: body.atFaultInsurer })
      .eq("id", id);
    if (error) return serverError(WHERE, error, { claimId: id, step: "at_fault_insurer" });
  }

  const result = await generateDemandForm(id);
  if (!result.ok) {
    if (result.reason === "not_third_party_report") {
      return Response.json({ error: "demand form is for third_party_report claims only" }, { status: 409 });
    }
    if (result.reason === "not_found") return Response.json({ error: "not found" }, { status: 404 });
    // Already reported inside generateDemandForm; answer with the generic 500.
    return serverError(WHERE, "demand form generation failed", { claimId: id });
  }
  return Response.json({ ok: true });
}
