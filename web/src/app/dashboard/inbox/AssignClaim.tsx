"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EMAIL_COPY as C } from "@/lib/email/copy";

export type AssignableClaim = { id: string; name: string; plates: string[] };

const digits = (s: string) => s.replace(/\D/g, "");

// Picks one of the business's open claims by client name or plate and files the
// message on it.
export default function AssignClaim({ emailId, claims }: { emailId: string; claims: AssignableClaim[] }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase();
    const num = digits(term);
    const hit = (c: AssignableClaim) =>
      !term ||
      c.name.toLowerCase().includes(term) ||
      (num.length >= 3 && c.plates.some((p) => digits(p).includes(num)));
    return claims.filter(hit).slice(0, 6);
  }, [q, claims]);

  async function assign(claimId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/emails/${emailId}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_id: claimId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(typeof data?.error === "string" && res.status === 409 ? data.error : C.assignFailed);
      setBusy(false);
      return;
    }
    startTransition(() => router.refresh());
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
      >
        {C.assign}
      </button>
    );
  }

  return (
    <div className="max-w-md">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={C.assignSearch}
        aria-label={C.assignSearch}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
      />
      {matches.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{C.assignNoResults}</p>
      ) : (
        <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={busy}
                onClick={() => assign(c.id)}
                className="flex w-full items-center justify-between gap-3 bg-white px-3 py-2 text-start text-sm hover:bg-brand-soft disabled:opacity-50"
              >
                <span className="truncate font-medium text-ink">{c.name}</span>
                <span className="shrink-0 text-xs text-muted" dir="ltr">{c.plates.join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}
