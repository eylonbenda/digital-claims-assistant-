import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// PATCH /api/claims/[id]/flags
// Body: { flag: string, value: boolean }
// Sets one circumstance flag on the claim; these gate the conditional checklist.
const ALLOWED = new Set([
  "theft",
  "lien",
  "business_use",
  "policy_activated",
  "garage_network_rider",
]);

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
  if (!body || !ALLOWED.has(body.flag) || typeof body.value !== "boolean") {
    return Response.json(
      { error: "flag (one of the circumstance columns) and value (boolean) required" },
      { status: 400 },
    );
  }

  // RLS verification: auth-scoped select returns null if agent doesn't own this claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("claims")
    .update({ [body.flag]: body.value })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
