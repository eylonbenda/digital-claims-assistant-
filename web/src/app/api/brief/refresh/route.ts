import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrCreateBrief } from "@/lib/brief/brief";

export const runtime = "nodejs";

// POST /api/brief/refresh — recompute today's brief for the signed-in agent.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: agent } = await svc
    .from("agents")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!agent) {
    // No agent row yet → no claims → an empty brief, nothing to compute.
    return Response.json({ brief: null });
  }

  const brief = await getOrCreateBrief(agent.id, { refresh: true });
  if (!brief) return Response.json({ error: "brief failed" }, { status: 500 });
  return Response.json({ brief });
}
