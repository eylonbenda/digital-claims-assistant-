"use client";

import type { DocType, UploadedDoc } from "@/lib/collection/claim-state";

// Shared field primitives for the wizard steps: a labeled text input, a
// tap-choice button group, a document picker, and the summary's edit row.

export function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
  inputMode,
  warn,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "numeric" | "tel";
  warn?: string; // gentle plausibility warning — never blocks continuing
}) {
  return (
    <label className="block">
      <span className="text-base text-zinc-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-blue-500 ${
          warn ? "border-amber-400" : "border-zinc-300"
        }`}
      />
      {warn && <span className="mt-1 block text-xs text-amber-600">{warn}</span>}
    </label>
  );
}

export function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-xl border px-4 py-3 text-right text-base transition-colors ${
            value === o.v ? "border-blue-600 bg-blue-50 font-medium" : "border-zinc-300 hover:bg-zinc-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function DocField({
  label,
  hint,
  type,
  multiple,
  docs,
  onPick,
  onRemove,
}: {
  label: string;
  hint?: string;
  type: DocType;
  multiple?: boolean;
  docs: UploadedDoc[];
  onPick: (type: DocType, files: FileList) => void;
  onRemove: (localId: string) => void;
}) {
  const mine = docs.filter((d) => d.type === type);
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-medium">{label}</span>
        <label className="shrink-0 cursor-pointer rounded-lg border border-blue-600 px-3 py-1.5 text-sm text-blue-700">
          {mine.length ? "הוסף/י" : "צילום / קובץ"}
          <input
            type="file"
            // No `capture` attribute — see FollowupUpload: it would force the camera and
            // hide gallery/Files on mobile.
            accept="image/*,application/pdf"
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onPick(type, e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      {mine.length > 0 && (
        <ul className="mt-2 space-y-1">
          {mine.map((d) => (
            <li key={d.localId} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {d.status === "uploading" ? "⏳" : d.status === "done" ? "✅" : "⚠️"} {d.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(d.localId)}
                  className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
                >
                  הסר
                </button>
              </div>
              {d.status === "error" && d.error && (
                <p className="mt-0.5 text-xs text-red-600">{d.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// A summary line that jumps back to the step it came from — clients review by
// tapping the row instead of hammering "חזרה" through the whole wizard.
export function Row({ k, v, onEdit }: { k: string; v: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <dt className="shrink-0 text-zinc-500">{k}</dt>
      <dd className="min-w-0">
        <button
          type="button"
          onClick={onEdit}
          className="flex max-w-full items-center gap-1.5 text-right font-medium"
        >
          <span className="truncate">{v}</span>
          <span aria-label="עריכה" className="shrink-0 text-xs text-blue-600">
            ✎
          </span>
        </button>
      </dd>
    </div>
  );
}
