import type { Brief, BriefItem } from "@/lib/brief/brief";
import type { DoItem, OutboundQueue, SendItem } from "@/lib/outbound/queue";
import { TIER_ORDER, type Tier } from "@/lib/brief/rank";
import { TRACK_LABEL, alsoLine, doActionLine, pendingClientLine, sendActionLine, unclassifiedLine, waitingLine, type DraftLite } from "./copy";

const DAY_MS = 86_400_000;

export type ComposeClaim = {
  id: string; client_name: string | null; claim_type: string; status: string;
  submitted_at: string | null; created_at: string;
  // summary_json.draft — where an unsubmitted client stopped (optional; absent → generic line)
  draft?: DraftLite;
};
export type OpenTaskLite = { claim_id: string; title: string; due_at: string | null };
export type ClaimCard = {
  claim_id: string; client_name: string | null; track_label: string;
  action_line: string; ai_line: string | null; also_line: string | null;
  send: SendItem | null;
  overdue_days: number;
  created_at: string;
  // Derived from queue/task/classification state only — deliberately not from the
  // brief. The intake-first list must order and colour itself identically whether
  // or not the AI brief is enabled.
  needs_action: boolean;
};
// `cards` is the intake-first view: every open claim in one list, newest first.
// `attention`/`waiting`/`ok` are the brief-driven sectioning, rendered only when
// the brief is enabled. Both are always computed; the dashboard picks one.
export type DashboardList = {
  cards: ClaimCard[];
  attention: ClaimCard[]; waiting: ClaimCard[]; ok: ClaimCard[];
};

export function composeDashboard(input: {
  claims: ComposeClaim[];
  queue: OutboundQueue | null;
  brief: Brief | null;
  openTasks: OpenTaskLite[];
  now: Date;
}): DashboardList {
  const { claims, queue, brief, openTasks, now } = input;

  const sendBy = new Map<string, SendItem>((queue?.send ?? []).map((s) => [s.claim_id, s]));
  const dosBy = new Map<string, DoItem[]>();
  for (const d of queue?.doToday ?? []) {
    const list = dosBy.get(d.claim_id) ?? [];
    list.push(d);
    dosBy.set(d.claim_id, list);
  }
  for (const list of dosBy.values()) list.sort((a, b) => b.overdue_days - a.overdue_days);
  const briefBy = new Map<string, BriefItem>((brief?.items ?? []).map((i) => [i.claim_id, i]));
  const futureBy = new Map<string, OpenTaskLite[]>();
  for (const t of openTasks) {
    if (t.due_at && new Date(t.due_at).getTime() > now.getTime()) {
      const list = futureBy.get(t.claim_id) ?? [];
      list.push(t);
      futureBy.set(t.claim_id, list);
    }
  }
  for (const list of futureBy.values())
    list.sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());

  // All open tasks per claim, nearest-due first (nulls last) — used only for
  // the waiting fallback line (finding #1), so an overdue-but-suppressed task
  // still surfaces honestly instead of falling through to "אין פעולות פתוחות".
  const openBy = new Map<string, OpenTaskLite[]>();
  for (const t of openTasks) {
    const list = openBy.get(t.claim_id) ?? [];
    list.push(t);
    openBy.set(t.claim_id, list);
  }
  for (const list of openBy.values())
    list.sort((a, b) => {
      const ta = a.due_at ? new Date(a.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      const tb = b.due_at ? new Date(b.due_at).getTime() : Number.MAX_SAFE_INTEGER;
      return ta - tb;
    });

  const attention: ClaimCard[] = [];
  const waiting: ClaimCard[] = [];
  const ok: ClaimCard[] = [];

  for (const c of claims) {
    const send = sendBy.get(c.id) ?? null;
    const dos = dosBy.get(c.id) ?? [];
    const b = briefBy.get(c.id);
    const unclassified = c.claim_type === "unknown" && !!c.submitted_at;

    // Card anatomy (spec §3): one card per claim; client message wins primary,
    // else the most-overdue do-task, else the classification prompt, else the
    // waiting/ok line. Whatever lost the primary slot becomes one "וגם:" line.
    const daysOpen = Math.max(0, Math.floor((now.getTime() - new Date(c.created_at).getTime()) / DAY_MS));
    const nearestOpen = openBy.get(c.id)?.[0] ?? null;

    let action_line: string;
    let also: DoItem | null = null;
    if (send) {
      action_line = sendActionLine(
        { taskKey: send.task_key, docLabels: send.doc_labels, lastSentAt: send.last_sent_at },
        now,
      );
      also = dos[0] ?? null;
    } else if (dos.length > 0) {
      action_line = dos[0].escalation ? dos[0].title : doActionLine(dos[0].title, dos[0].overdue_days);
      also = dos[1] ?? null;
    } else if (unclassified) {
      action_line = unclassifiedLine(daysOpen);
    } else if (!c.submitted_at) {
      action_line = pendingClientLine(c.draft, c.created_at, now);
    } else {
      action_line = waitingLine(nearestOpen);
    }

    const card: ClaimCard = {
      claim_id: c.id, client_name: c.client_name,
      created_at: c.created_at,
      needs_action: !!send || dos.length > 0 || unclassified,
      track_label: TRACK_LABEL[c.claim_type] ?? c.claim_type,
      action_line,
      // Only badge a line as the model's when it actually came from the model.
      // BriefItem.reason falls back to the top structured fact when the AI didn't
      // rank this claim, so keying on `reason` alone attributed plain heuristics
      // to the AI. That was rare while the ranking was computed inline; now that
      // a cold cache renders rules-only by design, it would be every first load
      // of the day. `ai` is per item, so a claim the AI skipped in an otherwise
      // successful run correctly loses the badge too.
      ai_line: b?.ai && b.reason ? `🤖 ${b.reason}` : null,
      also_line: also ? alsoLine(also.title, also.overdue_days) : null,
      send,
      overdue_days: Math.max(send?.overdue_days ?? 0, dos[0]?.overdue_days ?? 0),
    };

    if (send || dos.length > 0 || unclassified || b?.tier === "act_now") {
      attention.push(card);
    } else if (futureBy.has(c.id) || b?.tier === "waiting" || b?.tier === "this_week" || !c.submitted_at) {
      waiting.push(card);
    } else {
      ok.push(card);
    }
  }

  const tierOrd = (t: Tier | null | undefined) => (t ? TIER_ORDER[t] : Number.MAX_SAFE_INTEGER);
  attention.sort((a, b) => {
    const ba = briefBy.get(a.claim_id); const bb = briefBy.get(b.claim_id);
    return tierOrd(ba?.tier) - tierOrd(bb?.tier) || (bb?.score ?? 0) - (ba?.score ?? 0) || b.overdue_days - a.overdue_days;
  });
  waiting.sort((a, b) => {
    const na = futureBy.get(a.claim_id)?.[0]?.due_at; const nb = futureBy.get(b.claim_id)?.[0]?.due_at;
    return (
      (na ? new Date(na).getTime() : Number.MAX_SAFE_INTEGER) -
      (nb ? new Date(nb).getTime() : Number.MAX_SAFE_INTEGER)
    );
  });
  ok.sort((a, b) => (a.client_name ?? "").localeCompare(b.client_name ?? "", "he"));

  // Pilot feedback (2026-09-13): the operator's day is intake → form → send to the
  // insurer, and she asked for the most recently opened claim first. Sorted here
  // rather than leaning on the caller's query order, so the guarantee belongs to
  // the compose layer and the unit tests can hold it.
  const cards = [...attention, ...waiting, ...ok].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return { cards, attention, waiting, ok };
}
