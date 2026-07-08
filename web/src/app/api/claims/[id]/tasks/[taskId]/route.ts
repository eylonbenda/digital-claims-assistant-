import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const VALID_STATUSES = new Set(["todo", "in_progress", "blocked", "done"]);

// PATCH /api/claims/[id]/tasks/[taskId]
// Body: { status?: TaskStatus, due_at?: string | null, note?: string | null }
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const { id, taskId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload || (payload.status === undefined && payload.due_at === undefined && payload.note === undefined)) {
    return Response.json(
      { error: "at least one of status / due_at / note required" },
      { status: 400 },
    );
  }

  const patch: Record<string, unknown> = {};
  if (payload.status !== undefined) {
    if (typeof payload.status !== "string" || !VALID_STATUSES.has(payload.status)) {
      return Response.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = payload.status;
    // completed_at tracks the done flag both ways (reopen clears it)
    patch.completed_at = payload.status === "done" ? new Date().toISOString() : null;
  }
  if (payload.due_at !== undefined) {
    if (payload.due_at === null) {
      patch.due_at = null;
    } else {
      const d = new Date(payload.due_at);
      if (isNaN(d.getTime())) {
        return Response.json({ error: "invalid due_at" }, { status: 400 });
      }
      patch.due_at = d.toISOString();
    }
  }
  if (payload.note !== undefined) {
    patch.note = payload.note === null ? null : String(payload.note).slice(0, 2000);
  }

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
    .update(patch)
    .eq("id", taskId)
    .eq("claim_id", id) // scope to this claim — taskId alone is not trusted
    .select("id, key, title, status, due_at, note, source")
    .single();
  if (error || !task) {
    return Response.json({ error: error?.message ?? "task not found" }, { status: 404 });
  }

  await svc.from("claim_events").insert({
    claim_id: id,
    type: "task_updated",
    payload_json: { task_id: taskId, patch, by: user.email ?? null },
  });

  return Response.json({ task });
}
