"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SendItem } from "@/lib/outbound/queue";
import { reminderTarget } from "@/lib/cockpit/reminder";
import { REMINDER_FAILED, REMINDER_LABEL, REMINDER_NO_PHONE } from "@/lib/cockpit/copy";

// One reminder per claim: the due queue item when there is one, else the ad-hoc
// chase. No skip control by design (spec §6).
export default function ReminderButton({
  claimId, pendingSend, fallbackHref, fallbackBody, size,
}: {
  claimId: string;
  pendingSend: SendItem | null;
  fallbackHref: string | null;
  fallbackBody: string;
  size: "primary" | "secondary";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { href, payload } = reminderTarget(claimId, pendingSend, fallbackHref, fallbackBody);

  function fail() { setBusy(false); setError(REMINDER_FAILED); }

  // TRAP: window.open must run synchronously, before any state/fetch — an
  // await first and the popup blocker eats the send.
  function send() {
    if (href) window.open(href, "_blank", "noopener,noreferrer");
    setBusy(true); setError(null);
    fetch("/api/outbound/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then((res) => { if (res.ok) router.refresh(); else fail(); })
      .catch(fail);
  }

  const cls = size === "primary"
    ? "rounded-lg bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
    : "rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

  return (
    <span className="inline-flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button type="button" onClick={send} disabled={busy || !href}
        title={href ? undefined : REMINDER_NO_PHONE} className={cls}>
        {REMINDER_LABEL}
      </button>
    </span>
  );
}
