"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AMOUNT_LABEL, formatILS } from "@/lib/handling/amounts";

type Key = keyof typeof AMOUNT_LABEL;

// The claim's money, editable at any time: the send and payment steps offer these
// fields too, but an amount is often known only later, or was skipped.
export default function AmountsCard({
  claimId,
  amounts,
}: {
  claimId: string;
  amounts: Record<Key, number | null>;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="mb-1 text-base font-bold text-zinc-900">סכומים</h2>
      <div className="divide-y divide-zinc-100 text-sm">
        <AmountRow claimId={claimId} field="demand_amount" value={amounts.demand_amount} />
        <AmountRow claimId={claimId} field="paid_amount" value={amounts.paid_amount} />
      </div>
    </section>
  );
}

function AmountRow({ claimId, field, value }: { claimId: string; field: Key; value: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/amounts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: draft }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError((json as { error?: string }).error ?? "השמירה נכשלה");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <div className="flex items-baseline justify-between gap-4 py-2.5">
        <span className="shrink-0 text-zinc-500">{AMOUNT_LABEL[field]}</span>
        <span className="flex items-baseline gap-2">
          <span className={value === null ? "text-zinc-400" : "font-medium text-zinc-800"}>
            {value === null ? "לא הוזן" : formatILS(value)}
          </span>
          <button
            type="button"
            onClick={() => { setDraft(value === null ? "" : String(value)); setEditing(true); }}
            className="text-xs font-medium text-brand hover:underline"
          >
            {value === null ? "הוספה" : "עריכה"}
          </button>
        </span>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="py-2.5">
      <label className="block text-zinc-500" htmlFor={`amount-${field}`}>
        {AMOUNT_LABEL[field]} (₪)
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={`amount-${field}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          inputMode="decimal"
          dir="ltr"
          autoFocus
          placeholder="0"
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {busy ? "שומר…" : "שמירה"}
        </button>
        <button type="button" onClick={() => { setEditing(false); setError(null); }} className="text-xs text-zinc-500 hover:underline">
          ביטול
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </form>
  );
}
