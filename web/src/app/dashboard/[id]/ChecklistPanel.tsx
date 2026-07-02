"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ComputedItem, type ItemSection, groupBySection } from "@/lib/claims/checklist";

type Props = {
  claimId: string;
  claimType: string;
  initialItems: ComputedItem[];
};

export default function ChecklistPanel({ claimId, claimType, initialItems }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Local optimistic state for milestone toggles only
  const [localState, setLocalState] = useState<Record<string, boolean>>({});

  const items = initialItems.map((item) =>
    item.key in localState ? { ...item, done: localState[item.key] } : item,
  );

  const sections = groupBySection(items);
  const blockingMissing = items.filter((i) => i.blocking && !i.done);

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
}: {
  section: ItemSection;
  label: string;
  items: ComputedItem[];
  isPending: boolean;
  onToggle: (key: string, next: boolean) => void;
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
      <ul className="divide-y divide-zinc-50">
        {items.map((item) => (
          <ChecklistRow
            key={item.key}
            item={item}
            isPending={isPending}
            onToggle={onToggle}
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
}: {
  item: ComputedItem;
  isPending: boolean;
  onToggle: (key: string, next: boolean) => void;
}) {
  const isMilestone = item.kind === "milestone";

  const statusIcon = item.done
    ? "✅"
    : item.blocking
      ? "🔴"
      : "⬜";

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      {isMilestone ? (
        <button
          type="button"
          onClick={() => onToggle(item.key, !item.done)}
          disabled={isPending}
          className="mt-0.5 shrink-0 text-lg leading-none disabled:opacity-50"
          aria-label={item.done ? "סמן כלא הושלם" : "סמן כהושלם"}
        >
          {statusIcon}
        </button>
      ) : (
        <span className="mt-0.5 shrink-0 text-lg leading-none">{statusIcon}</span>
      )}

      <div className="flex-1 min-w-0">
        <span className={`text-sm ${item.done ? "text-zinc-400 line-through" : "text-zinc-800"}`}>
          {item.label}
        </span>
        {item.note && (
          <span className="mr-1 text-xs text-zinc-400"> — {item.note}</span>
        )}
        {!item.mandatory && !item.done && (
          <span className="mr-1 text-xs text-amber-600">(מותנה)</span>
        )}
      </div>

      {item.blocking && !item.done && (
        <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
          חוסם
        </span>
      )}
    </li>
  );
}
