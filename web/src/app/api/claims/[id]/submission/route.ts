import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";
import { planConfirm } from "@/lib/submission/confirm";
import { serverError } from "@/lib/observability/report";
import type { ClaimType } from "@/lib/tasks/types";

// POST /api/claims/[id]/submission
// Body: { recipient: string, subject: string, insurerKey?: string }
// Confirms the prepare-and-confirm submission: the agent sent the email from
// their own mailbox; this records it, marks the claim sent, and ticks the
// track's sent-milestone so the follow-up task spawns.
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body.recipient !== "string" || typeof body.subject !== "string") {
    return Response.json(
      { error: "recipient (string) and subject (string) required" },
      { status: 400 },
    );
  }

  const { data: claim } = await supabase
    .from("claims")
    .select("id, claim_type, handling_status, checklist_state, status")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const plan = planConfirm({
    recipient: body.recipient,
    subject: body.subject,
    insurerKey: typeof body.insurerKey === "string" ? body.insurerKey : undefined,
    current: {
      claim_type: claim.claim_type as ClaimType,
      handling_status: (claim.handling_status as string | null) ?? null,
      checklist_state: (claim.checklist_state as Record<string, boolean> | null) ?? {},
    },
    now: new Date(),
  });
  if ("error" in plan) return Response.json({ error: plan.error }, { status: 400 });

  const state = (claim.checklist_state as Record<string, boolean> | null) ?? {};
  const svc = createServiceClient();
  // Compare-and-set on "never sent": a concurrent confirm matches 0 rows → 409.
  const { error, count } = await svc
    .from("claims")
    .update(
      { ...plan.update, checklist_state: { ...state, [plan.milestone]: true } },
      { count: "exact" },
    )
    .eq("id", id)
    .is("handling_status", null);
  if (error) return serverError("/api/claims/[id]/submission", error, { claimId: id });
  if (!count) {
    return Response.json({ error: "התביעה כבר סומנה כנשלחה" }, { status: 409 });
  }

  await svc.from("claim_events").insert({
    claim_id: id,
    type: plan.event.type,
    payload_json: plan.event.payload,
  });

  const engine = await runEngine(id, {
    type: "milestone_ticked",
    key: plan.milestone,
    done: true,
  });

  return Response.json({ ok: true, status: engine?.status ?? claim.status });
}
