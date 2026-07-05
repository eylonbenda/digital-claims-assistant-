import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/claims/[id]/notes
// Body: { body: string }
// Adds a timestamped agent note to the claim's case file.
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

  const payload = await request.json().catch(() => null);
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!body) {
    return Response.json({ error: "body (non-empty string) required" }, { status: 400 });
  }
  if (body.length > 2000) {
    return Response.json({ error: "note too long (max 2000 chars)" }, { status: 400 });
  }

  // RLS verification: auth-scoped select returns null if agent doesn't own this claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { data: note, error } = await svc
    .from("claim_notes")
    .insert({ claim_id: id, body })
    .select("id, body, created_at")
    .single();
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ note });
}
