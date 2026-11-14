import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { serverError } from "@/lib/observability/report";
import { parseBusinessDetails } from "@/lib/agents/details";

// The agents table has a read-own-row policy and no update policy, so writes go
// through the service client, keyed strictly on the authenticated user's id.

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("agents")
    .select("name, phone, email")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) return serverError("/api/agents/me", error);
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = parseBusinessDetails(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("agents")
    .update(parsed.value)
    .eq("auth_user_id", user.id)
    .select("name, phone, email")
    .maybeSingle();
  if (error) return serverError("/api/agents/me", error);
  if (!data) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(data);
}
