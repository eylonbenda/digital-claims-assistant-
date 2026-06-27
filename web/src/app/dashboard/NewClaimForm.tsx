"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CreatedClaim {
  id: string;
  access_token: string;
  link: string;
}

export default function NewClaimForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClaim | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ client_name: clientName, client_phone: clientPhone }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "שגיאה ביצירת תביעה");
        return;
      }
      setCreated(json as CreatedClaim);
      router.refresh();
    } catch {
      setError("שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  function fullLink(link: string) {
    return `${window.location.origin}${link}`;
  }

  async function copyLink() {
    if (!created) return;
    await navigator.clipboard.writeText(fullLink(created.link));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function whatsappLink(link: string, name: string) {
    const msg = `שלום${name ? ` ${name}` : ""}, צרפתי קישור למילוי פרטי התאונה: ${fullLink(link)}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  }

  function reset() {
    setCreated(null);
    setClientName("");
    setClientPhone("");
    setOpen(false);
  }

  if (created) {
    return (
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        <p className="font-medium text-green-800">תביעה נוצרה — שלח את הקישור ללקוח</p>
        <div className="mt-3 flex items-center gap-2">
          <input
            readOnly
            value={fullLink(created.link)}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={copyLink}
            className="shrink-0 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm hover:bg-zinc-50"
          >
            {copied ? "✓ הועתק" : "העתק"}
          </button>
        </div>
        <div className="mt-2 flex gap-2">
          <a
            href={whatsappLink(created.link, clientName)}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            שלח בוואטסאפ
          </a>
          <button
            onClick={reset}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            תביעה חדשה
          </button>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-xl bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700"
      >
        + תביעה חדשה
      </button>
    );
  }

  return (
    <form
      onSubmit={handleCreate}
      className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3"
    >
      <h2 className="font-semibold text-zinc-800">תביעה חדשה</h2>

      <label className="block">
        <span className="text-sm text-zinc-600">שם הלקוח</span>
        <input
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder="אופציונלי"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </label>

      <label className="block">
        <span className="text-sm text-zinc-600">טלפון הלקוח</span>
        <input
          type="tel"
          value={clientPhone}
          onChange={(e) => setClientPhone(e.target.value)}
          placeholder="אופציונלי"
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
      </label>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "יוצר…" : "צור וקבל קישור"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
