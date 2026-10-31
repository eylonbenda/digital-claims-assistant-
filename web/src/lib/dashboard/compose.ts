import type { Brief, BriefItem } from "@/lib/brief/brief";
import type { DoItem, OutboundQueue, SendItem } from "@/lib/outbound/queue";
import { TRACK_LABEL, alsoLine, doActionLine, handlingLine, pendingClientLine, sendActionLine, unclassifiedLine, waitingLine, CLOSED_LINE, type DraftLite } from "./copy";
import { claimStage, type Stage } from "./stage";

const DAY_MS = 86_400_000;
const FRESH_MS = DAY_MS;

const latest = (...isos: (string | null | undefined)[]): string =>
  isos.filter((x): x is string => !!x).reduce((a, b) => (a > b ? a : b));

export type ComposeClaim = {
  id: string; client_name: string | null; claim_type: string; status: string;
  submitted_at: string | null; created_at: string;
  // summary_json.draft — where an unsubmitted client stopped (optional; absent → generic line)
  draft?: DraftLite;
  // newest claim_documents.uploaded_at — drives activity ordering + the "new document" badge
  last_upload_at?: string | null;
  // Post-send handling lifecycle (computed by the caller via effectiveHandling).
  handling_effective?: string | null;
  handling_insurer_label?: string | null;
  handling_days?: number;
  // When handling_effective last changed — a status update is activity too.
  handling_changed_at?: string | null;
  phone: string | null; urgent: boolean; access_token: string;
  client_plate: string | null; tp_plates: string[];
};
export type OpenTaskLite = { claim_id: string; title: string; due_at: string | null };
export type ClaimCard = {
  claim_id: string; client_name: string | null; track_label: string;
  action_line: string; ai_line: string | null; also_line: string | null;
  send: SendItem | null;
  overdue_days: number;
  created_at: string;
  // Latest of link created / client submitted / last upload. The flat list sorts on
  // this, so a claim that just came in (or just got a document) rises to the top.
  activity_at: string;
  // Something arrived in the last FRESH_MS: a submission, or a document after submit.
  fresh: "submitted" | "upload" | null;
  // Derived from queue/task/classification state only — deliberately not from the
  // brief. The intake-first list must order and colour itself identically whether
  // or not the AI brief is enabled.
  needs_action: boolean;
};
// One row per claim, open or closed — the unified list's unit. The extra fields
// feed search, the stage chips and the row's quick actions.
export type ClaimRow = ClaimCard & {
  stage: Stage; phone: string | null; urgent: boolean; closed: boolean;
  access_token: string; client_plate: string | null; tp_plates: string[];
};

export function composeDashboard(input: {
  claims: ComposeClaim[];
  queue: OutboundQueue | null;
  brief: Brief | null;
  openTasks: OpenTaskLite[];
  now: Date;
}): ClaimRow[] {
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

  const rows: ClaimRow[] = [];

  for (const c of claims) {
    const send = sendBy.get(c.id) ?? null;
    const dos = dosBy.get(c.id) ?? [];
    const b = briefBy.get(c.id);
    const unclassified = c.claim_type === "unknown" && !!c.submitted_at;

    // Card anatomy (spec §3): one card per claim; client message wins primary,
    // else the most-overdue do-task, else the classification prompt, else the
    // waiting/ok line. Whatever lost the primary slot becomes one "וגם:" line.
    const daysOpen = Math.max(0, Math.floor((now.getTime() - new Date(c.created_at).getTime()) / DAY_MS));
    // Waiting-for-classification counts from submission, not from link creation —
    // a claim submitted a minute ago must not read "מחכה לסיווג כבר 5 יום".
    const daysSinceSubmit = c.submitted_at
      ? Math.max(0, Math.floor((now.getTime() - new Date(c.submitted_at).getTime()) / DAY_MS))
      : daysOpen;
    const isRecent = (iso: string | null | undefined) => !!iso && now.getTime() - new Date(iso).getTime() < FRESH_MS;
    const fresh: ClaimCard["fresh"] = isRecent(c.submitted_at)
      ? "submitted"
      : c.submitted_at && c.last_upload_at && c.last_upload_at > c.submitted_at && isRecent(c.last_upload_at)
        ? "upload"
        : null;
    const nearestOpen = openBy.get(c.id)?.[0] ?? null;

    const stage = claimStage({
      status: c.status, submitted_at: c.submitted_at, handling_effective: c.handling_effective ?? null,
    });
    // Closed rows skip the action-line machinery: nothing here is the operator's to do.
    const closed = c.status === "closed" || c.status === "abandoned" || stage === "closed";

    let action_line: string;
    let also: DoItem | null = null;
    if (closed) {
      action_line = c.handling_effective
        ? handlingLine(c.handling_effective, c.handling_insurer_label ?? null, c.handling_days ?? 0)
        : CLOSED_LINE;
    } else if (send) {
      action_line = sendActionLine(
        { taskKey: send.task_key, docLabels: send.doc_labels, lastSentAt: send.last_sent_at },
        now,
      );
      also = dos[0] ?? null;
    } else if (dos.length > 0) {
      action_line = dos[0].escalation ? dos[0].title : doActionLine(dos[0].title, dos[0].overdue_days);
      also = dos[1] ?? null;
    } else if (unclassified) {
      action_line = unclassifiedLine(daysSinceSubmit);
    } else if (!c.submitted_at) {
      action_line = pendingClientLine(c.draft, c.created_at, now);
    } else if (c.handling_effective) {
      action_line = handlingLine(
        c.handling_effective,
        c.handling_insurer_label ?? null,
        c.handling_days ?? 0,
      );
    } else {
      action_line = waitingLine(nearestOpen);
    }

    const row: ClaimRow = {
      claim_id: c.id, client_name: c.client_name,
      created_at: c.created_at,
      activity_at: latest(c.created_at, c.submitted_at, c.last_upload_at, c.handling_changed_at),
      fresh,
      needs_action: !closed && (
        !!send || dos.length > 0 || unclassified ||
        c.handling_effective === "docs_requested" || c.handling_effective === "rejected"
      ),
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
      also_line: !closed && also ? alsoLine(also.title, also.overdue_days) : null,
      send: closed ? null : send,
      overdue_days: closed ? 0 : Math.max(send?.overdue_days ?? 0, dos[0]?.overdue_days ?? 0),
      stage, closed, phone: c.phone, urgent: c.urgent,
      access_token: c.access_token, client_plate: c.client_plate, tp_plates: c.tp_plates,
    };
    rows.push(row);
  }


  // Newest activity first (improvement log 0930-08): a link sent last week whose client
  // submitted today belongs above today's still-empty links. Sorted here rather than
  // leaning on the caller's query order, so the guarantee belongs to the compose layer.
  return rows.sort((a, b) => b.activity_at.localeCompare(a.activity_at));
}
