"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TaskView = {
  id: string;
  key: string | null;
  title: string;
  status: string;
  due_at: string | null;
  note: string | null;
  source: string;
};

function isOverdue(t: TaskView): boolean {
  return t.status !== "done" && !!t.due_at && new Date(t.due_at).getTime() < Date.now();
}

function dueLabel(due: string | null): string | null {
  if (!due) return null;
  return new Date(due).toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

// The claim's action worklist — engine-spawned chases + the agent's own tasks.
// Docs never appear here (they live in the derived checklist); this panel is
// the dated, stateful layer on top.
export default function TasksPanel({
  claimId,
  tasks,
}: {
  claimId: string;
  tasks: TaskView[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);

  const open = tasks
    .filter((t) => t.status !== "done")
    .sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  const done = tasks.filter((t) => t.status === "done");

  async function patch(taskId: string, body: Record<string, unknown>) {
    setBusyId(taskId);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "עדכון נכשל");
      return;
    }
    router.refresh();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    setAdding(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, ...(due ? { due_at: due } : {}) }),
    });
    setAdding(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "הוספה נכשלה");
      return;
    }
    setTitle("");
    setDue("");
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
      {open.length === 0 ? (
        <p className="text-sm text-zinc-400">אין משימות פתוחות.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((t) => {
            const overdue = isOverdue(t);
            return (
              <li
                key={t.id}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ${
                  overdue ? "bg-red-50 ring-1 ring-inset ring-red-200" : "bg-zinc-50"
                }`}
              >
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${overdue ? "text-red-800" : "text-zinc-800"}`}>
                    {t.status === "blocked" && <span className="ml-1">⏸</span>}
                    {t.title}
                    {t.source === "manual" && (
                      <span className="mr-1 text-xs font-normal text-zinc-400">· ידני</span>
                    )}
                  </p>
                  {t.due_at && (
                    <p className={`text-xs ${overdue ? "text-red-600" : "text-zinc-400"}`}>
                      {overdue ? "באיחור — " : "עד "}
                      {dueLabel(t.due_at)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => patch(t.id, { status: t.status === "blocked" ? "todo" : "blocked" })}
                    disabled={busyId === t.id}
                    className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                  >
                    {t.status === "blocked" ? "שחרר" : "חסום"}
                  </button>
                  <button
                    type="button"
                    onClick={() => patch(t.id, { status: "done" })}
                    disabled={busyId === t.id}
                    className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    ✓ בוצע
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="הוסף משימה…"
          maxLength={200}
          className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          className="rounded-lg border border-zinc-300 px-2 py-2 text-sm text-zinc-600 outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={adding || !title.trim()}
          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {adding ? "מוסיף…" : "הוסף"}
        </button>
      </form>
      {error && <p className="text-xs text-red-600">{error}</p>}

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-zinc-400">
            הושלמו ({done.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {done.map((t) => (
              <li key={t.id} className="text-sm text-zinc-400 line-through">
                {t.title}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
