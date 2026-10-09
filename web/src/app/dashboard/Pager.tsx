"use client";

import { useState } from "react";

// Page state for one dashboard list, mirrored into `?<param>=` via replaceState
// (same pattern as CockpitTabs) so "back" from a claim lands on the same page.
// Seeded from the server-read searchParams — no useSearchParams, no Suspense.
export function useUrlPage(param: string, initial: number) {
  const [page, setPage] = useState(initial);
  function go(next: number, scrollTo?: string) {
    setPage(next);
    const url = new URL(window.location.href);
    if (next <= 1) url.searchParams.delete(param);
    else url.searchParams.set(param, String(next));
    window.history.replaceState(null, "", url);
    if (scrollTo) document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return [page, go] as const;
}

export default function Pager({
  page, pages, from, to, total, onPage,
}: {
  page: number; pages: number; from: number; to: number; total: number;
  onPage: (next: number) => void;
}) {
  if (pages <= 1) return null;
  const btn =
    "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:hover:bg-white";
  // dir=rtl: "הקודם" sits on the right, so the arrows point in reading direction.
  return (
    <nav dir="rtl" aria-label="דפדוף" className="mt-3 flex items-center justify-between gap-2">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        → הקודם
      </button>
      <span className="text-xs text-zinc-500">
        {from}–{to} מתוך {total} · עמוד {page} מתוך {pages}
      </span>
      <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>
        הבא ←
      </button>
    </nav>
  );
}
