import { createServiceClient } from "@/lib/supabase/service";
import { computeChecklist } from "@/lib/claims/checklist";
import type { Brief } from "@/lib/brief/brief";
import {
  buildQueue,
  type OutboundEventRow,
  type OutboundQueue,
  type QueueClaim,
  type QueueTaskRow,
} from "./queue";

const DAY_MS = 86_400_000;
// Events window: must cover the longest cooldown and the give-up count.
// 60 days is comfortably past both; older events can't change the queue.
const EVENTS_WINDOW_DAYS = 60;

// Best-effort: returns null on ANY failure so the dashboard renders without
// the panel (the getOrCreateBrief contract). In particular a failed
// outbound_events read must NOT degrade to "no events" — that would propose
// sends with no cooldown data and risk double-chasing a client.
export async function loadQueue(
  agentId: string,
  origin: string,
  brief: Brief | null,
): Promise<OutboundQueue | null> {
  try {
    const svc = createServiceClient();
    const now = new Date();

    const { data: claims, error: claimsErr } = await svc
      .from("claims")
      .select(
        "id, client_name, client_phone, access_token, claim_type, checklist_state, theft, lien, business_use, policy_activated, garage_network_rider",
      )
      .eq("agent_id", agentId)
      .not("status", "in", "(closed,abandoned)");
    if (claimsErr) throw claimsErr;
    if (!claims || claims.length === 0) return { send: [], doToday: [] };
    const ids = claims.map((c) => c.id);

    const [tasksRes, docsRes, formsRes, eventsRes] = await Promise.all([
      svc.from("tasks")
        .select("id, claim_id, key, title, due_at, status, source")
        .in("claim_id", ids).neq("status", "done"),
      svc.from("claim_documents").select("claim_id, type, uploaded_at").in("claim_id", ids),
      svc.from("generated_forms").select("claim_id").in("claim_id", ids),
      svc.from("outbound_events")
        .select("claim_id, task_key, kind, created_at")
        .in("claim_id", ids)
        .gte("created_at", new Date(now.getTime() - EVENTS_WINDOW_DAYS * DAY_MS).toISOString()),
    ]);
    if (tasksRes.error) throw tasksRes.error;
    if (docsRes.error) throw docsRes.error;
    if (formsRes.error) throw formsRes.error;
    if (eventsRes.error) {
      // Same failure-visibility rule as brief.ts: name the likely migration.
      console.error(
        `outbound queue: events read failed (${eventsRes.error.message}) — queue hidden. Check that migration 008_outbound_events.sql has been applied to this database.`,
      );
      return null;
    }

    const docsBy = new Map<string, { type: string; uploaded_at: string }[]>();
    for (const d of docsRes.data ?? []) {
      const list = docsBy.get(d.claim_id) ?? [];
      list.push({ type: d.type as string, uploaded_at: d.uploaded_at as string });
      docsBy.set(d.claim_id, list);
    }
    const formClaims = new Set((formsRes.data ?? []).map((f) => f.claim_id));
    const briefBy = new Map((brief?.items ?? []).map((i) => [i.claim_id, i]));

    const queueClaims: QueueClaim[] = claims.map((c) => {
      const docs = docsBy.get(c.id) ?? [];
      const checklist = computeChecklist(
        c.claim_type,
        new Set(docs.map((d) => d.type)),
        formClaims.has(c.id),
        (c.checklist_state as Record<string, boolean> | null) ?? {},
        {
          theft: !!c.theft, lien: !!c.lien, business_use: !!c.business_use,
          policy_activated: !!c.policy_activated, garage_network_rider: !!c.garage_network_rider,
        },
      );
      const b = briefBy.get(c.id);
      return {
        claim_id: c.id,
        client_name: c.client_name,
        client_phone: c.client_phone,
        access_token: c.access_token,
        // Client-suppliable docs only — a "blocking" item can also be the
        // system-generated accident form (kind='form') or a milestone the agent
        // owns (kind='milestone'), neither of which the client can send back over
        // WhatsApp (review finding #1).
        blocking_labels: checklist
          .filter((i) => i.blocking && !i.done && i.kind === "doc")
          .map((i) => i.label),
        // Mandatory late-section doc items, not-done — a superset of blocking_labels
        // that also surfaces mandatory docs the checklist deliberately doesn't gate
        // readiness on (repair_receipt, no_claim_confirmation when already blocking,
        // etc.) so collect_private_report_docs can actually ask for them (finding #2).
        missing_doc_labels: checklist
          .filter((i) => i.kind === "doc" && i.mandatory && !i.done && i.section === "late")
          .map((i) => i.label),
        last_doc_uploaded_at: docs.length
          ? docs.map((d) => d.uploaded_at).reduce((a, b2) => (a > b2 ? a : b2))
          : null,
        tier: b?.tier ?? null,
        reason: b?.reason ?? null,
        score: b?.score ?? 0,
      };
    });

    return buildQueue({
      claims: queueClaims,
      tasks: (tasksRes.data ?? []) as QueueTaskRow[],
      events: (eventsRes.data ?? []) as OutboundEventRow[],
      origin,
      now,
    });
  } catch (err) {
    console.error("outbound queue failed:", err);
    return null;
  }
}
