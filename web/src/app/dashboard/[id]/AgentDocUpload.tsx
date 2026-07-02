"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const DOC_OPTIONS: { type: string; label: string }[] = [
  { type: "appraiser_report",      label: "דוח שמאי" },
  { type: "garage_invoice",        label: "חשבונית תיקון" },
  { type: "repair_receipt",        label: "קבלה על תשלום" },
  { type: "assessor_fee_invoice",  label: 'חשבון שכ"ט שמאי' },
  { type: "assessor_fee_receipt",  label: 'קבלה שכ"ט שמאי' },
  { type: "no_claim_confirmation", label: "אישור אי-הגשת תביעה" },
  { type: "loss_confirmation",     label: "אישור הפסדים" },
  { type: "bank_details",          label: "פרטי חשבון בנק" },
  { type: "demand_form",           label: "מכתב דרישה" },
  { type: "police_report",         label: "אישור משטרה" },
  { type: "insurance_history",     label: "עבר ביטוחי" },
  { type: "lien_release",          label: "אישור הסרת שיעבוד" },
  { type: "info_consent",          label: "הסכמה למשרד הרישוי" },
  { type: "power_of_attorney",     label: "ייפוי כוח" },
  { type: "vat_offset_confirmation", label: 'אישור רו"ח — קיזוז מע"מ' },
  { type: "keys",                  label: "מפתחות" },
  { type: "id_card",               label: "תעודת זהות" },
  { type: "car_photo",             label: "תמונות נוספות" },
  { type: "third_party_doc",       label: "מסמכי צד ג'" },
  { type: "other",                 label: "אחר" },
];

export default function AgentDocUpload({ claimId }: { claimId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState(DOC_OPTIONS[0].type);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setDone(false);

    const fd = new FormData();
    fd.append("type", docType);
    fd.append("file", file);

    const res = await fetch(`/api/claims/${claimId}/documents`, {
      method: "POST",
      body: fd,
    });
    const json = await res.json().catch(() => ({}));

    setUploading(false);
    if (!res.ok) {
      setError(json.error ?? "שגיאה בהעלאה");
    } else {
      setDone(true);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh(); // revalidate server components (checklist + docs gallery)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white py-3 text-sm text-zinc-600 hover:border-blue-400 hover:text-blue-600"
      >
        <span>＋</span> העלאת מסמך לתיק
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-800">העלאת מסמך לתיק</span>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setDone(false); }}
          className="text-sm text-zinc-400 hover:text-zinc-600"
        >
          סגור
        </button>
      </div>

      <select
        value={docType}
        onChange={(e) => setDocType(e.target.value)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800"
      >
        {DOC_OPTIONS.map((o) => (
          <option key={o.type} value={o.type}>
            {o.label}
          </option>
        ))}
      </select>

      <input
        ref={fileRef}
        type="file"
        accept=".jpg,.jpeg,.png,.heic,.pdf"
        required
        className="w-full text-sm text-zinc-700 file:ml-2 file:rounded file:border-0 file:bg-zinc-100 file:px-3 file:py-1 file:text-sm file:text-zinc-700"
      />

      {error && <p className="text-xs text-red-600">{error}</p>}
      {done && <p className="text-xs text-green-600">הועלה בהצלחה ✓</p>}

      <button
        type="submit"
        disabled={uploading}
        className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {uploading ? "מעלה…" : "העלה"}
      </button>
    </form>
  );
}
