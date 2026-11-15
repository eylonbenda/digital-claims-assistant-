import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OVERVIEW_TITLE, STAGE_LABEL } from "@/lib/dashboard/copy";
import { effectiveHandling } from "@/lib/handling/effective";
import { formatILS, toAmount } from "@/lib/handling/amounts";
import {
  OPEN_STAGES, WAITING_BANDS, computeOverview,
  type Money, type OverviewClaim, type OverviewEvent, type Stat,
} from "@/lib/overview/compute";
import { BAND_LABEL, CYCLE_LABEL, OVERVIEW_COPY as C } from "@/lib/overview/copy";

// Numbers for the owner and the clerk: where the claims stand, what is waiting on
// insurers, how long each step takes. Aggregates only — the claims themselves are
// reached through the list, which the stage tiles link into.
export default async function OverviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // All RLS-scoped through the user's own client.
  const { data: claimRows } = await supabase
    .from("claims")
    .select(
      "id, client_name, status, claim_type, created_at, submitted_at, closed_at, handling_status, handling_status_changed_at, checklist_state",
    );

  // Amounts on their own, best-effort: before migration 012 the columns are missing,
  // and the page should then show counts and days without money, not fail.
  const { data: amountRows, error: amountErr } = await supabase
    .from("claims")
    .select("id, demand_amount, paid_amount");
  if (amountErr) {
    console.error(
      `overview: amounts read failed (${amountErr.message}) — money hidden. Check that migration 012_claim_amounts.sql has been applied to this database.`,
    );
  }
  const amountsBy = new Map((amountRows ?? []).map((r) => [r.id as string, r]));

  const { data: eventRows } = await supabase
    .from("claim_events")
    .select("claim_id, type, payload_json, created_at")
    .in("type", ["submission_confirmed", "handling_changed"]);

  const claims: OverviewClaim[] = (claimRows ?? []).map((c) => {
    const a = amountsBy.get(c.id);
    return {
      id: c.id,
      client_name: c.client_name,
      status: c.status,
      created_at: c.created_at,
      submitted_at: c.submitted_at,
      closed_at: c.closed_at,
      handling_effective: effectiveHandling(
        c.handling_status,
        (c.checklist_state as Record<string, boolean> | null) ?? {},
        c.claim_type,
      ),
      handling_changed_at: c.handling_status_changed_at,
      demand_amount: toAmount(a?.demand_amount),
      paid_amount: toAmount(a?.paid_amount),
    };
  });

  const events: OverviewEvent[] = [];
  for (const e of eventRows ?? []) {
    if (e.type === "submission_confirmed") {
      events.push({ claim_id: e.claim_id, kind: "sent", created_at: e.created_at });
    } else if ((e.payload_json as { to?: string } | null)?.to === "paid") {
      events.push({ claim_id: e.claim_id, kind: "paid", created_at: e.created_at });
    }
  }

  const o = computeOverview(claims, events, new Date());
  const money = !amountErr;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{OVERVIEW_TITLE}</h1>
        <p className="mt-1 text-sm text-muted">{C.subtitle}</p>
      </div>

      {!money && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {C.amountsOff}
        </p>
      )}

      <Card title={C.stagesTitle} hint={C.stagesHint}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {OPEN_STAGES.map((s) => (
            <Link
              key={s}
              href={`/dashboard?stage=${s}`}
              className="rounded-xl border border-zinc-200 p-4 hover:border-brand hover:bg-brand-soft"
            >
              <div className="text-xs text-zinc-500">{STAGE_LABEL[s]}</div>
              <div className="mt-1 text-3xl font-extrabold text-ink">{o.stages[s].count}</div>
              {money && (s === "sent" || s === "awaiting_payment") && <MoneyLine m={o.stages[s]} />}
            </Link>
          ))}
        </div>
      </Card>

      <Card title={C.waitingTitle} hint={C.waitingHint}>
        {o.waiting.total.count === 0 ? (
          <p className="text-sm text-zinc-500">{C.waitingEmpty}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {WAITING_BANDS.map((b) => {
                  const m = o.waiting.bands[b];
                  const late = (b === "d31_45" || b === "d46_plus") && m.count > 0;
                  return (
                    <div key={b} className="rounded-xl border border-zinc-200 p-3">
                      <div className="text-xs text-zinc-500">{BAND_LABEL[b]}</div>
                      <div className={`mt-1 text-2xl font-extrabold ${late ? "text-red-600" : "text-ink"}`}>
                        {m.count}
                      </div>
                      {money && <MoneyLine m={m} />}
                    </div>
                  );
                })}
              </div>
              {o.waiting.unknownSince > 0 && (
                <p className="mt-2 text-xs text-zinc-400">{C.unknownSince(o.waiting.unknownSince)}</p>
              )}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-zinc-500">{C.oldestTitle}</div>
              <ul className="divide-y divide-zinc-100 text-sm">
                {o.waiting.oldest.map((r) => (
                  <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
                    <Link href={`/dashboard/${r.id}`} className="min-w-0 truncate font-medium text-ink hover:underline">
                      {r.client_name?.trim() || "ללא שם"}
                    </Link>
                    <span className="shrink-0 text-xs text-zinc-500">
                      {C.days(r.days)}
                      {money && r.demand_amount !== null && ` · ${formatILS(r.demand_amount)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>

      <Card title={C.cycleTitle} hint={C.cycleHint}>
        <div className="grid gap-3 md:grid-cols-3">
          {(["collect", "prepare", "payment"] as const).map((k) => (
            <StatTile key={k} label={CYCLE_LABEL[k]} stat={o.cycle[k]} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title={C.recentTitle} hint={C.recentHint}>
          <dl className="divide-y divide-zinc-100 text-sm">
            <Row label={C.opened} value={o.recent.opened.current} previous={C.previous(o.recent.opened.previous)} />
            <Row label={C.closed} value={o.recent.closed.current} previous={C.previous(o.recent.closed.previous)} />
            <Row
              label={C.paid}
              value={
                money && o.recent.paid.current.withAmount > 0
                  ? formatILS(o.recent.paid.current.amount)
                  : o.recent.paid.current.count
              }
              previous={C.previous(
                money && o.recent.paid.previous.withAmount > 0
                  ? formatILS(o.recent.paid.previous.amount)
                  : o.recent.paid.previous.count,
              )}
            />
          </dl>
        </Card>

        <Card title={C.collectionTitle} hint={C.collectionHint}>
          {o.collection.links === 0 ? (
            <p className="text-sm text-zinc-500">{C.collectionNone}</p>
          ) : (
            <div>
              <div className="text-3xl font-extrabold text-ink">
                {Math.round((o.collection.completed / o.collection.links) * 100)}%
              </div>
              <p className="mt-1 text-sm text-zinc-500">
                {C.of(o.collection.completed, o.collection.links)} לקוחות השלימו את מילוי הפרטים
              </p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function Card({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-bold text-zinc-900">{title}</h2>
      <p className="mb-4 mt-0.5 text-xs text-zinc-500">{hint}</p>
      {children}
    </section>
  );
}

// The sum, and how much of the group it covers — a partial sum must say so.
function MoneyLine({ m }: { m: Money }) {
  if (m.count === 0) return null;
  if (m.withAmount === 0) return <div className="mt-1 text-xs text-zinc-400">{C.noAmounts}</div>;
  return (
    <div className="mt-1 text-xs text-zinc-600">
      <span className="font-semibold">{formatILS(m.amount)}</span>
      {m.withAmount < m.count && <span className="text-zinc-400"> · {C.of(m.withAmount, m.count)} עם סכום</span>}
    </div>
  );
}

function StatTile({ label, stat }: { label: string; stat: Stat }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      {stat.median === null ? (
        <div className="mt-1 text-sm text-zinc-400">
          {C.notEnough} ({stat.n})
        </div>
      ) : (
        <>
          <div className="mt-1 text-3xl font-extrabold text-ink">{C.days(stat.median)}</div>
          <div className="mt-0.5 text-xs text-zinc-400">{stat.n} תיקים</div>
        </>
      )}
    </div>
  );
}

function Row({ label, value, previous }: { label: string; value: number | string; previous: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-end">
        <span className="font-semibold text-zinc-900">{value}</span>
        <span className="ms-2 text-xs text-zinc-400">{previous}</span>
      </dd>
    </div>
  );
}
