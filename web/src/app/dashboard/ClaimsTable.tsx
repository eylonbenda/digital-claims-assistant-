"use client";

import Link from "next/link";
import { useState } from "react";
import { TRACK_LABEL } from "@/lib/dashboard/copy";

interface Claim {
  id: string;
  client_name: string | null;
  client_phone: string | null;
  claim_type: string;
  status: string;
  urgent: boolean;
  created_at: string;
  submitted_at: string | null;
  access_token: string;
}

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/c/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="text-xs text-blue-600 hover:underline"
    >
      {copied ? "✓ הועתק" : "העתק קישור"}
    </button>
  );
}

export default function ClaimsTable({ claims }: { claims: Claim[] }) {
  const [query, setQuery] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const rows = claims.filter((c) => {
    if (!showClosed && (c.status === "closed" || c.status === "abandoned")) return false;
    if (!query) return true;
    const q = query.trim();
    return (c.client_name ?? "").includes(q) || (c.client_phone ?? "").includes(q);
  });

  if (claims.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        אין תביעות עדיין. צור תביעה חדשה ושלח את הקישור ללקוח.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-2">
        <span className="text-sm font-bold text-zinc-600">כל התיקים ({rows.length})</span>
        <span className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="חיפוש לקוח…"
            className="rounded-lg border border-zinc-300 px-2 py-1 text-xs"
          />
          <label className="flex items-center gap-1 text-xs text-zinc-500">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
            כולל סגורים
          </label>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-zinc-200">
        {rows.length === 0 ? (
          <p className="p-4 text-center text-sm text-zinc-400">לא נמצאו תוצאות</p>
        ) : (
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-right font-medium">לקוח</th>
              <th className="px-4 py-3 text-right font-medium">סוג</th>
              <th className="px-4 py-3 text-right font-medium">תאריך</th>
              <th className="px-4 py-3 text-right font-medium">קישור</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 bg-white">
            {rows.map((c) => {
              const closed = c.status === "closed" || c.status === "abandoned";
              return (
                <tr key={c.id} className="hover:bg-zinc-50">
                  <td className={`px-4 py-3 font-medium ${closed ? "text-zinc-400" : "text-zinc-900"}`}>
                    {c.urgent && <span className="ml-1 text-red-500">⚑</span>}
                    <Link href={`/dashboard/${c.id}`} className="hover:underline">
                      {c.client_name ?? (
                        <span className="text-zinc-400">ללא שם</span>
                      )}
                    </Link>
                    {c.client_phone && (
                      <div className="text-xs text-zinc-400">{c.client_phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {TRACK_LABEL[c.claim_type] ?? c.claim_type}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {new Date(c.submitted_at ?? c.created_at).toLocaleDateString("he-IL")}
                  </td>
                  <td className="px-4 py-3">
                    <CopyLinkButton token={c.access_token} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
