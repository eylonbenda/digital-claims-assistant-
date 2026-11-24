"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EMAIL_COPY as C } from "@/lib/email/copy";

// Takes an email that was filed on the wrong claim back to the inbox, where it can
// be filed again. Asks once: the email leaves this page.
export default function UnassignEmail({ emailId }: { emailId: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function unassign() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/emails/${emailId}/assign`, { method: "DELETE" }).catch(() => null);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setError(res?.status === 409 && typeof data?.error === "string" ? data.error : C.unassignFailed);
      setBusy(false);
      return;
    }
    router.refresh();
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline"
      >
        {C.unassign}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="text-ink">{C.unassignConfirm}</span>
      <button type="button" onClick={unassign} disabled={busy} className="font-medium text-red-700 hover:underline disabled:opacity-50">
        {C.unassignYes}
      </button>
      <button type="button" onClick={() => { setAsking(false); setError(null); }} disabled={busy} className="text-muted hover:text-ink hover:underline disabled:opacity-50">
        {C.unassignNo}
      </button>
      {error && <span className="w-full text-red-600">{error}</span>}
    </div>
  );
}
