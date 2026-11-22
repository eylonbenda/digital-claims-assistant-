import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runEngine } from "@/lib/tasks/runner";
import { planHandlingUpdate } from "@/lib/handling/apply";
import { reportError, serverError } from "@/lib/observability/report";
import type { ClaimType } from "@/lib/tasks/types";

// PATCH /api/claims/[id]/handling
// Body: { to: HandlingStatus, note?, lawyer?, email_id? } | { close: { reason, note? } }
// email_id: the inbound email this transition answers — it is marked handled.
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

  // The email this transition answers, if any — only one filed on this claim counts.
  let emailId: string | null = null;
  if (typeof body.email_id === "string" && plan.event.type === "handling_changed") {
    const { data: email } = await supabase
      .from("claim_emails").select("id").eq("id", body.email_id).eq("claim_id", id).maybeSingle();
    emailId = (email?.id as string | undefined) ?? null;
  }

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
    payload_json: emailId ? { ...plan.event.payload, email_id: emailId } : plan.event.payload,
  });

  // The transition stands even if this fails (e.g. migration 015 not applied yet):
  // the worst case is an email that keeps asking for a status it already produced.
  if (emailId) {
    const { error: handledErr } = await svc
      .from("claim_emails")
      .update({ handled_at: new Date().toISOString(), handled_as: plan.update.handling_status })
      .eq("id", emailId);
    if (handledErr) await reportError("/api/claims/[id]/handling", handledErr, { claimId: id, step: "email_handled" });
  }

  // A reverted send leaves its follow-up task moot — close open ones so the
  // dashboard doesn't chase an insurer that never received the claim.
  if (plan.completeFollowUps) {
    await svc
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("claim_id", id)
      .neq("status", "done")
      .like("key", "follow\\_up\\_%");
  }

  // Each status has its own next step and date: swap the follow-up task for it.
  // Complete-then-insert, so the one-open-task-per-key index is never violated.
  if (plan.followUp) {
    const done = { status: "done", completed_at: new Date().toISOString() };
    await svc.from("tasks").update(done)
      .eq("claim_id", id).eq("key", plan.followUp.key).neq("status", "done");
    const { error: taskError } = await svc.from("tasks").insert({
      claim_id: id,
      key: plan.followUp.key,
      title: plan.followUp.title,
      track: claim.claim_type,
      due_at: plan.followUp.due_at,
      source: "template",
    });
    if (taskError && taskError.code !== "23505") {
      console.error("follow-up task failed:", plan.followUp.key, taskError);
    }
  }

  // A manually closed claim has nothing left to do: its engine tasks would
  // otherwise stay open forever (the engine never runs again on it).
  if (plan.completeTemplateTasks) {
    await svc
      .from("tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("claim_id", id)
      .eq("source", "template")
      .neq("status", "done");
  }

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
    handling_status:
      "handling_status" in plan.update ? plan.update.handling_status : claim.handling_status,
    status,
  });
}
