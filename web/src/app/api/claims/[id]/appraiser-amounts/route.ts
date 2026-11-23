import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { EV_RESOLVED } from "@/lib/demand/appraiser-suggestion";
import { serverError } from "@/lib/observability/report";

const OUTCOMES = new Set(["applied", "dismissed"]);

// POST /api/claims/[id]/appraiser-amounts
// Body: { document_id: string, outcome: "applied" | "dismissed" }
// Records what the clerk did with the figures read from an appraiser report. The
// amounts themselves are saved through PATCH …/form-data; this only closes the
// suggestion and keeps the answer for measuring extraction accuracy.
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

  const body = await request.json().catch(() => null);
  const documentId = body && typeof body.document_id === "string" ? body.document_id : null;
  const outcome = body && typeof body.outcome === "string" ? body.outcome : null;
  if (!documentId || !outcome || !OUTCOMES.has(outcome)) {
    return Response.json({ error: "document_id and outcome are required" }, { status: 400 });
  }

  // RLS probe: null when the claim is not this user's.
  const { data: claim } = await supabase.from("claims").select("id").eq("id", id).maybeSingle();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { error } = await svc.from("claim_events").insert({
    claim_id: id,
    type: EV_RESOLVED,
    payload_json: { document_id: documentId, outcome },
  });
  if (error) return serverError("/api/claims/[id]/appraiser-amounts", error, { claimId: id });

  return Response.json({ ok: true });
}
