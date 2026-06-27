import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // RLS on the anon client automatically filters to this agent's claims.
  const { data: claims, error } = await supabase
    .from("claims")
    .select(
      "id, client_name, client_phone, claim_type, status, urgent, created_at, submitted_at, access_token"
    )
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(claims ?? []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { client_name, client_phone } = body as {
    client_name?: string;
    client_phone?: string;
  };

  // Service role to find/create the agents row (no INSERT policy needed on anon client).
  const svc = createServiceClient();
  let agentId: string;

  const { data: existing } = await svc
    .from("agents")
    .select("id")
    .eq("auth_user_id", user.id)
    .single();

  if (existing) {
    agentId = existing.id;
  } else {
    const { data: created, error: agentErr } = await svc
      .from("agents")
      .insert({ auth_user_id: user.id, email: user.email ?? null })
      .select("id")
      .single();
    if (agentErr || !created) {
      return Response.json({ error: "failed to create agent profile" }, { status: 500 });
    }
    agentId = created.id;
  }

  const { data: claim, error } = await svc
    .from("claims")
    .insert({
      agent_id: agentId,
      client_name: client_name ?? null,
      client_phone: client_phone ?? null,
    })
    .select("id, access_token")
    .single();

  if (error || !claim) {
    return Response.json({ error: error?.message ?? "failed to create claim" }, { status: 500 });
  }

  return Response.json(
    { id: claim.id, access_token: claim.access_token, link: `/c/${claim.access_token}` },
    { status: 201 }
  );
}
