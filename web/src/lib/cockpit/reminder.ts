import type { SendItem } from "@/lib/outbound/queue";

export type ReminderTarget = {
  href: string | null;
  payload: {
    claim_id: string; task_id?: string; task_key: string; kind: "sent"; body: string;
  };
};

// A due queue item wins (its own text, task_id for the cooldown); otherwise the
// ad-hoc chase — the pre-queue logChase payload.
export function reminderTarget(
  claimId: string,
  pendingSend: SendItem | null,
  fallbackHref: string | null,
  fallbackBody: string,
): ReminderTarget {
  if (pendingSend) {
    return {
      href: pendingSend.href,
      payload: {
        claim_id: pendingSend.claim_id, task_id: pendingSend.task_id,
        task_key: pendingSend.task_key, kind: "sent", body: pendingSend.body,
      },
    };
  }
  return {
    href: fallbackHref,
    payload: { claim_id: claimId, task_key: "chase_missing_docs", kind: "sent", body: fallbackBody },
  };
}
