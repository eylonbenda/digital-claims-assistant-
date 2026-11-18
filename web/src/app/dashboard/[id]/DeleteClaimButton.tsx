"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = { claimId: string; clientName: string | null; fileCount: number };

// Removes a claim opened by mistake. Rendered only while the claim is deletable
// (lib/claims/delete.ts); the route re-checks, so a stale page gets its 409 here.
export default function DeleteClaimButton({ claimId, clientName, fileCount }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/claims/${claimId}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? "המחיקה נכשלה");
        setBusy(false);
        return;
      }
    } catch {
      setError("המחיקה נכשלה — בדקו את החיבור ונסו שוב");
      setBusy(false);
      return;
    }
    // replace, not push: Back must not land on a claim that no longer exists.
    router.replace("/dashboard");
    router.refresh();
  }

  const files =
    fileCount === 0 ? "" : fileCount === 1 ? ", הקובץ שצורף אליו" : `, ${fileCount} הקבצים שצורפו אליו`;

  return (
    <>
      <button
        type="button"
        onClick={() => { setError(null); setOpen(true); }}
        className="text-xs text-zinc-400 underline-offset-2 hover:text-red-600 hover:underline"
      >
        מחיקת תיק
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          dir="rtl"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-claim-title"
            className="w-full max-w-md rounded-2xl bg-white p-6 text-start shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-claim-title" className="text-lg font-bold text-zinc-900">
              למחוק את התיק של {clientName ?? "לקוח ללא שם"}?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-700">
              התיק{files}, המשימות וההערות יימחקו לצמיתות. <strong>אי אפשר לשחזר.</strong>
            </p>
            <p className="mt-2 text-sm text-zinc-500">הקישור שנשלח ללקוח יפסיק לעבוד.</p>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 ring-1 ring-inset ring-zinc-300 hover:bg-zinc-50 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {busy ? "מוחק…" : "מחיקת התיק"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
