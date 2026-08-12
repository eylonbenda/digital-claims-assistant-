import { MAX_SENDS_BEFORE_CALL, RULE_PRIORITY, SEND_RULES } from "./rules";
import { waHref } from "@/lib/wa";
import { TIER_ORDER, type Tier } from "@/lib/brief/rank";

const DAY_MS = 86_400_000;

export type QueueClaim = {
  claim_id: string; client_name: string | null; client_phone: string | null;
  access_token: string; blocking_labels: string[];
  missing_doc_labels: string[];             // mandatory late-section doc items, not-done (spec §2)
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
  // Presentation-only fields (dashboard cards) — no queue logic reads these.
  doc_labels: string[];        // chaseable labels the body was built from
  last_sent_at: string | null; // newest kind='sent' event for this (claim, key)
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
        // Carries the task's own subject — without it, two escalations on the
        // same claim (e.g. chase_missing_docs + get_tp_insurer) are indistinguishable.
        title: `הלקוח לא מגיב על „${t.title}" (${sentSinceUpload} תזכורות) — ליצור קשר טלפוני`,
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

    const ctx = {
      firstName: c.client_name?.trim().split(/\s+/)[0] ?? null,
      blockingLabels: c.blocking_labels,
      missingDocLabels: c.missing_doc_labels,
      uploadUrl: `${origin}/c/${c.access_token}`,
    };
    const body = rule.build(ctx);
    send.push({
      claim_id: c.claim_id, task_id: t.id, task_key: t.key!,
      client_name: c.client_name, tier: c.tier, reason: c.reason,
      overdue_days: overdueDays(t.due_at!), body,
      href: waHref(c.client_phone, body),
      doc_labels: rule.labels(ctx),
      last_sent_at: pair.find((e) => e.kind === "sent")?.created_at ?? null,
    });
  }

  // ── One message per claim per day (spec §5 guard 1) ─────────────────────
  // A claim whose slot was used today (any key, sent or skipped) proposes
  // nothing more; among fresh candidates the most overdue wins, ties broken
  // by RULE_PRIORITY.
  // UTC calendar day — same deliberate convention as briefDate() in brief.ts,
  // so "today" means the same thing across the brief and the queue.
  const today = now.toISOString().slice(0, 10);
  const usedToday = new Set(
    events.filter((e) => e.created_at.slice(0, 10) === today).map((e) => e.claim_id),
  );
  const bestPerClaim = new Map<string, SendItem>();
  for (const item of send) {
    if (usedToday.has(item.claim_id)) continue;
    const cur = bestPerClaim.get(item.claim_id);
    if (
      !cur ||
      item.overdue_days > cur.overdue_days ||
      (item.overdue_days === cur.overdue_days &&
        RULE_PRIORITY.indexOf(item.task_key) < RULE_PRIORITY.indexOf(cur.task_key))
    ) {
      bestPerClaim.set(item.claim_id, item);
    }
  }

  // ── Ordering ────────────────────────────────────────────────────────────
  const tierOrd = (t: Tier | null) => (t ? TIER_ORDER[t] : Number.MAX_SAFE_INTEGER);
  const capped = [...bestPerClaim.values()].sort(
    (a, b) => {
      const ca = claimById.get(a.claim_id)!;
      const cb = claimById.get(b.claim_id)!;
      return tierOrd(ca.tier) - tierOrd(cb.tier) || cb.score - ca.score || b.overdue_days - a.overdue_days;
    },
  );
  doToday.sort((a, b) => b.overdue_days - a.overdue_days);

  return { send: capped, doToday };
}
