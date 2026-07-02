"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Classification } from "@/lib/claims/classify";

type ClaimType = "own_policy" | "third_party_report" | "third_party_settlement" | "unknown";

const TYPE_LABELS: Record<ClaimType, string> = {
  own_policy: "פוליסת הלקוח",
  third_party_report: "צד ג' — דוח פרטי",
  third_party_settlement: "צד ג' — הסדר",
  unknown: "לא ידוע",
};

const CONFIDENCE: Record<Classification["confidence"], { label: string; cls: string }> = {
  high: { label: "ודאות גבוהה", cls: "bg-green-100 text-green-800" },
  medium: { label: "ודאות בינונית", cls: "bg-amber-100 text-amber-800" },
  low: { label: "ודאות נמוכה", cls: "bg-red-100 text-red-700" },
};

const ALL_TYPES: ClaimType[] = [
  "own_policy",
  "third_party_report",
  "third_party_settlement",
  "unknown",
];

export default function ClaimTypeConfirm({
  claimId,
  currentType,
  classification,
}: {
  claimId: string;
  currentType: ClaimType;
  classification: Classification;
}) {
  const router = useRouter();
  const confirmed = currentType !== "unknown";

  // Force an explicit pick when the agent must choose (report vs settlement),
  // when confidence is low, or when nothing is confirmed yet.
  const mustChoose =
    !confirmed || classification.needsAgentChoice || classification.confidence === "low";

  const [selected, setSelected] = useState<ClaimType>(
    confirmed ? currentType : classification.proposedType,
  );
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showChooser = mustChoose || editing;

  async function save(type: ClaimType) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/classify`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_type: type }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "שמירה נכשלה");
      return;
    }
    router.refresh();
  }

  const conf = CONFIDENCE[classification.confidence];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
      {/* Proposal header */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-zinc-500">הצעת המערכת:</span>
        <strong className="text-zinc-900">{TYPE_LABELS[classification.proposedType]}</strong>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${conf.cls}`}>{conf.label}</span>
        {confirmed && (
          <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            מאושר: {TYPE_LABELS[currentType]}
          </span>
        )}
      </div>

      {/* Reasons — audit trail */}
      {classification.reasons.length > 0 && (
        <ul className="space-y-1 text-sm text-zinc-600">
          {classification.reasons.map((r, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-zinc-300">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Warnings */}
      {classification.faultMismatch && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ⚠️ אי-התאמה בין האשמה שהלקוח סימן לבין תיאור האירוע — כדאי לברר לפני אישור.
        </p>
      )}
      {classification.viabilityWarning && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          ⚠️ {classification.viabilityWarning}
        </p>
      )}
      {classification.needsAgentChoice && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          נדרשת הכרעה: <strong>דוח פרטי</strong> (תיק מלא אחרי תיקון) מול <strong>הסדר</strong>{" "}
          (אישור מראש מול מבטח צד ג').
          {classification.tpStrategyRecommendation && (
            <> המערכת ממליצה על {TYPE_LABELS[classification.tpStrategyRecommendation]}.</>
          )}
        </p>
      )}

      {/* Action */}
      {showChooser ? (
        <div className="space-y-2">
          <span className="text-sm font-medium text-zinc-700">בחר/י סוג תביעה:</span>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSelected(t)}
                className={`rounded-lg border px-3 py-2 text-right text-sm transition-colors ${
                  selected === t
                    ? "border-blue-600 bg-blue-50 font-medium text-blue-900"
                    : "border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {TYPE_LABELS[t]}
                {t === classification.proposedType && (
                  <span className="mr-1 text-xs text-zinc-400"> (מוצע)</span>
                )}
              </button>
            ))}
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => save(selected)}
              disabled={busy}
              className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "שומר…" : confirmed ? "עדכן סיווג" : "אשר סיווג"}
            </button>
            {editing && !mustChoose && (
              <button
                type="button"
                onClick={() => { setEditing(false); setSelected(currentType); }}
                disabled={busy}
                className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
              >
                ביטול
              </button>
            )}
          </div>
        </div>
      ) : confirmed ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-green-700">✓ התביעה סווגה</span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm text-blue-600 hover:underline"
          >
            שנה סיווג
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => save(classification.proposedType)}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? "שומר…" : `אשר: ${TYPE_LABELS[classification.proposedType]}`}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
          >
            סיווג ידני אחר
          </button>
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}
