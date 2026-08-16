"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { chaseMessage, waHref } from "@/lib/wa";
import type { NextAction, TabKey } from "@/lib/cockpit/derive";

export type CockpitHeaderProps = {
  claimId: string;
  clientName: string | null;
  clientPhone: string | null;
  urgent: boolean;
  statusLabel: string;
  statusBadgeClass: string;
  daysOpen: number;
  daysSinceActivity: number | null;
  summary: string | null;
  nextAction: NextAction;
  chaseLabels: string[];
  uploadUrl: string;
  onNavigate: (tab: TabKey) => void;
};

// The cockpit's fixed instrument panel: identity, story, one primary action.
// Chase + milestone semantics are moved verbatim from the old ReadinessStrip
// (same WhatsApp flow, same outbound-events instrumentation, same PATCH).
export default function CockpitHeader(p: CockpitHeaderProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chaseBody = chaseMessage({
    firstName: p.clientName?.split(" ")[0] ?? null,
    items: p.chaseLabels,
    uploadUrl: p.uploadUrl,
  });
  const chaseHref = waHref(p.clientPhone, chaseBody);

  function logChase() {
    fetch("/api/outbound/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: p.claimId, task_key: "chase_missing_docs", kind: "sent", body: chaseBody }),
    }).catch(() => {});
  }

  async function advanceMilestone(key: string) {
    setBusy(true); setError(null);
    const res = await fetch(`/api/claims/${p.claimId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, done: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError((json as { error?: string }).error ?? "עדכון נכשל");
      return;
    }
    router.refresh();
  }

  const na = p.nextAction;
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-zinc-900">{p.clientName ?? "ללא שם"}</h1>
            {p.urgent && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                ⚑ דחוף
              </span>
            )}
            <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${p.statusBadgeClass}`}>
              {p.statusLabel}
            </span>
          </div>
          {p.clientPhone && <p className="mt-1 text-sm text-zinc-500" dir="ltr">{p.clientPhone}</p>}
        </div>
        <div className="shrink-0 text-sm text-zinc-400">
          {p.daysOpen === 0 ? "נפתחה היום" : `${p.daysOpen} ימים פתוחה`}
          {p.daysSinceActivity !== null && (
            <span className={p.daysSinceActivity >= 4 ? "text-amber-700" : ""}>
              {" · עדכון "}
              {p.daysSinceActivity === 0 ? "היום" : `לפני ${p.daysSinceActivity} ימים`}
            </span>
          )}
        </div>
      </div>

      {p.summary && (
        <p className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700">
          🤖 {p.summary}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
        <p className="text-sm font-semibold text-blue-900">
          הפעולה הבאה: <span className="font-normal">{na.line}</span>
        </p>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-red-600">{error}</span>}
          {na.kind === "chase" && chaseHref ? (
            <a
              href={chaseHref} onClick={logChase} target="_blank" rel="noopener noreferrer"
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              💬 בקש מהלקוח בוואטסאפ ↗
            </a>
          ) : na.kind === "milestone" ? (
            <button
              type="button" disabled={busy} onClick={() => advanceMilestone(na.milestoneKey)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {busy ? "מעדכן…" : `סמן: ${na.milestoneLabel}`}
            </button>
          ) : na.kind !== "none" ? (
            <button
              type="button" onClick={() => p.onNavigate(na.targetTab)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800"
            >
              פתח ←
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
