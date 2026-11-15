import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { planAmountsUpdate } from "@/lib/handling/amounts";
import { serverError } from "@/lib/observability/report";

// PATCH /api/claims/[id]/amounts
// Body: { demand_amount?: number | string | null, paid_amount?: number | string | null }
// Records what was demanded from the insurer and what was paid (migration 012).
// Allowed on closed claims too — a payment amount is often filled in afterwards.
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

  const plan = planAmountsUpdate(await request.json().catch(() => null));
  if ("error" in plan) return Response.json({ error: plan.error }, { status: 400 });

  // RLS probe: auth-scoped select returns null if the agent doesn't own this claim.
  const { data: claim } = await supabase.from("claims").select("id").eq("id", id).single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { error } = await svc.from("claims").update(plan.update).eq("id", id);
  if (error) return serverError("/api/claims/[id]/amounts", error, { claimId: id });

  await svc.from("claim_events").insert({
    claim_id: id,
    type: "amounts_updated",
    payload_json: plan.update,
  });

  return Response.json({ ok: true, ...plan.update });
}
