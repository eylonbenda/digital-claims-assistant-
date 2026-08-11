"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClaimCard, DashboardList } from "@/lib/dashboard/compose";
import { ALL_DONE_NOTE, WAITING_NOTE } from "@/lib/dashboard/copy";
import type { SendItem } from "@/lib/outbound/queue";

function postEvent(item: SendItem, kind: "sent" | "skipped") {
  return fetch("/api/outbound/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claim_id: item.claim_id,
      task_id: item.task_id,
      task_key: item.task_key,
      kind,
      ...(kind === "sent" ? { body: item.body } : {}),
    }),
  });
}

function SendButtons({ item }: { item: SendItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Same contract as the old OutboundQueue row: a failed write must not leave
  // the card dead — reset busy and hint; success refreshes (card recomposes).
  function settle(promise: Promise<Response>) {
    promise
      .then((res) => {
        if (res.ok) router.refresh();
        else { setBusy(false); setError("הרישום נכשל — נסה שוב"); }
      })
      .catch(() => { setBusy(false); setError("הרישום נכשל — נסה שוב"); });
  }
  // TRAP: window.open must run synchronously, before any state/fetch — an
  // await first and the popup blocker eats the send.
  function send() {
    if (item.href) window.open(item.href, "_blank", "noopener,noreferrer");
    setBusy(true); setError(null);
    settle(postEvent(item, "sent"));
  }
  function skip() {
    setBusy(true); setError(null);
    settle(postEvent(item, "skipped"));
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button type="button" onClick={send} disabled={busy || !item.href}
        title={item.href ? undefined : "מספר טלפון חסר או לא תקין"}
        className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-800 disabled:opacity-50">
        📤 שלח תזכורת
      </button>
      <button type="button" onClick={skip} disabled={busy}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
        לא היום
      </button>
    </div>
  );
}

function Card({ card, tone }: { card: ClaimCard; tone: "red" | "amber" | "plain" }) {
  const border =
    tone === "red" ? "border-red-200" : tone === "amber" ? "border-amber-200" : "border-zinc-200";
  const lineColor =
    tone === "red" ? "text-red-700" : tone === "amber" ? "text-amber-800" : "text-zinc-500";
  return (
    <li className={`rounded-xl border ${border} bg-white p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/dashboard/${card.claim_id}`} className="font-medium text-zinc-900 hover:underline">
            {card.client_name ?? "ללא שם"}
          </Link>{" "}
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{card.track_label}</span>
          <p className={`text-sm ${lineColor}`}>{card.action_line}</p>
          {card.ai_line && <p className="text-xs text-zinc-400">{card.ai_line}</p>}
          {card.also_line && <p className="text-xs text-amber-800">{card.also_line}</p>}
        </div>
        {card.send ? (
          <SendButtons item={card.send} />
        ) : tone !== "plain" ? (
          <Link href={`/dashboard/${card.claim_id}`}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50">
            פתח את התיק ←
          </Link>
        ) : null}
      </div>
      {card.send && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-zinc-400">▸ מה יישלח?</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-zinc-50 p-2 text-xs text-zinc-700" dir="rtl">
            {card.send.body}
          </pre>
        </details>
      )}
    </li>
  );
}

export default function TodayList({
  list, greeting, dateLabel, claimsCount, name,
}: {
  list: DashboardList;
  greeting: string;
  dateLabel: string;
  claimsCount: number;
  name?: string | null;
}) {
  const { attention, waiting, ok } = list;

  return (
    <section dir="rtl">
      <div className="mb-3">
        <h2 className="text-lg font-bold text-zinc-900">
          {greeting}{name ? `, ${name}` : ""} 👋 <span className="text-sm font-normal text-zinc-500">· {dateLabel}</span>
        </h2>
      </div>

      {claimsCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center">
          <p className="font-medium text-zinc-800">צור את התביעה הראשונה שלך</p>
          <p className="mt-1 text-sm text-zinc-500">
            לחץ &quot;תביעה חדשה&quot;, שלח ללקוח את הקישור — והמערכת תאסוף את המסמכים והפרטים בשבילך.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex gap-2">
            <a href="#sec-attention" className="flex-1 rounded-xl border border-red-200 bg-red-50 p-2 text-center">
              <div className="text-xl font-extrabold text-red-600">{attention.length}</div>
              <div className="text-xs text-zinc-600">צריך אותך</div>
            </a>
            <a href="#sec-waiting" className="flex-1 rounded-xl border border-amber-200 bg-amber-50 p-2 text-center">
              <div className="text-xl font-extrabold text-amber-700">{waiting.length}</div>
              <div className="text-xs text-zinc-600">בהמתנה</div>
            </a>
            <a href="#sec-ok" className="flex-1 rounded-xl border border-green-200 bg-green-50 p-2 text-center">
              <div className="text-xl font-extrabold text-green-700">{ok.length}</div>
              <div className="text-xs text-zinc-600">תקינים</div>
            </a>
          </div>

          {attention.length > 0 ? (
            <div id="sec-attention" className="mb-4">
              <p className="mb-2 text-sm font-bold text-red-700">🔔 צריך אותך היום ({attention.length})</p>
              <ul className="space-y-2">
                {attention.map((c) => (
                  <Card key={c.claim_id} card={c} tone={c.send ? "red" : "amber"} />
                ))}
              </ul>
            </div>
          ) : (
            <p className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              {ALL_DONE_NOTE}
            </p>
          )}

          {waiting.length > 0 && (
            <div id="sec-waiting" className="mb-4">
              <p className="mb-2 text-sm font-bold text-zinc-500">⏳ בהמתנה לאחרים ({waiting.length})</p>
              <ul className="space-y-2">
                {waiting.map((c) => (
                  <Card key={c.claim_id} card={{ ...c, ai_line: c.ai_line ?? `🤖 ${WAITING_NOTE}` }} tone="plain" />
                ))}
              </ul>
            </div>
          )}

          {ok.length > 0 && (
            <details id="sec-ok" className="mb-2">
              <summary className="cursor-pointer rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                ✅ {ok.length} תיקים תקינים — הצג
              </summary>
              <ul className="mt-2 space-y-2">
                {ok.map((c) => (
                  <Card key={c.claim_id} card={c} tone="plain" />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
