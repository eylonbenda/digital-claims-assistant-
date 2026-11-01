"use client";

import { useSearchParams } from "next/navigation";
import { parseStageFilter, type StageFilter } from "@/lib/dashboard/list";
import { parsePage } from "@/lib/dashboard/paginate";
import { withSearchParam } from "@/lib/dashboard/url-state";

// List state lives in the URL, not in useState: the value is DERIVED from
// useSearchParams and written with window.history.replaceState, which Next 16
// patches to update its router (and useSearchParams). This is what makes "back"
// from a claim work: the client router restores /dashboard from its cached RSC
// payload (rendered for the URL without ?stage/?p), so a server-seeded prop or
// useState initialiser would be stale — but useSearchParams reflects the restored
// URL. The dashboard route is dynamic (awaits searchParams), so this needs no
// Suspense boundary and SSR sees the same params.
export function useUrlPage(param: string) {
  const page = parsePage(useSearchParams().get(param) ?? undefined);
  function go(next: number, scrollTo?: string) {
    window.history.replaceState(null, "", withSearchParam(window.location.href, param, next <= 1 ? null : String(next)));
    if (scrollTo) document.getElementById(scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return [page, go] as const;
}

// Stage chip, mirrored into `?stage=` the same way ("all" is the default → no param).
export function useUrlStage() {
  const stage = parseStageFilter(useSearchParams().get("stage") ?? undefined);
  function go(next: StageFilter) {
    window.history.replaceState(null, "", withSearchParam(window.location.href, "stage", next === "all" ? null : next));
  }
  return [stage, go] as const;
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
