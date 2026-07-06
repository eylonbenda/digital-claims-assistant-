import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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

  // Milestones drive claim.status — one source of truth for "where is this claim",
  // so the hero badge can't disagree with a ticked milestone. Forward-only: ticking
  // advances the lifecycle; unticking never downgrades (avoids surprise resets).
  const patch: Record<string, unknown> = { checklist_state: updated };
  if (body.done && claim.status !== "closed") {
    const SUBMIT_KEYS = new Set(["submitted_to_insurer", "submitted_to_tp_insurer"]);
    if (body.key === "payment_received") {
      patch.status = "closed";
      patch.closed_at = new Date().toISOString();
    } else if (SUBMIT_KEYS.has(body.key) && claim.status !== "submitted") {
      patch.status = "submitted";
      if (!claim.submitted_at) patch.submitted_at = new Date().toISOString();
    }
  }

  const svc = createServiceClient();
  const { error } = await svc.from("claims").update(patch).eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, status: patch.status ?? claim.status });
}
