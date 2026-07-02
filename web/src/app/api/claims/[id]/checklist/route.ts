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
    .select("id, checklist_state")
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

  return Response.json({ ok: true });
}
