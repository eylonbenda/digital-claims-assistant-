import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";
import { planHandlingUpdate } from "@/lib/handling/apply";
import { serverError } from "@/lib/observability/report";
import type { ClaimType } from "@/lib/tasks/types";

// PATCH /api/claims/[id]/handling
// Body: { to: HandlingStatus, note?, lawyer? } | { close: { reason, note? } }
// Evidence-gated handling transitions (spec: docs/superpowers/specs/2026-10-21-claim-handling-design.md).
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
  if (
    !body ||
    (typeof body.to !== "string" && typeof body.close !== "object" && body.revert !== true)
  ) {
    return Response.json(
      { error: "to (string), close (object) or revert (true) required" },
      { status: 400 },
    );
  }

  // RLS probe: auth-scoped select returns null if the agent doesn't own this claim.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, handling_status, checklist_state, claim_type, status, summary_json")
    .eq("id", id)
    .single();
  if (!claim) return Response.json({ error: "not found" }, { status: 404 });

  const svc = createServiceClient();
  const { data: docs } = await svc
    .from("claim_documents")
    .select("type")
    .eq("claim_id", id);

  const plan = planHandlingUpdate({
    to: body.to,
    close: body.close,
    revert: body.revert === true,
    note: typeof body.note === "string" ? body.note : undefined,
    lawyer: body.lawyer,
    current: {
      handling_status: (claim.handling_status as string | null) ?? null,
      checklist_state: (claim.checklist_state as Record<string, boolean> | null) ?? {},
      claim_type: claim.claim_type as ClaimType,
      status: claim.status as string,
    },
    docs: (docs ?? []).map((d) => ({ type: d.type as string })),
    now: new Date(),
  });
  if ("error" in plan) return Response.json({ error: plan.error }, { status: 400 });

  const update: Record<string, unknown> = { ...plan.update };
  if (plan.summaryPatch) {
    const summary = (claim.summary_json as Record<string, unknown> | null) ?? {};
    const prevHandling = (summary.handling as Record<string, unknown> | undefined) ?? {};
    update.summary_json = {
      ...summary,
      handling: { ...prevHandling, ...(plan.summaryPatch.handling as Record<string, unknown>) },
    };
  }
  if (plan.milestoneTick || plan.milestoneUntick) {
    const state = (claim.checklist_state as Record<string, boolean> | null) ?? {};
    update.checklist_state = {
      ...state,
      ...(plan.milestoneTick ? { [plan.milestoneTick]: true } : {}),
      ...(plan.milestoneUntick ? { [plan.milestoneUntick]: false } : {}),
    };
  }

  // Compare-and-set on the handling status we validated against (Review-Focus 1):
  // a concurrent transition makes this match 0 rows → 409, never a blind overwrite.
  let q = svc.from("claims").update(update, { count: "exact" }).eq("id", id);
  q =
    claim.handling_status === null
      ? q.is("handling_status", null)
      : q.eq("handling_status", claim.handling_status);
  const { error, count } = await q;
  if (error) return serverError("/api/claims/[id]/handling", error, { claimId: id });
  if (!count) {
    return Response.json(
      { error: "הסטטוס השתנה בינתיים — רעננו ונסו שוב" },
      { status: 409 },
    );
  }

  await svc.from("claim_events").insert({
    claim_id: id,
    type: plan.event.type,
    payload_json: plan.event.payload,
  });

  let status: string = claim.status as string;
  if (plan.update.status === "closed") status = "closed";
  const milestoneEvent = plan.milestoneTick
    ? { key: plan.milestoneTick, done: true }
    : plan.milestoneUntick
      ? { key: plan.milestoneUntick, done: false }
      : null;
  if (milestoneEvent) {
    const engine = await runEngine(id, { type: "milestone_ticked", ...milestoneEvent });
    if (engine) status = engine.status;
  }

  return Response.json({
    ok: true,
    handling_status: plan.update.handling_status ?? claim.handling_status,
    status,
  });
}
