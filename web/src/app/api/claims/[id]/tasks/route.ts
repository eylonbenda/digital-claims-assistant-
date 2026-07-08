import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/claims/[id]/tasks
// Body: { title: string, due_at?: string (ISO), note?: string }
// Agent adds an ad-hoc task to the claim's worklist (source='manual', key=null —
// manual tasks are never auto-completed by the engine).
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
  const title = typeof payload?.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return Response.json({ error: "title (non-empty string) required" }, { status: 400 });
  }
  if (title.length > 200) {
    return Response.json({ error: "title too long (max 200 chars)" }, { status: 400 });
  }
  let dueAt: string | null = null;
  if (payload.due_at != null) {
    const d = new Date(payload.due_at);
    if (isNaN(d.getTime())) {
      return Response.json({ error: "invalid due_at" }, { status: 400 });
    }
    dueAt = d.toISOString();
  }
  const note = typeof payload?.note === "string" ? payload.note.slice(0, 2000) : null;

  // RLS verification: auth-scoped select returns null if agent doesn't own this claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { data: task, error } = await svc
    .from("tasks")
    .insert({ claim_id: id, title, due_at: dueAt, note, source: "manual" })
    .select("id, key, title, status, due_at, note, source")
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  await svc.from("claim_events").insert({
    claim_id: id,
    type: "task_created",
    payload_json: { task_id: task.id, by: user.email ?? null },
  });

  return Response.json({ task });
}
