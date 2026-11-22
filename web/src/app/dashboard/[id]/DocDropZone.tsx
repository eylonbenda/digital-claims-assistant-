"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CLASSIFY_LABELS, docLabel } from "@/lib/claims/doc-labels";
import { runPool } from "@/lib/files/pool";

const MAX_PARALLEL = 3;
const ACCEPT = ".jpg,.jpeg,.png,.heic,.pdf";

type Row = {
  key: string;
  name: string;
  state: "uploading" | "done" | "error";
  docId?: string;
  type?: string;
  detected?: boolean;
  error?: string;
  retyping?: boolean;
};

// Drop every document of the claim at once: each file is stored and filed under
// the type the server detects. The summary stays until dismissed, so a wrong
// detection is seen and corrected rather than silently kept.
export default function DocDropZone({ claimId }: { claimId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const batch = useRef(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [over, setOver] = useState(false);

  const patchRow = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function upload(files: File[]) {
    if (!files.length) return;
    const id = ++batch.current;
    const fresh: Row[] = files.map((f, i) => ({ key: `${id}-${i}`, name: f.name, state: "uploading" }));
    setRows((rs) => [...rs, ...fresh]);

    await runPool(files, MAX_PARALLEL, async (file, i) => {
      const key = fresh[i].key;
      try {
        const fd = new FormData();
        fd.append("type", "auto");
        fd.append("file", file);
        const res = await fetch(`/api/claims/${claimId}/documents`, { method: "POST", body: fd });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          patchRow(key, { state: "error", error: json.error ?? "ההעלאה נכשלה" });
          return;
        }
        patchRow(key, { state: "done", docId: json.id, type: json.type, detected: !!json.detected });
      } catch {
        patchRow(key, { state: "error", error: "ההעלאה נכשלה — בדקו את החיבור ונסו שוב" });
      }
    });
    router.refresh();
  }

  async function retype(row: Row, type: string) {
    if (!row.docId || type === row.type) return;
    patchRow(row.key, { retyping: true, error: undefined });
    const res = await fetch(`/api/claims/${claimId}/documents/${row.docId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      patchRow(row.key, { retyping: false, error: json.error ?? "שינוי הסוג נכשל" });
      return;
    }
    // Chosen by the handler now, so it no longer reads as "not detected".
    patchRow(row.key, { retyping: false, type, detected: true });
    router.refresh();
  }

  const busy = rows.some((r) => r.state === "uploading");

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void upload([...e.dataTransfer.files]);
        }}
        className={`cursor-pointer rounded-lg border-2 border-dashed px-4 py-6 text-center outline-none transition-colors focus-visible:border-blue-500 ${
          over ? "border-blue-500 bg-blue-50" : "border-zinc-300 hover:border-zinc-400"
        }`}
      >
        <p className="text-sm font-medium text-zinc-800">גררו לכאן את כל המסמכים</p>
        <p className="mt-1 text-xs text-zinc-500">
          המערכת תזהה ותתייק כל קובץ. אפשר לתקן אחר כך · או לחצו לבחירת קבצים
        </p>
        <input
          ref={inputRef}
          id="doc-drop-input"
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {rows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-800">
              {busy ? "מעלה ומזהה…" : "מה זוהה — תקנו אם צריך"}
            </span>
            {!busy && (
              <button
                type="button"
                onClick={() => setRows([])}
                className="text-sm text-zinc-400 hover:text-zinc-600"
              >
                סגור
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.key}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                  r.state === "error" || (r.state === "done" && !r.detected)
                    ? "bg-amber-50 ring-1 ring-inset ring-amber-200"
                    : "bg-zinc-50"
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-zinc-800" dir="ltr" title={r.name}>
                    {r.name}
                  </p>
                  <p className={`text-xs ${r.state === "error" || r.error ? "text-red-600" : "text-zinc-500"}`}>
                    {r.state === "uploading" && "מעלה ומזהה…"}
                    {r.state === "error" && r.error}
                    {r.state === "done" &&
                      (r.error ??
                        (r.detected ? `← ${docLabel(r.type!)}` : "לא זוהה, תויק כ״אחר״ — בחרו סוג"))}
                  </p>
                </div>
                {r.state === "done" && (
                  <select
                    id={`doc-drop-type-${r.key}`}
                    aria-label={`סוג המסמך של ${r.name}`}
                    value={r.type}
                    disabled={r.retyping}
                    onChange={(e) => void retype(r, e.target.value)}
                    className="shrink-0 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-800 disabled:opacity-50"
                  >
                    {CLASSIFY_LABELS.map((o) => (
                      <option key={o.type} value={o.type}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
