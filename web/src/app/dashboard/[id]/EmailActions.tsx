"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EMAIL_COPY as C } from "@/lib/email/copy";
import { HANDLED_NONE, emailTargets } from "@/lib/email/pending";
import { HANDLING_LABEL } from "@/lib/handling/copy";
import type { HandlingStatus } from "@/lib/handling/types";
import HandlingDialog, { type DialogEmail } from "./HandlingDialog";

type Props = {
  claimId: string;
  email: DialogEmail;
  effective: HandlingStatus;
  demandAmount?: number | null;
  paidSoFar?: number | null;
};

// The action row under an inbound email that still waits for the clerk: set the
// claim's status from it (the dialog files the email's attachment as evidence),
// or say it changes nothing.
export default function EmailActions({ claimId, email, effective, demandAmount, paidSoFar }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<HandlingStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = emailTargets(effective);

  async function dismiss() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/emails/${email.id}/handled`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome: HANDLED_NONE }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      setError(C.actionFailed);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {targets.length > 0 && <span className="text-xs font-medium text-muted">{C.actionsLabel}</span>}
      {targets.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setTarget(s)}
          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-ink ring-1 ring-inset ring-line hover:ring-brand hover:text-brand"
        >
          {HANDLING_LABEL[s]}
        </button>
      ))}
      <button
        type="button"
        onClick={dismiss}
        disabled={busy}
        className="ms-auto text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
      >
        {C.actionNone}
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}

      {target && (
        <HandlingDialog
          claimId={claimId}
          effective={effective}
          demandAmount={demandAmount}
          paidSoFar={paidSoFar}
          initialTarget={target}
          email={email}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
