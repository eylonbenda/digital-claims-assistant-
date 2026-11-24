"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Third-party claim settled on the appraiser's estimate, car not repaired
// ("דו"ח גלובלי"). Flipping it drops/restores the repair items on the checklist;
// uploads are never touched, so it is safe to change mid-claim in either direction.
export default function NoRepairToggle({ claimId, initial }: { claimId: string; initial: boolean }) {
  const router = useRouter();
  const [checked, setChecked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function change(next: boolean) {
    setChecked(next);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/flags`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ no_repair: next }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setChecked(!next);
      setError("לא הצלחנו לשמור — נסו שוב");
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
      <label className="flex cursor-pointer items-center gap-2 text-zinc-800">
        <input
          type="checkbox"
          className="h-4 w-4 accent-zinc-900"
          checked={checked}
          disabled={busy}
          onChange={(e) => change(e.target.checked)}
        />
        <span className="font-medium">ללא תיקון (תביעה לפי אומדן)</span>
      </label>
      <p className="mt-1 mr-6 text-xs text-zinc-500">
        הלקוח לא מתקן את הרכב ותובע לפי דוח השמאי — חשבונית התיקון והכניסה למוסך יורדות מהרשימה.
      </p>
      {error && <p className="mt-1 mr-6 text-xs text-red-600">{error}</p>}
    </div>
  );
}
