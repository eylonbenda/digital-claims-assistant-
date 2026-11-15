"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ComputedItem, type ItemSection, DOC_MIN_COUNT, groupBySection } from "@/lib/claims/checklist";
import { AGENT_DOC_TYPES } from "@/lib/claims/agent-doc-types";
import { isSystemMilestone } from "@/lib/handling/transitions";
import { SYSTEM_MILESTONE_HINT } from "@/lib/handling/copy";

type Props = {
  claimId: string;
  claimType: string;
  initialItems: ComputedItem[];
  // docType → signed URL for uploaded docs, so satisfied doc-items link to the file.
  docUrls?: Record<string, string>;
  // docType → number of uploaded files, for "one side of two" on the licence.
  docCounts?: Record<string, number>;
  // "core": the mandatory base documents, as one plain card.
  // "rest": every other document, folded behind a disclosure.
  // "milestones": the milestone ticks, folded behind their own disclosure.
  // Together the three views cover every checklist item exactly once.
  view: "core" | "rest" | "milestones";
};

const CORE_TITLE = "מסמכי חובה";
const REST_TITLE = "מסמכים נוספים";
const MILESTONES_TITLE = "אבני דרך";

function viewOf(item: ComputedItem): Props["view"] {
  if (item.section === "milestone") return "milestones";
  return item.section === "base" && item.mandatory ? "core" : "rest";
}

export default function ChecklistPanel({ claimId, claimType, initialItems, docUrls = {}, docCounts = {}, view }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Local optimistic state for milestone toggles only
  const [localState, setLocalState] = useState<Record<string, boolean>>({});

  const items = initialItems
    .filter((item) => viewOf(item) === view)
    .map((item) => (item.key in localState ? { ...item, done: localState[item.key] } : item));

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

  if (view === "core") {
    // Unclassified: the document list depends on the track, and the classification
    // prompt above it already says so.
    if (claimType === "unknown" || items.length === 0) return null;
    return (
      <SectionGroup
        section="base"
        label={CORE_TITLE}
        items={items}
        isPending={isPending}
        onToggle={toggleMilestone}
        docUrls={docUrls}
        docCounts={docCounts}
        claimId={claimId}
      />
    );
  }

  if (claimType === "unknown") {
    if (view === "milestones") return null;
    return (
      <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
        ⚠️ סוג התביעה עדיין לא סווג — אנא סווג אותה כדי לקבל רשימת מסמכים מותאמת.
      </p>
    );
  }

  if (items.length === 0) return null;

  return (
    <details className="group rounded-xl border border-zinc-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none">
        <span className="text-sm font-semibold text-zinc-900">
          {view === "milestones" ? MILESTONES_TITLE : REST_TITLE}
        </span>
        <span className="flex items-center gap-3 text-xs text-zinc-500">
          {blockingMissing.length > 0 && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
              {blockingMissing.length} חוסמים
            </span>
          )}
          {items.filter((i) => i.done).length}/{items.length}
          <span className="transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </span>
      </summary>
    <div className="space-y-4 border-t border-zinc-100 p-4">
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
          label={view === "milestones" ? null : label}
          items={sItems}
          isPending={isPending}
          onToggle={toggleMilestone}
          docUrls={docUrls}
          docCounts={docCounts}
          claimId={claimId}
        />
      ))}
    </div>
    </details>
  );
}

function SectionGroup({
  section,
  label,
  items,
  isPending,
  onToggle,
  docUrls,
  docCounts,
  claimId,
}: {
  section: ItemSection;
  label: string | null; // null: no header row (the enclosing disclosure names the group)
  items: ComputedItem[];
  isPending: boolean;
  onToggle: (key: string, next: boolean) => void;
  docUrls: Record<string, string>;
  docCounts: Record<string, number>;
  claimId: string;
}) {
  const done = items.filter((i) => i.done).length;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
      {label !== null && (
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2">
          <span className="text-sm font-medium text-zinc-700">{label}</span>
          <span className="text-xs text-zinc-400">
            {done}/{items.length}
          </span>
        </div>
      )}
      <ul className="divide-y divide-zinc-100">
        {items.map((item) => (
          <ChecklistRow
            key={item.key}
            item={item}
            isPending={isPending}
            onToggle={onToggle}
            claimId={claimId}
            uploadedCount={item.docType ? (docCounts[item.docType] ?? 0) : 0}
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
  claimId,
  uploadedCount,
}: {
  item: ComputedItem;
  isPending: boolean;
  onToggle: (key: string, next: boolean) => void;
  docUrl?: string;
  claimId: string;
  uploadedCount: number;
}) {
  // A missing document the agent is allowed to upload gets its own upload button.
  const canUpload =
    item.kind === "doc" && !item.done && !!item.docType && AGENT_DOC_TYPES.has(item.docType);
  const needed = item.docType ? (DOC_MIN_COUNT[item.docType] ?? 1) : 1;
  const partial = !item.done && needed > 1 && uploadedCount > 0;
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
        {partial && (
          <span className="mr-1 block text-xs text-amber-700">
            הועלה {uploadedCount} מתוך {needed}
          </span>
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

      {canUpload ? (
        <RowUpload claimId={claimId} docType={item.docType!} multiple={needed > 1} />
      ) : (
        item.blocking && !item.done && (
          <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
            חוסם
          </span>
        )
      )}
    </li>
  );
}

// Upload straight from a checklist row: the document type is the row's, so the
// agent only picks the file(s). Same endpoint as AgentDocUpload.
function RowUpload({ claimId, docType, multiple }: { claimId: string; docType: string; multiple: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setError(null);
    for (const file of files) {
      const fd = new FormData();
      fd.append("type", docType);
      fd.append("file", file);
      const res = await fetch(`/api/claims/${claimId}/documents`, { method: "POST", body: fd });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError((json as { error?: string }).error ?? "שגיאה בהעלאה");
        break;
      }
    }
    if (inputRef.current) inputRef.current.value = "";
    setBusy(false);
    router.refresh();
  }

  return (
    <span className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <input
        ref={inputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.pdf"
        multiple={multiple}
        onChange={onFiles}
        className="hidden"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-brand hover:bg-zinc-50 disabled:opacity-50"
      >
        {busy ? "מעלה…" : "העלאה"}
      </button>
    </span>
  );
}
