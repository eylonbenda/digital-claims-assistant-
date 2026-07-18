import { waPhone } from "@/lib/wa";
import type { TaskStatus } from "./types";

export type DigestTaskRow = {
  id: string;
  claim_id: string;
  key: string | null;
  title: string;
  status: TaskStatus;
  due_at: string | null;
};

export type DigestClaimRow = {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  access_token: string;
};

export type DigestEntry = {
  task: DigestTaskRow;
  daysOverdue: number; // 0 = due today
  waHref: string | null;
};

export type DigestGroup = { claim: DigestClaimRow; entries: DigestEntry[] };

const DAY_MS = 86_400_000;

// The one task whose counterparty is the client (docs chase) — the only one a
// wa.me link can address; insurer-facing tasks have no phone in the data model.
const CLIENT_CHASE_KEY = "chase_missing_docs";

function chaseHref(claim: DigestClaimRow, origin: string): string | null {
  const wa = claim.client_phone ? waPhone(claim.client_phone) : null;
  if (!wa) return null;
  const first = claim.client_name?.split(" ")[0];
  const msg = [
    `שלום${first ? ` ${first}` : ""}, בהמשך לתביעה שלך —`,
    `עדיין חסרים לנו מסמכים כדי להתקדם מול חברת הביטוח.`,
    `אפשר להעלות אותם כאן: ${origin}/c/${claim.access_token}`,
    `תודה!`,
  ].join("\n");
  return `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
}

// Due-today-or-overdue open tasks, grouped per claim, most urgent first.
export function buildDigest(
  tasks: DigestTaskRow[],
  claims: DigestClaimRow[],
  now: Date,
  origin: string
): DigestGroup[] {
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const endOfToday = new Date(tomorrow.getTime() - 1);

  const byClaim = new Map(claims.map((c) => [c.id, c]));
  const groups = new Map<string, DigestGroup>();

  for (const t of tasks) {
    if (t.status === "done" || !t.due_at) continue;
    const due = new Date(t.due_at);
    if (due > endOfToday) continue;
    const claim = byClaim.get(t.claim_id);
    if (!claim) continue;

    const daysOverdue = Math.max(0, Math.floor((now.getTime() - due.getTime()) / DAY_MS));
    const waHref = t.key === CLIENT_CHASE_KEY ? chaseHref(claim, origin) : null;

    let group = groups.get(claim.id);
    if (!group) {
      group = { claim, entries: [] };
      groups.set(claim.id, group);
    }
    group.entries.push({ task: t, daysOverdue, waHref });
  }

  const result = [...groups.values()];
  for (const g of result) g.entries.sort((a, b) => b.daysOverdue - a.daysOverdue);
  result.sort((a, b) => b.entries[0].daysOverdue - a.entries[0].daysOverdue);
  return result;
}
