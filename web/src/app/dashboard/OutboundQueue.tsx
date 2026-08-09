"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DoItem, OutboundQueue as Queue, SendItem } from "@/lib/outbound/queue";

const TIER_BADGE: Record<string, string> = {
  act_now: "bg-red-100 text-red-800",
  this_week: "bg-amber-100 text-amber-800",
  waiting: "bg-zinc-100 text-zinc-700",
  ok: "bg-green-100 text-green-800",
};

function postEvent(item: SendItem, kind: "sent" | "skipped") {
  return fetch("/api/outbound/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_id: item.claim_id,
      task_id: item.task_id,
      task_key: item.task_key,
      kind,
      ...(kind === "sent" ? { body: item.body } : {}),
    }),
  });
}

function SendRow({ item }: { item: SendItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A failed write must not leave the row permanently disabled (review finding
  // #5) — reset busy so the agent can retry, and surface a small hint. Success
  // keeps the existing behavior: router.refresh() drops the row from the next
  // read once the event lands.
  function settle(promise: Promise<Response>) {
    promise
      .then((res) => {
        if (res.ok) {
          router.refresh();
        } else {
          setBusy(false);
          setError("הרישום נכשל — נסה שוב");
        }
      })
      .catch(() => {
        setBusy(false);
        setError("הרישום נכשל — נסה שוב");
      });
  }

  // TRAP: window.open must run synchronously in the click handler — any await
  // before it and the popup blocker eats the send. The event write is
  // best-effort; a dropped write costs a re-proposal tomorrow (absorbed by
  // the cooldown), a blocked window costs the agent the send.
  function send() {
    if (item.href) window.open(item.href, "_blank", "noopener,noreferrer");
    setBusy(true);
    setError(null);
    settle(postEvent(item, "sent"));
  }
  function skip() {
    setBusy(true);
    setError(null);
    settle(postEvent(item, "skipped"));
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href={`/dashboard/${item.claim_id}`} className="font-medium text-zinc-900 hover:underline">
            {item.client_name ?? "ללא שם"}
          </Link>
          {item.tier && (
            <span className={`rounded px-1.5 py-0.5 text-xs ${TIER_BADGE[item.tier] ?? ""}`}>{item.reason}</span>
          )}
          {item.overdue_days > 0 && (
            <span className="text-xs text-red-600">באיחור {item.overdue_days} ימים</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {error && <span className="text-xs text-red-600">{error}</span>}
          <button
            type="button"
            onClick={send}
            disabled={busy || !item.href}
            title={item.href ? undefined : "מספר טלפון חסר או לא תקין"}
            className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            שלח בוואטסאפ ↗
          </button>
          <button
            type="button"
            onClick={skip}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            דלג
          </button>
        </div>
      </div>
      <details className="mt-1">
        <summary className="cursor-pointer text-xs text-zinc-400">תצוגת הודעה</summary>
        <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700" dir="rtl">
          {item.body}
        </pre>
      </details>
    </li>
  );
}

function DoRow({ item }: { item: DoItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <Link href={`/dashboard/${item.claim_id}`} className="text-sm text-zinc-900 hover:underline">
          <span className="font-medium">{item.client_name ?? "ללא שם"}</span>
          {" · "}
          <span className={item.escalation ? "text-amber-800" : ""}>{item.title}</span>
        </Link>
      </div>
      {item.overdue_days > 0 && (
        <span className="shrink-0 text-xs text-red-600">באיחור {item.overdue_days} ימים</span>
      )}
    </li>
  );
}

export default function OutboundQueue({ queue }: { queue: Queue }) {
  if (queue.send.length === 0 && queue.doToday.length === 0) return null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4" dir="rtl">
      <h2 className="mb-3 text-lg font-semibold text-zinc-900">יוצא היום</h2>
      <div className="space-y-3">
        {queue.send.length > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50/40">
            <p className="px-3 pt-2 text-sm font-medium text-green-900">
              לשלוח היום ({queue.send.length})
            </p>
            <ul className="divide-y divide-zinc-100">
              {queue.send.map((i) => (
                <SendRow key={`${i.claim_id}:${i.task_key}`} item={i} />
              ))}
            </ul>
          </div>
        )}
        {queue.doToday.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50">
            <p className="px-3 pt-2 text-sm font-medium text-zinc-700">
              לטפל היום ({queue.doToday.length})
            </p>
            <ul className="divide-y divide-zinc-100">
              {queue.doToday.map((i, n) => (
                <DoRow key={`${i.claim_id}:${n}`} item={i} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
