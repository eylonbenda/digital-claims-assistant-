import { createServiceClient } from "@/lib/supabase/service";
import { buildFactSheet, type BriefClaimRow, type FactSheet } from "./facts";
import { rankClaims, fallbackTier, TIER_ORDER, type RankSignal, type Tier } from "./rank";

export type BriefItem = {
  claim_id: string; client_name: string | null; client_phone: string | null; access_token: string;
  status: string; claim_type: string;
  tier: Tier; reason: string; flags: string[]; score: number; ai: boolean;
  blocking_labels: string[];
  next_task: { title: string; due_at: string | null; overdue: boolean } | null;
};

export type Brief = { brief_date: string; generated_at: string; ai: boolean; items: BriefItem[] };

// Only the AI judgment (tier/reason/flags per claim) is cached per day — it's the
// expensive part. The deterministic action fields (blocking_labels, next_task) are
// recomputed live on every read, so a doc uploaded after the AI ran can't leave a
// stale one-click chase on the brief.
type CachedRanking = { generated_at: string; signals: RankSignal[] };

// UTC calendar day — same deliberate convention the old digest used.
export function briefDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function assembleBrief(sheets: FactSheet[], signals: RankSignal[] | null, now: Date): Brief {
  const byId = new Map((signals ?? []).map((s) => [s.claim_id, s]));
  const items: BriefItem[] = sheets.map((s) => {
    const sig = byId.get(s.claim_id);
    return {
      claim_id: s.claim_id, client_name: s.client_name, client_phone: s.client_phone,
      access_token: s.access_token, status: s.status, claim_type: s.claim_type,
      tier: sig?.tier ?? fallbackTier(s.score),
      reason: sig?.reason ?? s.facts[0] ?? "",
      flags: sig?.flags ?? [],
      score: s.score,
      ai: !!sig,
      blocking_labels: s.blocking_labels,
      next_task: s.next_task,
    };
  });
  items.sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.score - a.score);
  return {
    brief_date: briefDate(now),
    generated_at: now.toISOString(),
    ai: signals !== null,
    items,
  };
}

// I/O wrapper: cache-or-compute. Best-effort — returns null on any failure so
// the dashboard renders without a brief rather than erroring.
export async function getOrCreateBrief(
  agentId: string,
  opts?: { refresh?: boolean },
): Promise<Brief | null> {
  try {
    const svc = createServiceClient();
    const now = new Date();
    const date = briefDate(now);

    const { data: claims } = await svc
      .from("claims")
      .select(
        "id, client_name, client_phone, access_token, claim_type, status, urgent, created_at, submitted_at, checklist_state, summary_json, theft, lien, business_use, policy_activated, garage_network_rider",
      )
      .eq("agent_id", agentId)
      .not("status", "in", "(closed,abandoned)");
    if (!claims || claims.length === 0) {
      return { brief_date: date, generated_at: now.toISOString(), ai: false, items: [] };
    }
    const ids = claims.map((c) => c.id);

    const [{ data: tasks }, { data: docs }, { data: forms }, { data: notes }] = await Promise.all([
      svc.from("tasks").select("claim_id, title, due_at, status").in("claim_id", ids).neq("status", "done"),
      svc.from("claim_documents").select("claim_id, type, uploaded_at").in("claim_id", ids),
      svc.from("generated_forms").select("claim_id, created_at").in("claim_id", ids),
      svc.from("claim_notes").select("claim_id, created_at").in("claim_id", ids),
    ]);

    const groupBy = <T extends { claim_id: string }>(rows: T[] | null) => {
      const m = new Map<string, T[]>();
      for (const r of rows ?? []) {
        const list = m.get(r.claim_id) ?? [];
        list.push(r);
        m.set(r.claim_id, list);
      }
      return m;
    };
    const tasksBy = groupBy(tasks);
    const docsBy = groupBy(docs);
    const formsBy = groupBy(forms);
    const notesBy = groupBy(notes);

    const sheets: FactSheet[] = claims.map((c) => {
      const claimDocs = docsBy.get(c.id) ?? [];
      const activityTimes = [
        c.submitted_at,
        ...claimDocs.map((d) => d.uploaded_at as string),
        ...(notesBy.get(c.id) ?? []).map((n) => n.created_at as string),
      ].filter((t): t is string => !!t);
      const lastActivityAt = activityTimes.length
        ? activityTimes.reduce((a, b) => (a > b ? a : b))
        : null;
      const summary = (c.summary_json as { analysis?: { summary?: string } } | null)?.analysis?.summary ?? null;

      const row: BriefClaimRow = {
        id: c.id, client_name: c.client_name, client_phone: c.client_phone,
        access_token: c.access_token, claim_type: c.claim_type, status: c.status,
        urgent: !!c.urgent, created_at: c.created_at, submitted_at: c.submitted_at,
        checklist_state: (c.checklist_state as Record<string, boolean> | null) ?? {},
        analysis_summary: summary,
        flags: {
          theft: !!c.theft, lien: !!c.lien, business_use: !!c.business_use,
          policy_activated: !!c.policy_activated, garage_network_rider: !!c.garage_network_rider,
        },
      };
      return buildFactSheet(
        {
          claim: row,
          openTasks: (tasksBy.get(c.id) ?? []).map((t) => ({ title: t.title as string, due_at: t.due_at as string | null })),
          docTypes: new Set(claimDocs.map((d) => d.type as string)),
          hasForm: (formsBy.get(c.id) ?? []).length > 0,
          lastActivityAt,
        },
        now,
      );
    });

    // Resolve the AI judgment: reuse today's cached ranking unless refreshing,
    // else call the LLM once and cache it. Fact sheets above are always live.
    let signals: RankSignal[] | null;
    let generatedAt: string;

    let cached: CachedRanking | null = null;
    if (!opts?.refresh) {
      const { data } = await svc
        .from("agent_briefs")
        .select("payload_json")
        .eq("agent_id", agentId)
        .eq("brief_date", date)
        .maybeSingle();
      const payload = data?.payload_json as CachedRanking | null;
      // Guard: only a lean ranking row (has `signals`) is reusable; an older
      // full-Brief row from a prior deploy is ignored and recomputed.
      if (payload && Array.isArray(payload.signals)) cached = payload;
    }

    if (cached) {
      signals = cached.signals; // AI ran when cached → ai:true via assembleBrief
      generatedAt = cached.generated_at;
    } else {
      signals = await rankClaims(sheets);
      generatedAt = now.toISOString();
      // Only persist a real ranking — never cache a degraded (AI-down) day, so a
      // transient failure doesn't pin rules-only until tomorrow.
      if (signals !== null) {
        await svc.from("agent_briefs").upsert(
          { agent_id: agentId, brief_date: date, payload_json: { generated_at: generatedAt, signals } },
          { onConflict: "agent_id,brief_date" },
        );
      }
    }

    // Merge live sheets + AI signals; stamp with when the ranking was produced
    // (not this render), so "עודכן" reflects the AI run and stays stable per day.
    const brief = assembleBrief(sheets, signals, now);
    return { ...brief, generated_at: generatedAt };
  } catch (err) {
    console.error("morning brief failed:", err);
    return null;
  }
}
