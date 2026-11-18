"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EMAIL_COPY as C } from "@/lib/email/copy";

type Props = {
  address: string; // the business's system address — read-only, set by us
  claimsMailbox: string;
  lastReceived: string | null; // already formatted
  insurerDomains: string[];
};

// Email for this business: its system address, where copies go, and how to route
// insurer mail that still arrives at its own mailbox.
export default function EmailSetup({ address, claimsMailbox, lastReceived, insurerDomains }: Props) {
  const router = useRouter();
  const [mailbox, setMailbox] = useState(claimsMailbox);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older webviews reject the clipboard API; the address stays selectable.
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/agents/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claims_mailbox: mailbox }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const j = await res.json().catch(() => null);
        setError(res.status === 400 && j?.error ? j.error : C.setupSaveFailed);
      }
    } catch {
      setError(C.setupSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-bold text-zinc-900">{C.setupTitle}</h2>
      <p className="mt-0.5 text-xs text-zinc-500">{C.setupHint}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-sm text-zinc-700">{C.setupAddress}</div>
          <div className="mt-1 flex items-center gap-2">
            <code className="min-w-0 flex-1 select-all truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800" dir="ltr">
              {address}
            </code>
            <button
              type="button"
              onClick={copyAddress}
              className="shrink-0 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              {copied ? C.setupCopied : C.setupCopy}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{C.setupAddressHint}</p>
        </div>

        <form onSubmit={save}>
          <label htmlFor="claims-mailbox" className="block text-sm text-zinc-700">
            {C.setupMailbox}
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="claims-mailbox"
              type="email"
              dir="ltr"
              value={mailbox}
              onChange={(e) => {
                setMailbox(e.target.value);
                setSaved(false);
              }}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {C.setupSave}
            </button>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            {error ? <span className="text-red-700">{error}</span> : saved ? <span className="text-emerald-700">{C.setupSaved}</span> : C.setupMailboxHint}
          </p>
        </form>
      </div>

      <p className="mt-4 text-sm text-zinc-700">
        {C.setupLast}: <span className="text-zinc-500">{lastReceived ?? C.setupNoMail}</span>
      </p>

      <details className="mt-4 rounded-lg border border-zinc-200 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-zinc-700">{C.setupForwardTitle}</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pe-1 ps-5 text-sm text-zinc-700">
          {C.setupSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="mt-3 text-sm text-zinc-700">{C.setupDomains}:</div>
        {insurerDomains.length ? (
          <p className="mt-1 select-all rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-700" dir="ltr">
            {insurerDomains.join(", ")}
          </p>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">{C.setupDomainsEmpty}</p>
        )}
      </details>
    </section>
  );
}
