"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applySuggestion, type Suggestion } from "@/lib/demand/appraiser-suggestion";
import { DEFAULT_VAT, formatLetterAmount } from "@/lib/demand/damages";
import { COPY as DEMAND_COPY } from "@/lib/demand/copy";
import type { ClaimData } from "@/lib/formfill/types";

// The figures read from the appraiser report and fee invoice, waiting for the clerk. Nothing is in
// the demand letter until she clicks: applying saves the damages lines through the
// same route the form editor uses, which also regenerates the letter.
export default function AppraiserSuggestion({
  claimId,
  suggestion,
  formData,
}: {
  claimId: string;
  suggestion: Suggestion;
  formData: ClaimData;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"apply" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // One resolution per source document. Best-effort after an apply: once the amounts
  // are saved the lines match and the card is gone anyway.
  const resolve = async (outcome: "applied" | "dismissed") => {
    const results = await Promise.all(
      suggestion.documentIds.map((document_id) =>
        fetch(`/api/claims/${claimId}/appraiser-amounts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ document_id, outcome }),
        }),
      ),
    );
    return { ok: results.every((r) => r.ok) };
  };

  async function apply() {
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}/form-data`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_data: { ...formData, damages: applySuggestion(formData.damages, suggestion.lines) },
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? "השמירה נכשלה");
        return;
      }
      await resolve("applied").catch(() => null);
      router.refresh();
    } catch {
      setError("השמירה נכשלה — בדקו את החיבור ונסו שוב");
    } finally {
      setBusy(null);
    }
  }

  async function dismiss() {
    setBusy("dismiss");
    setError(null);
    try {
      const res = await resolve("dismissed");
      if (!res.ok) {
        setError("הפעולה נכשלה — נסו שוב");
        return;
      }
      router.refresh();
    } catch {
      setError("הפעולה נכשלה — בדקו את החיבור ונסו שוב");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      id="appraiser-suggestion"
      className="rounded-xl border border-blue-200 bg-blue-50 p-4"
      aria-label="סכומים ממסמכי השמאי"
    >
      <h2 className="text-sm font-semibold text-zinc-900">נמצא במסמכי השמאי</h2>
      <dl className="mt-2 space-y-1 text-sm">
        {suggestion.lines.map((l) => (
          <div key={l.key} className="flex flex-wrap items-baseline justify-between gap-x-4">
            <dt className="text-zinc-700">
              {DEMAND_COPY.damages.labels[l.key]}{" "}
              <span className="text-xs text-zinc-500">({DEFAULT_VAT[l.key] ? "לפני מע״מ" : "ללא מע״מ"})</span>
            </dt>
            <dd className="text-zinc-900">
              <span className="font-semibold" dir="ltr">{formatLetterAmount(l.suggested)}</span>
              {l.unverified && <span className="mr-2 text-xs text-amber-700">לבדוק</span>}
              {l.current !== null && (
                <span className="mr-2 text-xs text-amber-700">
                  כרגע במכתב: <span dir="ltr">{formatLetterAmount(l.current)}</span>
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      {suggestion.lines.some((l) => l.unverified) && (
        <p className="mt-2 text-xs text-amber-700">
          סכום שמסומן ״לבדוק״ לא אומת מול הסה״כ כולל מע״מ שבמסמך — לבדוק מול המסמך לפני האישור.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void apply()}
          disabled={busy !== null}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy === "apply" ? "שומר…" : "להכניס למכתב הדרישה"}
        </button>
        <button
          type="button"
          onClick={() => void dismiss()}
          disabled={busy !== null}
          className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
        >
          לא עכשיו
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </section>
  );
}
