"use client";

import { useState } from "react";
import { compressImage } from "@/lib/images/compress";

type DocType = "car_photo" | "drivers_license" | "vehicle_reg" | "third_party_doc";
type LocalDoc = {
  localId: string;
  type: DocType;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
};

const FIELDS: { type: DocType; label: string; hint?: string; multiple?: boolean }[] = [
  { type: "car_photo", label: "תמונות הרכב והנזק", hint: "כמה זוויות של הנזק", multiple: true },
  { type: "drivers_license", label: "רישיון נהיגה" },
  { type: "vehicle_reg", label: "רישיון רכב" },
  { type: "third_party_doc", label: "מסמכי הצד השני", hint: "אם רלוונטי", multiple: true },
];

const TYPE_LABEL: Record<string, string> = {
  car_photo: "תמונות הרכב והנזק",
  drivers_license: "רישיון נהיגה",
  vehicle_reg: "רישיון רכב",
  third_party_doc: "מסמכי הצד השני",
};

// Post-submit document upload: the client can add documents they didn't include the
// first time (the agent often asks for more). Reuses POST /api/claims/documents.
export default function FollowupUpload({
  token,
  existingCounts,
}: {
  token: string;
  existingCounts: Record<string, number>;
}) {
  const [docs, setDocs] = useState<LocalDoc[]>([]);

  async function uploadDoc(type: DocType, file: File) {
    const localId = crypto.randomUUID();
    setDocs((p) => [...p, { localId, type, name: file.name, status: "uploading" }]);
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append("token", token);
      fd.append("type", type);
      fd.append("file", compressed);
      const res = await fetch("/api/claims/documents", { method: "POST", body: fd });
      const err = res.ok
        ? undefined
        : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? "ההעלאה נכשלה");
      setDocs((p) =>
        p.map((d) =>
          d.localId === localId ? { ...d, status: res.ok ? "done" : "error", error: err } : d
        )
      );
    } catch {
      setDocs((p) =>
        p.map((d) => (d.localId === localId ? { ...d, status: "error" } : d))
      );
    }
  }

  const existingTotal = Object.values(existingCounts).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-md p-6">
      <div className="text-center">
        <div className="text-5xl">✅</div>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">הפרטים נשלחו לסוכן</h1>
        <p className="mt-2 text-zinc-500">
          תודה! צריך להוסיף מסמך או תמונה שלא צירפת? אפשר להעלות גם עכשיו —
          זה יתווסף לתיק אצל הסוכן.
        </p>
      </div>

      {existingTotal > 0 && (
        <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-500">
          כבר בתיק:{" "}
          {Object.entries(existingCounts)
            .filter(([, n]) => n > 0)
            .map(([t, n]) => `${TYPE_LABEL[t] ?? t} (${n})`)
            .join(" · ")}
        </p>
      )}

      <div className="mt-5 space-y-3">
        {FIELDS.map((f) => (
          <DocField
            key={f.type}
            label={f.label}
            hint={f.hint}
            type={f.type}
            multiple={f.multiple}
            docs={docs}
            onPick={(type, files) => Array.from(files).forEach((file) => uploadDoc(type, file))}
          />
        ))}
      </div>
    </div>
  );
}

function DocField({
  label,
  hint,
  type,
  multiple,
  docs,
  onPick,
}: {
  label: string;
  hint?: string;
  type: DocType;
  multiple?: boolean;
  docs: LocalDoc[];
  onPick: (type: DocType, files: FileList) => void;
}) {
  const mine = docs.filter((d) => d.type === type);
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <label className="shrink-0 cursor-pointer rounded-lg border border-blue-600 px-3 py-1.5 text-sm text-blue-700">
          {mine.length ? "הוסף/י" : "צילום / קובץ"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
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
              <div className="flex items-center gap-2">
                <span className="truncate">
                  {d.status === "uploading" ? "⏳" : d.status === "done" ? "✅" : "⚠️"} {d.name}
                </span>
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
