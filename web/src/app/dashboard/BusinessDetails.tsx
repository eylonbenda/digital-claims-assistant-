"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUSINESS } from "@/lib/dashboard/copy";

export default function BusinessDetails({
  initial,
}: {
  initial: { name: string | null; phone: string | null; email: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/agents/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone, email }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const j = await res.json().catch(() => null);
        setError(res.status === 400 && j?.error ? j.error : BUSINESS.genericError);
      }
    } catch {
      setError(BUSINESS.genericError);
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-bold text-zinc-900">{BUSINESS.title}</h2>
      <p className="mt-0.5 text-xs text-zinc-500">{BUSINESS.hint}</p>
      <form onSubmit={save} className="mt-4 space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm text-zinc-700">
            {BUSINESS.name}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              className={input}
            />
          </label>
          <label className="block text-sm text-zinc-700">
            {BUSINESS.phone}
            <input
              type="tel"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={input}
            />
          </label>
          <label className="block text-sm text-zinc-700">
            {BUSINESS.email}
            <input
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? BUSINESS.saving : BUSINESS.save}
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
          {saved && !error && <span className="text-sm text-emerald-700">{BUSINESS.saved}</span>}
        </div>
      </form>
    </section>
  );
}
