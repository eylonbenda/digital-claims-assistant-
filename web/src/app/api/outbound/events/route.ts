import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { SEND_RULES } from "@/lib/outbound/rules";

// POST /api/outbound/events
// Body: { claim_id, task_id?, task_key, kind: 'sent' | 'skipped', body? }
// Records an outbound-queue decision. body_snapshot is stored only for
// kind='sent' — it is the audit copy of what actually went out (spec §3).
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const claimId = typeof payload?.claim_id === "string" ? payload.claim_id : "";
  const taskId = typeof payload?.task_id === "string" ? payload.task_id : null;
  const taskKey = typeof payload?.task_key === "string" ? payload.task_key : "";
  const kind = payload?.kind;
  const body = typeof payload?.body === "string" ? payload.body : null;

  if (!claimId || !(taskKey in SEND_RULES) || (kind !== "sent" && kind !== "skipped")) {
    return Response.json(
      { error: "claim_id, known task_key, and kind ('sent' | 'skipped') required" },
      { status: 400 },
    );
  }

  // RLS ownership probe: auth-scoped select returns null unless this agent
  // owns the claim.
  const { data: claim } = await supabase.from("claims").select("id").eq("id", claimId).single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  // task_id is advisory (kept for the audit trail; FK ON DELETE SET NULL) —
  // verify it belongs to this claim rather than trusting the client.
  let verifiedTaskId: string | null = null;
  if (taskId) {
    const { data: t } = await supabase
      .from("tasks").select("id").eq("id", taskId).eq("claim_id", claimId).maybeSingle();
    verifiedTaskId = t?.id ?? null;
  }

  const svc = createServiceClient();
  const { error } = await svc.from("outbound_events").insert({
    claim_id: claimId,
    task_id: verifiedTaskId,
    task_key: taskKey,
    kind,
    recipient_kind: "client",
    channel: "whatsapp",
    actor: "agent",
    body_snapshot: kind === "sent" ? body : null,
  });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
