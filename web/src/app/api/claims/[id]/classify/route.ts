import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";

const VALID_TYPES = new Set([
  "own_policy",
  "third_party_report",
  "third_party_settlement",
  "unknown",
]);

// PATCH /api/claims/[id]/classify
// Body: { claim_type: ClaimType }
// The agent confirms (or overrides) the proposed track. Moves a submitted claim to
// "classified" so the rest of the pipeline (checklist) keys off a real track.
export async function PATCH(
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
  const claimType = body?.claim_type;
  if (typeof claimType !== "string" || !VALID_TYPES.has(claimType)) {
    return Response.json({ error: "invalid claim_type" }, { status: 400 });
  }

  // RLS verify ownership via the auth client.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, status")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("claims")
    .update({ claim_type: claimType })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await svc.from("claim_events").insert({
    claim_id: id,
    type: "classified",
    payload_json: { claim_type: claimType, by: user.email ?? null },
  });

  // Reactive task engine: spawn track tasks + advance status (forward-only).
  const engine = await runEngine(id, { type: "track_confirmed" });

  return Response.json({
    ok: true,
    claim_type: claimType,
    status: engine?.status ?? claim.status,
  });
}
