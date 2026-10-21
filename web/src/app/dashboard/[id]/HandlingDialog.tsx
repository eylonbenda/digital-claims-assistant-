"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  canTransition,
  requirementFor,
  type HandlingStatus,
} from "@/lib/handling/transitions";
import { HANDLING_STATUSES } from "@/lib/handling/types";
import { HANDLING_LABEL } from "@/lib/handling/copy";

const CLOSE_OPTIONS: { value: string; label: string }[] = [
  { value: "paid_closed", label: "שולמה ונסגרה" },
  { value: "rejected_final", label: "נדחתה — סופי" },
  { value: "for_information", label: "לידיעה בלבד" },
  { value: "other", label: "אחר" },
];

const EVIDENCE_LABEL: Record<string, string> = {
  payment_notice: "הודעת תשלום",
  rejection_letter: "מכתב דחייה",
};

type Props = {
  claimId: string;
  effective: HandlingStatus | null;
  onClose: () => void;
};

// Status dialog: pick a legal target, supply its required evidence/inputs,
// upload-then-transition. A failed PATCH after a successful upload leaves the
// doc in place — it is real evidence either way.
export default function HandlingDialog({ claimId, effective, onClose }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<HandlingStatus | "close" | null>(null);
  const [note, setNote] = useState("");
  const [closeReason, setCloseReason] = useState("for_information");
  const [lawyerName, setLawyerName] = useState("");
  const [lawyerPhone, setLawyerPhone] = useState("");
  const [lawyerEmail, setLawyerEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targets = HANDLING_STATUSES.filter((s) => canTransition(effective, s));
  const req = target && target !== "close" ? requirementFor(target) : {};

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (target !== "close" && req.evidenceDoc) {
        const file = fileRef.current?.files?.[0];
        if (!file) {
          setError(`יש לצרף ${EVIDENCE_LABEL[req.evidenceDoc]}`);
          setBusy(false);
          return;
        }
        const fd = new FormData();
        fd.append("type", req.evidenceDoc);
        fd.append("file", file);
        const up = await fetch(`/api/claims/${claimId}/documents`, { method: "POST", body: fd });
        if (!up.ok) {
          const j = await up.json().catch(() => ({}));
          setError((j as { error?: string }).error ?? "העלאת המסמך נכשלה");
          setBusy(false);
          return;
        }
      }

      const body =
        target === "close"
          ? { close: { reason: closeReason, ...(note.trim() ? { note: note.trim() } : {}) } }
          : {
              to: target,
              ...(note.trim() ? { note: note.trim() } : {}),
              ...(req.lawyer
                ? {
                    lawyer: {
                      name: lawyerName,
                      ...(lawyerPhone.trim() ? { phone: lawyerPhone } : {}),
                      ...(lawyerEmail.trim() ? { email: lawyerEmail } : {}),
                    },
                  }
                : {}),
            };

      const res = await fetch(`/api/claims/${claimId}/handling`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError((j as { error?: string }).error ?? "העדכון נכשל");
        setBusy(false);
        return;
      }
      router.refresh();
      onClose();
    } catch {
      setError("העדכון נכשל — נסו שוב");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-900">עדכון סטטוס מול המבטחת</h3>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            ✕
          </button>
        </div>

        <p className="mb-3 text-sm text-zinc-500">
          סטטוס נוכחי:{" "}
          <span className="font-medium text-zinc-800">
            {effective ? HANDLING_LABEL[effective] : "טרם נשלחה"}
          </span>
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {targets.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { setTarget(s); setError(null); }}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-inset ${
                target === s
                  ? "bg-blue-600 text-white ring-blue-600"
                  : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50"
              }`}
            >
              {HANDLING_LABEL[s]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setTarget("close"); setError(null); }}
            className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-inset ${
              target === "close"
                ? "bg-zinc-800 text-white ring-zinc-800"
                : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50"
            }`}
          >
            סגירת תביעה
          </button>
        </div>

        {target && target !== "close" && req.evidenceDoc && (
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-zinc-500">
              {EVIDENCE_LABEL[req.evidenceDoc]} (חובה)
            </label>
            <input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.heic,.pdf" className="w-full text-sm" />
          </div>
        )}

        {target === "close" && (
          <div className="mb-3 space-y-1">
            {CLOSE_OPTIONS.map((o) => (
              <label key={o.value} className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="radio"
                  name="close-reason"
                  value={o.value}
                  checked={closeReason === o.value}
                  onChange={() => setCloseReason(o.value)}
                />
                {o.label}
              </label>
            ))}
          </div>
        )}

        {target && (target === "close" || req.note || true) && (
          <div className="mb-3">
            <label htmlFor="handling-note" className="mb-1 block text-xs font-medium text-zinc-500">
              {target === "docs_requested"
                ? "מה המבטחת ביקשה? (חובה)"
                : target === "appeal"
                  ? "סיבת הערעור (חובה)"
                  : "הערה (רשות)"}
            </label>
            <textarea
              id="handling-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        )}

        {target && target !== "close" && req.lawyer && (
          <div className="mb-3 space-y-2">
            <input
              value={lawyerName}
              onChange={(e) => setLawyerName(e.target.value)}
              placeholder="שם עורך הדין (חובה)"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={lawyerPhone}
              onChange={(e) => setLawyerPhone(e.target.value)}
              placeholder="טלפון"
              dir="ltr"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              value={lawyerEmail}
              onChange={(e) => setLawyerEmail(e.target.value)}
              placeholder="אימייל"
              dir="ltr"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!target || busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? "מעדכן…" : "עדכון"}
          </button>
        </div>
      </div>
    </div>
  );
}
