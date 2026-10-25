"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SUBMISSION_COPY as C } from "@/lib/submission/copy";
import { validRecipient } from "@/lib/submission/confirm";

export type SubmissionView = {
  insurerKey: string | null;
  recipient: string | null; // verified directory address, else null
  subject: string;
  body: string;
  attachments: { label: string; url: string | null }[];
};

type Props = {
  claimId: string;
  submission: SubmissionView;
  insurers: { key: string; label: string }[];
};

// Copy button with clipboard → select-text fallback (older desktop webviews
// reject navigator.clipboard; silently doing nothing is the bug we avoid).
function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      ref.current?.focus();
      ref.current?.select();
    }
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
        >
          {copied ? C.copied : C.copy}
        </button>
      </div>
      <textarea
        ref={ref}
        readOnly
        value={value}
        rows={value.includes("\n") ? Math.min(value.split("\n").length + 1, 14) : 1}
        className={`w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800 ${mono ? "font-mono" : ""}`}
        dir="rtl"
      />
    </div>
  );
}

export default function SubmissionPanel({ claimId, submission, insurers }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [insurerKey, setInsurerKey] = useState(submission.insurerKey ?? "");
  const [recipient, setRecipient] = useState(submission.recipient ?? "");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipientValid = !!validRecipient(recipient);
  const manualRecipient = submission.recipient === null;

  async function confirmSent() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/submission`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: recipient.trim(),
        subject: submission.subject,
        ...(insurerKey ? { insurerKey } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "השמירה נכשלה — נסו שוב");
      setBusy(false);
      setAsking(false);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className="rounded-2xl border border-teal-200 bg-white p-5">
      <h2 className="text-lg font-semibold text-zinc-900">{C.title}</h2>
      <p className="mb-4 mt-1 text-sm text-zinc-500">{C.subtitle}</p>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="sub-insurer" className="mb-1 block text-xs font-medium text-zinc-500">
              {C.insurerLabel}
            </label>
            <select
              id="sub-insurer"
              value={insurerKey}
              onChange={(e) => setInsurerKey(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">{C.insurerPlaceholder}</option>
              {insurers.map((i) => (
                <option key={i.key} value={i.key}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sub-recipient" className="mb-1 block text-xs font-medium text-zinc-500">
              {C.recipientLabel}
            </label>
            <input
              id="sub-recipient"
              type="email"
              dir="ltr"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="claims@..."
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
            />
            {manualRecipient && (
              <p className="mt-1 text-xs text-amber-700">{C.recipientManualHint}</p>
            )}
          </div>
        </div>

        <CopyField label={C.subjectLabel} value={submission.subject} />
        <CopyField label={C.bodyLabel} value={submission.body} />

        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            {C.attachmentsLabel} ({submission.attachments.length})
          </span>
          <ul className="space-y-1">
            {submission.attachments.map((a, i) => (
              <li key={i} className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5 text-sm">
                <span className="text-zinc-700">{a.label}</span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    הורדה ↗
                  </a>
                ) : (
                  <span className="text-xs text-red-500">קישור לא זמין</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {asking ? (
          <div className="flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2">
            <span className="text-sm font-medium text-teal-900">{C.confirmAsk}</span>
            <button
              type="button"
              onClick={confirmSent}
              disabled={busy}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {C.confirmYes}
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              disabled={busy}
              className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              {C.confirmNo}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAsking(true)}
            disabled={!recipientValid}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
            title={recipientValid ? undefined : C.invalidRecipient}
          >
            {C.confirm}
          </button>
        )}
      </div>
    </section>
  );
}
