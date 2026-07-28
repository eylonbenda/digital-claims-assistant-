import { computeChecklist } from "@/lib/claims/checklist";
import { scoreClaim } from "./score";

const DAY_MS = 86_400_000;

const TRACK_LABEL: Record<string, string> = {
  own_policy: "פוליסת הלקוח",
  third_party_report: "צד ג' — דוח פרטי",
  third_party_settlement: "צד ג' — הסדר",
  unknown: "טרם סווג",
};

export type BriefClaimRow = {
  id: string; client_name: string | null; client_phone: string | null; access_token: string;
  claim_type: string; status: string; urgent: boolean;
  created_at: string; submitted_at: string | null;
  checklist_state: Record<string, boolean> | null;
  analysis_summary: string | null;
  flags: { theft: boolean; lien: boolean; business_use: boolean; policy_activated: boolean; garage_network_rider: boolean };
};

export type BriefTaskRow = { title: string; due_at: string | null };

export type FactSheet = {
  claim_id: string; client_name: string | null; client_phone: string | null; access_token: string;
  status: string; claim_type: string;
  score: number; facts: string[];
  blocking_labels: string[];
  next_task: { title: string; due_at: string | null; overdue: boolean } | null;
};

function daysBetween(from: string | null, now: Date): number | null {
  if (!from) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(from).getTime()) / DAY_MS));
}

export function buildFactSheet(
  input: {
    claim: BriefClaimRow;
    openTasks: BriefTaskRow[];
    docTypes: Set<string>;
    hasForm: boolean;
    lastActivityAt: string | null;
  },
  now: Date,
): FactSheet {
  const { claim, openTasks, docTypes, hasForm, lastActivityAt } = input;

  const checklist = computeChecklist(
    claim.claim_type, docTypes, hasForm, claim.checklist_state ?? {}, claim.flags,
  );
  const blockingLabels = checklist.filter((i) => i.blocking && !i.done).map((i) => i.label);

  const overdueTaskDays = openTasks
    .filter((t) => t.due_at && new Date(t.due_at).getTime() < now.getTime())
    .map((t) => Math.floor((now.getTime() - new Date(t.due_at!).getTime()) / DAY_MS));

  const daysOpen = daysBetween(claim.created_at, now) ?? 0;
  const daysSinceSubmit = daysBetween(claim.submitted_at, now);
  const daysSinceActivity = daysBetween(lastActivityAt, now);
  // "unknown" only matters once the client has submitted — before that,
  // being unclassified is the normal state, not a pending decision.
  const unclassified = claim.claim_type === "unknown" && !!claim.submitted_at;

  const score = scoreClaim({
    overdueTaskDays,
    blockingMissingCount: blockingLabels.length,
    daysSinceSubmit,
    daysSinceActivity,
    urgent: claim.urgent,
    unclassified,
  });

  const facts: string[] = [];
  facts.push(`מסלול: ${TRACK_LABEL[claim.claim_type] ?? claim.claim_type} · פתוחה ${daysOpen} ימים`);
  if (overdueTaskDays.length > 0) {
    facts.push(`${overdueTaskDays.length} משימות באיחור (עד ${Math.max(...overdueTaskDays)} ימים)`);
  }
  if (blockingLabels.length > 0) {
    facts.push(`חסרים ${blockingLabels.length} מסמכים חוסמים: ${blockingLabels.join(", ")}`);
  }
  if (daysSinceActivity !== null && daysSinceActivity >= 3) {
    facts.push(`ללא פעילות ${daysSinceActivity} ימים`);
  }
  if (claim.urgent) facts.push("סומן דחוף");
  if (unclassified) facts.push("ממתין לסיווג מסלול");
  if (claim.analysis_summary) facts.push(claim.analysis_summary);

  const withDue = openTasks.filter((t) => t.due_at)
    .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime());
  const next = withDue[0] ?? openTasks[0] ?? null;

  return {
    claim_id: claim.id,
    client_name: claim.client_name,
    client_phone: claim.client_phone,
    access_token: claim.access_token,
    status: claim.status,
    claim_type: claim.claim_type,
    score,
    facts,
    blocking_labels: blockingLabels,
    next_task: next
      ? { title: next.title, due_at: next.due_at,
          overdue: !!next.due_at && new Date(next.due_at).getTime() < now.getTime() }
      : null,
  };
}
