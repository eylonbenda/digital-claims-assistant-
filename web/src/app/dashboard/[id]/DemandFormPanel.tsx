"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DEMAND_COPY as C } from "@/lib/cockpit/copy";

export default function DemandFormPanel({
  claimId,
  latest,
  senderMissing,
  addresseeResolved,
  insurerOptions,
}: {
  claimId: string;
  latest: { url: string | null; createdAt: string } | null;
  senderMissing: boolean;
  addresseeResolved: boolean;
  insurerOptions: { key: string; label: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insurer, setInsurer] = useState("");

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}/demand-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(!addresseeResolved && insurer ? { at_fault_insurer: insurer } : {}),
      });
      if (!res.ok) {
        setError(C.errors[res.status] ?? C.errorFallback);
        return;
      }
      router.refresh();
    } catch {
      setError(C.errorFallback);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-900">{C.title}</h2>

      {senderMissing && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {C.senderMissing}{" "}
          <Link href="/dashboard" className="font-medium text-blue-600 hover:underline">
            {C.senderMissingLink}
          </Link>
        </div>
      )}

      {latest && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2">
          <span className="text-xs text-zinc-400">
            {new Date(latest.createdAt).toLocaleDateString("he-IL")}
          </span>
          {latest.url ? (
            <a
              href={latest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              {C.open}
            </a>
          ) : (
            <span className="text-xs text-red-500">קישור לא זמין</span>
          )}
        </div>
      )}

      {!addresseeResolved && (
        <label className="block">
          <span className="text-xs text-zinc-500">{C.insurerPrompt}</span>
          <select
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            className="mt-1 w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          >
            <option value="">{C.insurerPlaceholder}</option>
            {insurerOptions.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? C.pending : latest ? C.regenerate : C.create}
      </button>
    </section>
  );
}
