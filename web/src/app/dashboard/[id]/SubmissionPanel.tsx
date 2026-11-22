"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SUBMISSION_COPY as C } from "@/lib/submission/copy";
import { validRecipient } from "@/lib/submission/confirm";
import { EMAIL_COPY as E } from "@/lib/email/copy";

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
  // `address`: the directory's claims address for this claim's track, when we have one.
  insurers: { key: string; label: string; address?: string | null }[];
  // third_party_report only: choosing the insurer saves it as the at-fault insurer right
  // away (re-addressing the demand letter and closing "להשיג פרטי מבטח צד ג'"), instead
  // of only at the final confirm.
  saveInsurerOnChange?: boolean;
  // Sending from the app. Off → the panel is prepare-and-confirm only, as before.
  direct: { enabled: boolean; fromAddress: string | null; ccAddress: string | null };
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

export default function SubmissionPanel({ claimId, submission, insurers, saveInsurerOnChange, direct }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [insurerKey, setInsurerKey] = useState(submission.insurerKey ?? "");
  const [recipient, setRecipient] = useState(submission.recipient ?? "");
  const [demand, setDemand] = useState("");
  const [asking, setAsking] = useState(false);
  const [confirming, setConfirming] = useState(false); // the direct send's confirm step
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipientValid = !!validRecipient(recipient);
  const addressOf = (key: string) => insurers.find((i) => i.key === key)?.address ?? null;
  // Manual entry is needed only when the chosen insurer has no directory address.
  const manualRecipient = !addressOf(insurerKey);

  async function chooseInsurer(key: string) {
    const previous = addressOf(insurerKey) ?? "";
    setInsurerKey(key);
    // Follow the directory unless the clerk typed an address of their own.
    if (!recipient.trim() || recipient.trim() === previous) setRecipient(addressOf(key) ?? "");
    if (!saveInsurerOnChange || !key) return;
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/demand-form`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ at_fault_insurer: key }),
    }).catch(() => null);
    if (!res?.ok) {
      setError(C.insurerSaveFailed);
      return;
    }
    startTransition(() => router.refresh());
  }

  // The amount first: a mistyped number should stop here, before anything is sent
  // or marked sent. Left empty, nothing is recorded and it can be added later.
  async function saveDemand(): Promise<boolean> {
    if (!demand.trim()) return true;
    const res = await fetch(`/api/claims/${claimId}/amounts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ demand_amount: demand }),
    });
    if (res.ok) return true;
    const data = await res.json().catch(() => null);
    setError(data?.error ?? "שמירת הסכום נכשלה — נסו שוב");
    return false;
  }

  async function sendDirect() {
    setBusy(true);
    setError(null);
    if (!(await saveDemand())) {
      setBusy(false);
      setConfirming(false);
      return;
    }
    const res = await fetch(`/api/claims/${claimId}/submission/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: recipient.trim(),
        confirmed: true,
        ...(insurerKey ? { insurerKey } : {}),
      }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(data?.error ?? E.sendFailed);
      setBusy(false);
      setConfirming(false);
      // The message went out but the claim could not be marked: show the claim as it now is.
      if (data?.sent) startTransition(() => router.refresh());
      return;
    }
    startTransition(() => router.refresh());
  }

  async function confirmSent() {
    setBusy(true);
    setError(null);
    if (!(await saveDemand())) {
      setBusy(false);
      setAsking(false);
      return;
    }
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

  // "I sent it myself" — the prepare-and-confirm action.
  const manualConfirm = asking ? (
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
    );

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
              onChange={(e) => chooseInsurer(e.target.value)}
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

        {!direct.enabled && (
          <>
            <CopyField label={C.subjectLabel} value={submission.subject} />
            <CopyField label={C.bodyLabel} value={submission.body} />
          </>
        )}

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

        <div className="max-w-xs">
          <label htmlFor="sub-demand" className="mb-1 block text-xs font-medium text-zinc-500">
            {C.demandLabel}
          </label>
          <input
            id="sub-demand"
            value={demand}
            onChange={(e) => setDemand(e.target.value)}
            inputMode="decimal"
            dir="ltr"
            placeholder="0"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-zinc-400">{C.demandHint}</p>
        </div>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {direct.enabled ? (
          <>
            {confirming ? (
              <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50 p-4">
                <h3 className="text-sm font-semibold text-teal-900">{E.confirmTitle}</h3>
                <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-zinc-500">{E.confirmTo}</dt>
                  <dd className="break-all font-medium text-zinc-900">
                    <bdi dir="ltr">{recipient.trim()}</bdi>
                  </dd>
                  <dt className="text-zinc-500">{E.confirmCc}</dt>
                  <dd className="break-all text-zinc-800">
                    {direct.ccAddress ? <bdi dir="ltr">{direct.ccAddress}</bdi> : E.confirmNoCc}
                  </dd>
                  {direct.fromAddress && (
                    <>
                      <dt className="text-zinc-500">{E.confirmFrom}</dt>
                      <dd className="break-all text-zinc-800">
                        <bdi dir="ltr">{direct.fromAddress}</bdi>
                      </dd>
                    </>
                  )}
                  <dt className="text-zinc-500">{E.confirmSubject}</dt>
                  <dd className="text-zinc-800">{submission.subject}</dd>
                  <dt className="text-zinc-500">{E.confirmAttachments}</dt>
                  <dd className="text-zinc-800">
                    {submission.attachments.length === 0
                      ? "—"
                      : submission.attachments.map((a) => a.label).join(" · ")}
                  </dd>
                </dl>
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-teal-100 bg-white px-3 py-2 text-sm text-zinc-700">
                  {submission.body}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={sendDirect}
                    disabled={busy}
                    className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {busy ? E.sending : E.confirmYes}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
                  >
                    {E.confirmNo}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
                disabled={!recipientValid}
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-40"
                title={recipientValid ? undefined : C.invalidRecipient}
              >
                {E.sendButton}
              </button>
            )}

            {/* The old flow stays reachable: send from your own mailbox, then mark it. */}
            <details className="rounded-xl border border-zinc-200 px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-zinc-600">{E.manualTitle}</summary>
              <div className="mt-3 space-y-4">
                <CopyField label={C.subjectLabel} value={submission.subject} />
                <CopyField label={C.bodyLabel} value={submission.body} />
                {manualConfirm}
              </div>
            </details>
          </>
        ) : (
          manualConfirm
        )}
      </div>
    </section>
  );
}
