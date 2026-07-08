import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";

// PATCH /api/claims/[id]/checklist
// Body: { key: string, done: boolean }
// Toggles a milestone tick in claims.checklist_state (jsonb).
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
  if (!body || typeof body.key !== "string" || typeof body.done !== "boolean") {
    return Response.json(
      { error: "key (string) and done (boolean) required" },
      { status: 400 },
    );
  }

  // RLS verification: auth-scoped select returns null if agent doesn't own this claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, checklist_state, status, submitted_at, closed_at")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const current = (claim.checklist_state as Record<string, boolean> | null) ?? {};
  const updated = { ...current, [body.key]: body.done };

  const svc = createServiceClient();
  const { error } = await svc
    .from("claims")
    .update({ checklist_state: updated })
    .eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Status transitions + task spawn/complete now live in the task engine
  // (forward-only; payment_received still closes the claim — engine rule).
  const engine = await runEngine(id, {
    type: "milestone_ticked",
    key: body.key,
    done: body.done,
  });

  return Response.json({ ok: true, status: engine?.status ?? claim.status });
}
