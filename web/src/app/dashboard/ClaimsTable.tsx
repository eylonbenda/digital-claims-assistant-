"use client";

import Link from "next/link";
import { useState } from "react";

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
  next_task: { title: string; due_at: string | null } | null;
}

const STATUS_LABEL: Record<string, string> = {
  created: "נוצר",
  in_progress: "בטיפול",
  submitted: "הוגש",
  classified: "סווג",
  form_generated: "טופס נוצר",
  checklist_active: "רשימת פעולות",
  closed: "סגור",
  abandoned: "נטוש",
};

const STATUS_COLOR: Record<string, string> = {
  created: "bg-zinc-100 text-zinc-600",
  in_progress: "bg-yellow-100 text-yellow-700",
  submitted: "bg-blue-100 text-blue-700",
  classified: "bg-purple-100 text-purple-700",
  form_generated: "bg-green-100 text-green-700",
  checklist_active: "bg-teal-100 text-teal-700",
  closed: "bg-zinc-200 text-zinc-500",
  abandoned: "bg-red-100 text-red-600",
};

const TYPE_LABEL: Record<string, string> = {
  own_policy: "פוליסת הלקוח",
  third_party_report: "צד ג' — דוח",
  third_party_settlement: "צד ג' — הסדר",
  unknown: "—",
};

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
  const [sortByDue, setSortByDue] = useState(false);

  if (claims.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        אין תביעות עדיין. צור תביעה חדשה ושלח את הקישור ללקוח.
      </p>
    );
  }

  const rows = sortByDue
    ? [...claims].sort((a, b) => {
        const ad = a.next_task?.due_at ? new Date(a.next_task.due_at).getTime() : Infinity;
        const bd = b.next_task?.due_at ? new Date(b.next_task.due_at).getTime() : Infinity;
        return ad - bd;
      })
    : claims;

  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200">
      <table className="w-full text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
          <tr>
            <th className="px-4 py-3 text-right font-medium">לקוח</th>
            <th className="px-4 py-3 text-right font-medium">סוג</th>
            <th className="px-4 py-3 text-right font-medium">סטטוס</th>
            <th className="px-4 py-3 text-right font-medium">
              <button
                type="button"
                onClick={() => setSortByDue((v) => !v)}
                className="font-medium hover:text-zinc-800"
                title="מיון לפי מועד יעד"
              >
                משימה הבאה {sortByDue ? "▲" : "↕"}
              </button>
            </th>
            <th className="px-4 py-3 text-right font-medium">תאריך</th>
            <th className="px-4 py-3 text-right font-medium">קישור</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 bg-white">
          {rows.map((c) => {
            const overdue =
              !!c.next_task?.due_at &&
              // eslint-disable-next-line react-hooks/purity -- time-of-render read is intentional: overdue is a display state, refreshed with the page
              new Date(c.next_task.due_at).getTime() < Date.now() &&
              c.status !== "closed";
            return (
              <tr key={c.id} className="hover:bg-zinc-50">
                <td className="px-4 py-3 font-medium text-zinc-900">
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
                  {TYPE_LABEL[c.claim_type] ?? c.claim_type}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                      STATUS_COLOR[c.status] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {c.next_task ? (
                    <div className={overdue ? "text-red-700" : "text-zinc-600"}>
                      {overdue && <span className="ml-1">⚠</span>}
                      {c.next_task.title}
                      {c.next_task.due_at && (
                        <div className={`text-xs ${overdue ? "text-red-500" : "text-zinc-400"}`}>
                          עד{" "}
                          {new Date(c.next_task.due_at).toLocaleDateString("he-IL", {
                            day: "numeric",
                            month: "numeric",
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-zinc-300">—</span>
                  )}
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
    </div>
  );
}
