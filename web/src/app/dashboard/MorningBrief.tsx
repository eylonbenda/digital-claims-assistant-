"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Brief, BriefItem } from "@/lib/brief/brief";

const TIER_META: { tier: BriefItem["tier"]; label: string; badge: string; box: string }[] = [
  { tier: "act_now",  label: "🔴 לטיפול עכשיו", badge: "text-red-800",   box: "border-red-200 bg-red-50" },
  { tier: "this_week", label: "🟠 השבוע",        badge: "text-amber-800", box: "border-amber-200 bg-amber-50" },
  { tier: "waiting",  label: "⏳ בהמתנה",        badge: "text-zinc-700",  box: "border-zinc-200 bg-zinc-50" },
  { tier: "ok",       label: "✅ תקין",          badge: "text-green-800", box: "border-green-200 bg-green-50" },
];

function ItemRow({ item }: { item: BriefItem }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/dashboard/${item.claim_id}`} className="font-medium text-zinc-900 hover:underline">
            {item.client_name ?? "ללא שם"}
          </Link>
          {item.flags.map((f, i) => (
            <span key={i} className="rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">
              {f}
            </span>
          ))}
        </div>
        <p className="text-sm text-zinc-600">{item.reason}</p>
        {/* No next-task line here — tasks are the outbound queue's vocabulary
            (rendered in "יוצא היום" above); the brief keeps to triage: who + why. */}
      </div>
    </li>
  );
}

export default function MorningBrief({ brief }: { brief: Brief }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/brief/refresh", { method: "POST" });
      if (!res.ok) {
        setError("רענון נכשל");
        return;
      }
      router.refresh();
    } catch {
      setError("רענון נכשל");
    } finally {
      setBusy(false);
    }
  }

  if (brief.items.length === 0) return null;

  const generated = new Date(brief.generated_at).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-zinc-900">תדריך בוקר</h2>
        <div className="flex items-center gap-3 text-xs text-zinc-400">
          {!brief.ai && <span className="text-amber-700">AI לא זמין — מסודר לפי חוקים</span>}
          {error && <span className="text-red-600">{error}</span>}
          <span>עודכן {generated}</span>
          <button
            type="button"
            onClick={refresh}
            disabled={busy}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
          >
            {busy ? "מרענן…" : "רענון"}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {TIER_META.map(({ tier, label, badge, box }) => {
          const items = brief.items.filter((i) => i.tier === tier);
          if (items.length === 0) return null;
          const list = (
            <ul className="divide-y divide-zinc-100">
              {items.map((i) => (
                <ItemRow key={i.claim_id} item={i} />
              ))}
            </ul>
          );
          return (
            <div key={tier} className={`rounded-xl border ${box}`}>
              {/* Passive tiers start collapsed — the morning read is act_now +
                  this_week; waiting/ok are there when the agent goes looking. */}
              {tier === "ok" || tier === "waiting" ? (
                <details>
                  <summary className={`cursor-pointer px-3 py-2 text-sm font-medium ${badge}`}>
                    {label} ({items.length})
                  </summary>
                  {list}
                </details>
              ) : (
                <>
                  <p className={`px-3 pt-2 text-sm font-medium ${badge}`}>
                    {label} ({items.length})
                  </p>
                  {list}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
