"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type NoteView = { id: string; body: string; created_at: string };

// Agent scratchpad — the state-of-play that otherwise lives in WhatsApp/memory.
export default function NotesPanel({
  claimId,
  notes,
}: {
  claimId: string;
  notes: NoteView[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "שמירה נכשלה");
      return;
    }
    setDraft("");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      {notes.length === 0 ? (
        <p className="text-sm text-zinc-400">
          אין הערות עדיין — תעד כאן שיחות, סיכומים ותזכורות לתיק.
        </p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg bg-zinc-50 px-3 py-2">
              <p className="whitespace-pre-wrap text-sm text-zinc-700">{n.body}</p>
              <p className="mt-1 text-xs text-zinc-400">
                {new Date(n.created_at).toLocaleString("he-IL", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="הוסף הערה…"
          maxLength={2000}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "שומר…" : "שמור"}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
