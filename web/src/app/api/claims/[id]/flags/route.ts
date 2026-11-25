import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";
import { reportError, serverError } from "@/lib/observability/report";

// PATCH /api/claims/[id]/flags
// Body: { no_repair: boolean }
// The one app-side writer of a claim circumstance flag. Deliberately an allow-list
// of exactly no_repair: the other flags (theft, lien, …) carry their own checklist
// consequences and have no handler UI yet — opening them here would be scope creep.
const ALLOWED = ["no_repair"] as const;

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
  const keys = body && typeof body === "object" ? Object.keys(body) : [];
  if (
    keys.length !== 1 ||
    !(ALLOWED as readonly string[]).includes(keys[0]) ||
    typeof body.no_repair !== "boolean"
  ) {
    return Response.json({ error: "body must be { no_repair: boolean }" }, { status: 400 });
  }
  const noRepair: boolean = body.no_repair;

  // RLS verification: auth-scoped select returns null if the caller doesn't own the claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, no_repair")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const changed = !!claim.no_repair !== noRepair;

  const svc = createServiceClient();
  const { error } = await svc.from("claims").update({ no_repair: noRepair }).eq("id", id);
  if (error) return serverError("/api/claims/[id]/flags", error, { claimId: id });

  if (changed) {
    const { error: evErr } = await svc.from("claim_events").insert({
      claim_id: id,
      type: "flags_changed",
      payload_json: { no_repair: noRepair },
    });
    if (evErr) {
      await reportError("/api/claims/[id]/flags", evErr, { claimId: id, step: "flags event" });
    }
  }

  // Dropping the repair items may clear the last blocker (opens the submit task) or
  // close the collection task; flipping back re-opens what the repair flow needs.
  await runEngine(id, { type: "flags_changed" });

  return Response.json({ ok: true, no_repair: noRepair });
}
