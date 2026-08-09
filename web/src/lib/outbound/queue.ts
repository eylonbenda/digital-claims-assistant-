import { MAX_SENDS_BEFORE_CALL, RULE_PRIORITY, SEND_RULES } from "./rules";
import { waHref } from "@/lib/wa";
import { TIER_ORDER, type Tier } from "@/lib/brief/rank";

const DAY_MS = 86_400_000;

export type QueueClaim = {
  claim_id: string; client_name: string | null; client_phone: string | null;
  access_token: string; blocking_labels: string[];
  last_doc_uploaded_at: string | null;      // resets the give-up counter
  tier: Tier | null; reason: string | null; // from today's brief when available
  score: number;                            // 0 when the brief is down
};
export type QueueTaskRow = {
  id: string; claim_id: string; key: string | null; title: string;
  due_at: string | null; status: string; source: string;
};
export type OutboundEventRow = {
  claim_id: string; task_key: string; kind: "sent" | "skipped"; created_at: string;
};
export type SendItem = {
  claim_id: string; task_id: string; task_key: string;
  client_name: string | null; tier: Tier | null; reason: string | null;
  overdue_days: number; body: string; href: string | null;
};
export type DoItem = {
  claim_id: string; client_name: string | null; title: string;
  due_at: string | null; overdue_days: number; escalation: boolean;
};
export type OutboundQueue = { send: SendItem[]; doToday: DoItem[] };

export function buildQueue(input: {
  claims: QueueClaim[]; tasks: QueueTaskRow[]; events: OutboundEventRow[];
  origin: string; now: Date;
}): OutboundQueue {
  const { claims, tasks, events, origin, now } = input;
  const claimById = new Map(claims.map((c) => [c.claim_id, c]));

  const overdueDays = (due: string) =>
    Math.max(0, Math.floor((now.getTime() - new Date(due).getTime()) / DAY_MS));

  // Only dated, open template tasks participate. Manual tasks stay in
  // TasksPanel / the next-task column — this queue dispatches engine work.
  const due = tasks.filter(
    (t) =>
      t.status === "todo" &&
      t.source === "template" &&
      t.key !== null &&
      t.due_at !== null &&
      new Date(t.due_at).getTime() <= now.getTime() &&
      claimById.has(t.claim_id),
  );

  // Events indexed per (claim, key), newest first.
  const evByPair = new Map<string, OutboundEventRow[]>();
  for (const e of events) {
    const k = `${e.claim_id} ${e.task_key}`;
    const list = evByPair.get(k) ?? [];
    list.push(e);
    evByPair.set(k, list);
  }
  for (const list of evByPair.values())
    list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const send: SendItem[] = [];
  const doToday: DoItem[] = [];

  for (const t of due) {
    const c = claimById.get(t.claim_id)!;
    const rule = t.key ? SEND_RULES[t.key] : undefined;

    if (!rule) {
      doToday.push({
        claim_id: c.claim_id, client_name: c.client_name, title: t.title,
        due_at: t.due_at, overdue_days: overdueDays(t.due_at!), escalation: false,
      });
      continue;
    }

    const pair = evByPair.get(`${c.claim_id} ${t.key}`) ?? [];

    // Give-up: N sends with no document arriving since → phone-call escalation.
    const sentSinceUpload = pair.filter(
      (e) => e.kind === "sent" &&
        (!c.last_doc_uploaded_at || e.created_at > c.last_doc_uploaded_at),
    ).length;
    if (sentSinceUpload >= MAX_SENDS_BEFORE_CALL) {
      doToday.push({
        claim_id: c.claim_id, client_name: c.client_name,
        title: `הלקוח לא מגיב (${sentSinceUpload} תזכורות) — ליצור קשר טלפוני`,
        due_at: t.due_at, overdue_days: overdueDays(t.due_at!), escalation: true,
      });
      continue;
    }

    // Cooldown: the latest touch of ANY kind suppresses — a skip means
    // "not for the cooldown", same code path as a send (spec §5).
    const last = pair[0];
    if (last && now.getTime() - new Date(last.created_at).getTime() < rule.cooldownDays * DAY_MS) {
      continue;
    }

    const body = rule.build({
      firstName: c.client_name?.trim().split(/\s+/)[0] ?? null,
      blockingLabels: c.blocking_labels,
      uploadUrl: `${origin}/c/${c.access_token}`,
    });
    send.push({
      claim_id: c.claim_id, task_id: t.id, task_key: t.key!,
      client_name: c.client_name, tier: c.tier, reason: c.reason,
      overdue_days: overdueDays(t.due_at!), body,
      href: waHref(c.client_phone, body),
    });
  }

  // Task 5 adds here: per-claim daily cap, then ordering.
  return { send, doToday };
}
