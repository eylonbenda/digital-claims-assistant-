"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FLAG_DEFS, type ClaimFlag } from "@/lib/claims/checklist";

export type ClaimFlags = Record<ClaimFlag, boolean>;

// Agent-set claim circumstances. These gate the conditional checklist, so toggling
// one immediately reshapes the required-documents list (via router.refresh).
export default function CircumstancePanel({
  claimId,
  claimType,
  flags,
}: {
  claimId: string;
  claimType: string;
  flags: ClaimFlags;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [local, setLocal] = useState<Partial<Record<ClaimFlag, boolean>>>({});
  const [error, setError] = useState<string | null>(null);

  const relevant = FLAG_DEFS.filter((d) => d.tracks.includes(claimType));
  if (relevant.length === 0) return null;

  const valueOf = (k: ClaimFlag) => (k in local ? !!local[k] : flags[k]);

  async function toggle(flag: ClaimFlag, value: boolean) {
    setLocal((s) => ({ ...s, [flag]: value }));
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/flags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flag, value }),
    });
    if (!res.ok) {
      setLocal((s) => ({ ...s, [flag]: !value })); // revert optimistic
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "עדכון נכשל");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {relevant.map((d) => {
          const checked = valueOf(d.key);
          return (
            <label key={d.key} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                disabled={isPending}
                onChange={(e) => toggle(d.key, e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              <span className={checked ? "font-medium text-zinc-800" : "text-zinc-600"}>
                {d.label}
              </span>
            </label>
          );
        })}
      </div>

      {relevant
        .filter((d) => d.warn && valueOf(d.key))
        .map((d) => (
          <p
            key={d.key}
            className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            ⚠️ {d.warn}
          </p>
        ))}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
