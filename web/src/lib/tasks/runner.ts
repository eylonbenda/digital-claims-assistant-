import { createServiceClient } from "@/lib/supabase/service";
import { computeChecklist } from "@/lib/claims/checklist";
import { advanceTasks } from "./engine";
import {
  STATUS_ORDER,
  type ClaimStatus,
  type ClaimType,
  type EngineEvent,
  type TaskRow,
} from "./types";

// Fetch → advanceTasks (pure) → apply. Called inline from mutation routes.
// Best-effort by contract: a task-engine failure must never fail the mutation
// that triggered it, so this catches everything and returns null.
export async function runEngine(
  claimId: string,
  event: EngineEvent,
): Promise<{ status: ClaimStatus } | null> {
  try {
    const svc = createServiceClient();

    const [
      { data: claim },
      { data: docs },
      { count: formCount },
      { data: taskRows },
      { data: tpRows },
    ] = await Promise.all([
      svc
        .from("claims")
        .select(
          "id, claim_type, status, at_fault_insurer, checklist_state, submitted_at, theft, lien, business_use, policy_activated, garage_network_rider",
        )
        .eq("id", claimId)
        .single(),
      svc.from("claim_documents").select("type").eq("claim_id", claimId),
      svc
        .from("generated_forms")
        .select("id", { count: "exact", head: true })
        .eq("claim_id", claimId),
      svc
        .from("tasks")
        .select("id, key, title, status, due_at, source")
        .eq("claim_id", claimId)
        .neq("status", "done"),
      svc.from("third_parties").select("insurer").eq("claim_id", claimId),
    ]);
    if (!claim) return null;

    const hasForm = (formCount ?? 0) > 0;
    const checklist = computeChecklist(
      claim.claim_type,
      new Set((docs ?? []).map((d) => d.type as string)),
      hasForm,
      (claim.checklist_state as Record<string, boolean> | null) ?? {},
      {
        theft: !!claim.theft,
        lien: !!claim.lien,
        business_use: !!claim.business_use,
        policy_activated: !!claim.policy_activated,
        garage_network_rider: !!claim.garage_network_rider,
      },
    );

    // The TP insurer lives in third_parties (written at submit), not claims.at_fault_insurer
    // (which no route populates). Prefer it; fall back to the claims column for forward-compat.
    const atFaultInsurer =
      (tpRows ?? []).map((t) => t.insurer).find((v) => !!v) ?? claim.at_fault_insurer ?? null;

    const result = advanceTasks({
      claim: {
        claimType: claim.claim_type as ClaimType,
        status: claim.status as ClaimStatus,
        atFaultInsurer,
      },
      checklist,
      hasGeneratedForm: hasForm,
      openTasks: (taskRows ?? []) as TaskRow[],
      event,
      now: new Date(),
    });

    const events: { claim_id: string; type: string; payload_json: unknown }[] = [];

    for (const s of result.spawn) {
      // The partial unique index backstops concurrent requests: a duplicate
      // insert fails with 23505 and we simply skip its event row.
      const { error } = await svc.from("tasks").insert({
        claim_id: claimId,
        key: s.key,
        title: s.title,
        track: s.track,
        due_at: s.due_at,
        source: "template",
      });
      if (error) {
        if (error.code !== "23505") console.error("task spawn failed:", s.key, error);
      } else {
        events.push({
          claim_id: claimId,
          type: "task_spawned",
          payload_json: { key: s.key, due_at: s.due_at },
        });
      }
    }

    if (result.complete.length) {
      const { error } = await svc
        .from("tasks")
        .update({ status: "done", completed_at: new Date().toISOString() })
        .in("id", result.complete);
      if (error) {
        if (error.code !== "23505") console.error("task complete failed:", result.complete, error);
      } else {
        for (const id of result.complete) {
          events.push({
            claim_id: claimId,
            type: "task_completed",
            payload_json: { task_id: id },
          });
        }
      }
    }

    let status = claim.status as ClaimStatus;
    if (result.statusAdvance) {
      const patch: Record<string, unknown> = { status: result.statusAdvance };
      if (result.statusAdvance === "closed") patch.closed_at = new Date().toISOString();
      // Milestone-driven advances can pass 'submitted' without the client
      // wizard ever submitting — stamp submitted_at so day-counters work.
      if (
        STATUS_ORDER[result.statusAdvance] >= STATUS_ORDER.submitted &&
        !claim.submitted_at
      ) {
        patch.submitted_at = new Date().toISOString();
      }
      // Compare-and-set: only apply if status hasn't moved since our read.
      // A stale read matches 0 rows and the update is a no-op; the next
      // event re-derives from the (now current) status. count lets us tell a
      // real advance from a lost race, so we don't log a phantom event or
      // return a status the DB never took.
      const { error, count } = await svc
        .from("claims")
        .update(patch, { count: "exact" })
        .eq("id", claimId)
        .eq("status", claim.status);
      if (error) {
        if (error.code !== "23505") console.error("status advance failed:", claimId, error);
      } else if (count && count > 0) {
        events.push({
          claim_id: claimId,
          type: "status_advanced",
          payload_json: { from: claim.status, to: result.statusAdvance },
        });
        status = result.statusAdvance;
      }
    }

    if (events.length) await svc.from("claim_events").insert(events);
    return { status };
  } catch (err) {
    console.error("task engine failed:", err);
    return null;
  }
}
