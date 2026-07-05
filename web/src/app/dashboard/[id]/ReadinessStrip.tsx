"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type BlockingItem = { key: string; label: string };
export type NextMilestone = { key: string; label: string };

// Israeli local mobile → wa.me international format (0521234567 → 972521234567).
function waPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `972${digits.slice(1)}`;
  return null;
}

// The page's thesis: is this claim submittable, and if not — what unblocks it.
// Red = blocking items missing (with a one-click WhatsApp chase), amber = not
// classified yet, green = no blockers (advance the next milestone from here).
export default function ReadinessStrip({
  claimId,
  claimType,
  blocking,
  nextMilestone,
  clientPhone,
  uploadUrl,
  clientName,
}: {
  claimId: string;
  claimType: string;
  blocking: BlockingItem[];
  nextMilestone: NextMilestone | null;
  clientPhone: string | null;
  // Absolute /c/<token> link, built server-side so SSR/CSR render identically.
  uploadUrl: string;
  clientName: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function advanceMilestone(key: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, done: true }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "עדכון נכשל");
      return;
    }
    router.refresh();
  }

  // Not classified yet — readiness is unknowable; point at the real next step.
  if (claimType === "unknown") {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3">
        <p className="text-sm font-medium text-amber-800">
          ⏳ התביעה טרם סווגה — סווג אותה כדי לקבל רשימת מסמכים ומצב מוכנות.
        </p>
      </div>
    );
  }

  if (blocking.length > 0) {
    const wa = clientPhone ? waPhone(clientPhone) : null;
    const msg = [
      `שלום${clientName ? ` ${clientName.split(" ")[0]}` : ""}, בהמשך לתביעה שלך —`,
      `כדי שנוכל להתקדם מול חברת הביטוח חסרים המסמכים הבאים:`,
      ...blocking.map((b) => `• ${b.label}`),
      ``,
      `אפשר להעלות אותם כאן: ${uploadUrl}`,
      `תודה!`,
    ].join("\n");

    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-800">
            לא מוכן להגשה — {blocking.length === 1 ? "חסר מסמך חוסם" : `חסרים ${blocking.length} מסמכים חוסמים`}
          </p>
          <p className="mt-0.5 text-sm text-red-700">
            {blocking.map((b) => b.label).join(" · ")}
          </p>
        </div>
        {wa && (
          <a
            href={`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800"
          >
            בקש מהלקוח בוואטסאפ ↗
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 px-5 py-3">
      <p className="text-sm font-semibold text-green-800">
        ✓ אין מסמכים חוסמים{nextMilestone ? ` — השלב הבא: ${nextMilestone.label}` : " — כל אבני הדרך הושלמו"}
      </p>
      <div className="flex items-center gap-3">
        {error && <span className="text-xs text-red-600">{error}</span>}
        {nextMilestone && (
          <button
            type="button"
            onClick={() => advanceMilestone(nextMilestone.key)}
            disabled={busy}
            className="shrink-0 rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {busy ? "מעדכן…" : `סמן: ${nextMilestone.label}`}
          </button>
        )}
      </div>
    </div>
  );
}
