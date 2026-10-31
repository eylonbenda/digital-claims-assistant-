"use client";

import Link from "next/link";
import { useState } from "react";
import type { ClaimRow } from "@/lib/dashboard/compose";
import {
  ACTIVITY_HEADER, ALL_CHIP, ALL_DONE_NOTE, CLIENT_HEADER, COPY_LINK_LABEL, EMPTY_STAGE_NOTE,
  NEEDS_YOU_CHIP, NEXT_STEP_HEADER, NO_RESULTS, SEARCH_PLACEHOLDER, STAGE_HEADER, STAGE_LABEL, activityAgo, clientNameLabel,
} from "@/lib/dashboard/copy";
import { chipCounts, visibleRows, type StageFilter } from "@/lib/dashboard/list";
import { paginate } from "@/lib/dashboard/paginate";
import type { Stage } from "@/lib/dashboard/stage";
import Pager, { useUrlPage, useUrlStage } from "./Pager";

const ROWS_PER_PAGE = 25;

// Client name | stage | next step | last activity | copy. Below md the grid
// collapses to two lines: name + stage badge / next step.
const GRID = "grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 md:grid-cols-[2fr_1.4fr_3fr_1fr_2rem] md:items-start";

const STAGE_BADGE: Record<Stage, string> = {
  with_client: "bg-zinc-100 text-zinc-700",
  before_send: "bg-amber-100 text-amber-800",
  sent: "bg-blue-100 text-blue-800",
  awaiting_payment: "bg-violet-100 text-violet-800",
  closed: "bg-zinc-100 text-zinc-400",
};

const CHIPS: { key: StageFilter; label: string }[] = [
  { key: "all", label: ALL_CHIP },
  { key: "needs_you", label: NEEDS_YOU_CHIP },
  { key: "with_client", label: STAGE_LABEL.with_client },
  { key: "before_send", label: STAGE_LABEL.before_send },
  { key: "sent", label: STAGE_LABEL.sent },
  { key: "awaiting_payment", label: STAGE_LABEL.awaiting_payment },
  { key: "closed", label: STAGE_LABEL.closed },
];

function CopyLinkButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(e: React.MouseEvent) {
    // The row is one big link — copying must not navigate.
    e.preventDefault();
    e.stopPropagation();
    const link = `${window.location.origin}/c/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={COPY_LINK_LABEL}
      aria-label={COPY_LINK_LABEL}
      className="relative z-10 rounded p-1 text-xs text-blue-600 hover:bg-zinc-100"
    >
      {copied ? "✓" : "🔗"}
    </button>
  );
}

function Row({ row, now }: { row: ClaimRow; now: Date }) {
  const lineColor = row.send ? "text-red-700" : row.needs_action ? "text-amber-800" : "text-zinc-500";
  return (
    <li className={`relative px-3 py-3 hover:bg-zinc-50 ${GRID}`}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1">
          {row.needs_action && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label={NEEDS_YOU_CHIP} />
          )}
          {row.urgent && <span className="text-red-500">⚑</span>}
          <Link
            href={`/dashboard/${row.claim_id}`}
            className={`font-medium after:absolute after:inset-0 hover:underline ${row.closed ? "text-zinc-400" : "text-zinc-900"}`}
          >
            {clientNameLabel(row.client_name)}
          </Link>
          {row.fresh && (
            <span className="ms-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800">
              {row.fresh === "submitted" ? "חדש" : "מסמך חדש"}
            </span>
          )}
        </div>
        {(row.phone || row.client_plate) && (
          <p className="hidden text-xs text-zinc-400 md:block">
            {[row.phone, row.client_plate].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>

      <div className="justify-self-end md:justify-self-start">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STAGE_BADGE[row.stage]}`}>
          {STAGE_LABEL[row.stage]}
        </span>
        <p className="hidden text-xs text-zinc-400 md:block">{row.track_label}</p>
      </div>

      <div className="col-span-2 min-w-0 md:col-span-1">
        <p className={`text-sm ${lineColor}`}>{row.action_line}</p>
        {row.also_line && <p className="text-xs text-amber-800">{row.also_line}</p>}
        {row.ai_line && <p className="text-xs text-zinc-400">{row.ai_line}</p>}
      </div>

      <p className="hidden text-xs text-zinc-500 md:block">{activityAgo(row.activity_at, now)}</p>

      <div className="hidden justify-self-end md:block">
        {!row.closed && <CopyLinkButton token={row.access_token} />}
      </div>
    </li>
  );
}

export default function ClaimsList({
  rows, greeting, dateLabel, nowIso, name,
}: {
  rows: ClaimRow[];
  greeting: string;
  dateLabel: string;
  // Server render time — keeps relative labels identical on SSR and hydration.
  nowIso: string;
  name: string | null;
}) {
  // The query is state only — names/phones must not land in the URL.
  const [query, setQuery] = useState("");
  const [stage, setStage] = useUrlStage();
  const [page, setPage] = useUrlPage("p");

  const heading = (
    <div className="mb-3">
      <h2 className="text-lg font-bold text-zinc-900">
        {greeting}{name ? `, ${name}` : ""} 👋{" "}
        <span className="text-sm font-normal text-zinc-500">· {dateLabel}</span>
      </h2>
    </div>
  );

  if (rows.length === 0) {
    return (
      <section dir="rtl" id="claims-list">
        {heading}
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="font-medium text-zinc-800">צור את התביעה הראשונה שלך</p>
          <p className="mt-1 text-sm text-zinc-500">
            לחץ &quot;תביעה חדשה&quot;, שלח ללקוח את הקישור — והמערכת תאסוף את המסמכים והפרטים בשבילך.
          </p>
        </div>
      </section>
    );
  }

  const counts = chipCounts(rows, query);
  const visible = visibleRows(rows, stage, query);
  const paged = paginate(visible, page, ROWS_PER_PAGE);
  const now = new Date(nowIso);

  function pickStage(next: StageFilter) {
    setStage(next);
    setPage(1);
  }

  const chipBase = "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs";
  const emptyNote =
    query.trim() !== "" ? NO_RESULTS : stage === "needs_you" ? ALL_DONE_NOTE : EMPTY_STAGE_NOTE;

  return (
    <section dir="rtl" id="claims-list">
      {heading}

      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setPage(1); }}
        placeholder={SEARCH_PLACEHOLDER}
        className="mb-3 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
      />

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {CHIPS.map(({ key, label }) => {
          const active = stage === key;
          const tone = active
            ? "border-zinc-900 bg-zinc-900 text-white"
            : key === "needs_you"
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50";
          return (
            <button key={key} type="button" onClick={() => pickStage(key)} aria-pressed={active}
              className={`${chipBase} ${tone}`}>
              {label}
              {key !== "closed" && ` · ${counts[key]}`}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-4 text-center text-sm text-zinc-500">
          {emptyNote}
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <div className={`hidden border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-500 md:grid ${GRID}`}>
            <span>{CLIENT_HEADER}</span>
            <span>{STAGE_HEADER}</span>
            <span>{NEXT_STEP_HEADER}</span>
            <span>{ACTIVITY_HEADER}</span>
            <span />
          </div>
          <ul className="divide-y divide-zinc-100">
            {paged.items.map((r) => <Row key={r.claim_id} row={r} now={now} />)}
          </ul>
        </div>
      )}
      <Pager {...paged} onPage={(n) => setPage(n, "claims-list")} />
    </section>
  );
}
