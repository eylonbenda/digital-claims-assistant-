"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ComputedItem, type ItemSection, groupBySection } from "@/lib/claims/checklist";
import { isSystemMilestone } from "@/lib/handling/transitions";
import { SYSTEM_MILESTONE_HINT } from "@/lib/handling/copy";

type Props = {
  claimId: string;
  claimType: string;
  initialItems: ComputedItem[];
  // docType → signed URL for uploaded docs, so satisfied doc-items link to the file.
  docUrls?: Record<string, string>;
};

export default function ChecklistPanel({ claimId, claimType, initialItems, docUrls = {} }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Local optimistic state for milestone toggles only
  const [localState, setLocalState] = useState<Record<string, boolean>>({});

  const items = initialItems.map((item) =>
    item.key in localState ? { ...item, done: localState[item.key] } : item,
  );

  const sections = groupBySection(items);
  const blockingMissing = items.filter((i) => i.blocking && !i.done);

  // Claim-level progress over the required items — optional/conditional docs don't
  // drag it down, so "done" reflects readiness, not busywork.
  const required = items.filter((i) => i.mandatory);
  const requiredDone = required.filter((i) => i.done).length;
  const pct = required.length ? Math.round((requiredDone / required.length) * 100) : 0;

  async function toggleMilestone(key: string, next: boolean) {
    setLocalState((s) => ({ ...s, [key]: next }));
    await fetch(`/api/claims/${claimId}/checklist`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, done: next }),
    });
    startTransition(() => router.refresh());
  }

  if (claimType === "unknown") {
    return (
      <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        ⚠️ סוג התביעה עדיין לא סווג — אנא סווג אותה כדי לקבל רשימת מסמכים מותאמת.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Claim-level progress over required items. */}
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="font-medium text-zinc-700">התקדמות התיק</span>
          <span className="text-zinc-500">
            {requiredDone} מתוך {required.length} · {pct}%
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-600" : "bg-teal-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {blockingMissing.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">חסרים מסמכים חוסמים ({blockingMissing.length}):</span>{" "}
          {blockingMissing.map((i) => i.label).join(" · ")}
        </div>
      )}

      {sections.map(({ section, label, items: sItems }) => (
        <SectionGroup
          key={section}
          section={section}
          label={label}
          items={sItems}
          isPending={isPending}
          onToggle={toggleMilestone}
          docUrls={docUrls}
        />
      ))}
    </div>
  );
}

function SectionGroup({
  section,
  label,
  items,
  isPending,
  onToggle,
  docUrls,
}: {
  section: ItemSection;
  label: string;
  items: ComputedItem[];
  isPending: boolean;
  onToggle: (key: string, next: boolean) => void;
  docUrls: Record<string, string>;
}) {
  const done = items.filter((i) => i.done).length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
        <span className="text-sm font-medium text-zinc-700">{label}</span>
        <span className="text-xs text-zinc-400">
          {done}/{items.length}
        </span>
      </div>
      <ul className="divide-y divide-zinc-100">
        {items.map((item) => (
          <ChecklistRow
            key={item.key}
            item={item}
            isPending={isPending}
            onToggle={onToggle}
            docUrl={
              item.kind === "doc" && item.done && item.docType
                ? docUrls[item.docType]
                : undefined
            }
          />
        ))}
      </ul>
    </div>
  );
}

function ChecklistRow({
  item,
  isPending,
  onToggle,
  docUrl,
}: {
  item: ComputedItem;
  isPending: boolean;
  onToggle: (key: string, next: boolean) => void;
  docUrl?: string;
}) {
  const isMilestone = item.kind === "milestone" && !isSystemMilestone(item.key);

  // Status tile: green check when done, red when a blocking item is missing,
  // neutral otherwise. A document shows a page glyph, a milestone a flag.
  const tileTone = item.done
    ? "bg-emerald-50 text-emerald-700"
    : item.blocking
      ? "bg-red-50 text-red-600"
      : "bg-zinc-100 text-zinc-500";
  const tile = (
    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tileTone}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {item.done ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        ) : item.kind === "milestone" ? (
          <path d="M6 21V4h11l-2 4 2 4H6" />
        ) : (
          <>
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
            <path d="M14 3v5h5" />
          </>
        )}
      </svg>
    </span>
  );

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {isMilestone ? (
        <button
          type="button"
          onClick={() => onToggle(item.key, !item.done)}
          disabled={isPending}
          className="shrink-0 rounded-lg hover:ring-2 hover:ring-zinc-200 disabled:opacity-50"
          aria-label={item.done ? "סמן כלא הושלם" : "סמן כהושלם"}
        >
          {tile}
        </button>
      ) : (
        <span className="shrink-0">{tile}</span>
      )}

      <div className="flex-1 min-w-0">
        <span className={`text-sm ${item.done ? "text-zinc-500" : "font-medium text-zinc-800"}`}>
          {item.label}
        </span>
        {item.note && (
          <span className="mr-1 text-xs text-zinc-400"> — {item.note}</span>
        )}
        {item.kind === "milestone" && isSystemMilestone(item.key) && !item.done && (
          <span className="mr-1 block text-xs text-zinc-400">{SYSTEM_MILESTONE_HINT}</span>
        )}
        {!item.mandatory && !item.done && (
          <span className="mr-1 text-xs text-amber-600">(מותנה)</span>
        )}
      </div>

      {docUrl && (
        <a
          href={docUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-xs font-medium text-blue-600 hover:underline"
        >
          צפה בקובץ ↗
        </a>
      )}

      {item.blocking && !item.done && (
        <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
          חוסם
        </span>
      )}
    </li>
  );
}
