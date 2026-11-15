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
import { BAND_LABEL, CYCLE_LABEL, CYCLE_SHORT, OVERVIEW_COPY as C } from "@/lib/overview/copy";
import {
  ACCENT, CYCLE_COLOR, DEEMPHASIS, STAGE_COLOR, STATUS_CRITICAL,
  HBar, Icon, IconTile, Meter, SegmentedBar, Swatch, type IconName, type Tone,
} from "./charts";

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

  const stageTotal = OPEN_STAGES.reduce((n, st) => n + o.stages[st].count, 0);
  const bandMax = Math.max(...WAITING_BANDS.map((b) => o.waiting.bands[b].count));
  const cycleKeys = ["collect", "prepare", "payment"] as const;
  const cycleComplete = cycleKeys.every((k) => o.cycle[k].median !== null);
  const paidShown = (m: Money) => (money && m.withAmount > 0 ? formatILS(m.amount) : String(m.count));
  const paidValue = (m: Money) => (money && m.withAmount > 0 ? m.amount : m.count);
  const rate = o.collection.links ? o.collection.completed / o.collection.links : 0;

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

      <Card icon="layers" tone="blue" title={C.stagesTitle} hint={C.stagesHint}>
        {stageTotal > 0 && (
          <div className="mb-4">
            <SegmentedBar
              label={C.stagesTitle}
              parts={OPEN_STAGES.map((st) => ({
                key: st,
                name: STAGE_LABEL[st],
                value: o.stages[st].count,
                display: String(o.stages[st].count),
                color: STAGE_COLOR[st],
              }))}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {OPEN_STAGES.map((st) => (
            <Link
              key={st}
              href={`/dashboard?stage=${st}`}
              className="rounded-xl border border-zinc-200 p-4 hover:border-brand hover:bg-brand-soft"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-xs text-zinc-600">
                  <Swatch color={STAGE_COLOR[st]} />
                  {STAGE_LABEL[st]}
                </span>
                <IconTile name={STAGE_ICON[st].name} tone={STAGE_ICON[st].tone} small />
              </div>
              <div className="mt-2 text-3xl font-extrabold text-ink">{o.stages[st].count}</div>
              {money && (st === "sent" || st === "awaiting_payment") && <MoneyLine m={o.stages[st]} />}
            </Link>
          ))}
        </div>
      </Card>

      <Card icon="clock" tone="amber" title={C.waitingTitle} hint={C.waitingHint}>
        {o.waiting.total.count === 0 ? (
          <p className="text-sm text-zinc-500">{C.waitingEmpty}</p>
        ) : (
          <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <ul className="space-y-3">
                {WAITING_BANDS.map((b) => {
                  const m = o.waiting.bands[b];
                  const late = (b === "d31_45" || b === "d46_plus") && m.count > 0;
                  return (
                    <li key={b} className="grid grid-cols-[6.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 text-sm">
                      <span className="flex items-center gap-1.5 text-zinc-600">
                        {BAND_LABEL[b]}
                        {late && (
                          <span className="flex items-center" style={{ color: STATUS_CRITICAL }} title={C.late}>
                            <Icon name="alert" size={14} />
                            <span className="sr-only">{C.late}</span>
                          </span>
                        )}
                      </span>
                      <HBar
                        value={m.count}
                        max={bandMax}
                        color={late ? STATUS_CRITICAL : ACCENT}
                        title={`${BAND_LABEL[b]}: ${m.count}`}
                      />
                      <span className="text-end">
                        <span className="font-semibold text-ink">{m.count}</span>
                        {money && m.withAmount > 0 && (
                          <span className="ms-2 text-xs text-zinc-500">{formatILS(m.amount)}</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {money && o.waiting.total.withAmount > 0 && (
                <p className="mt-4 text-sm text-zinc-600">
                  {C.waitingTotal}{" "}
                  <span className="font-bold text-ink">{formatILS(o.waiting.total.amount)}</span>
                  {o.waiting.total.withAmount < o.waiting.total.count && (
                    <span className="text-xs text-zinc-400">
                      {" "}· {C.of(o.waiting.total.withAmount, o.waiting.total.count)} עם סכום
                    </span>
                  )}
                </p>
              )}
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

      <Card icon="timer" tone="violet" title={C.cycleTitle} hint={C.cycleHint}>
        {cycleComplete && (
          <div className="mb-4">
            <SegmentedBar
              label={C.cycleTitle}
              parts={cycleKeys.map((k) => ({
                key: k,
                name: CYCLE_SHORT[k],
                value: Math.max(o.cycle[k].median ?? 0, 0.5),
                display: C.days(o.cycle[k].median ?? 0),
                color: CYCLE_COLOR[k],
              }))}
            />
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          {cycleKeys.map((k) => (
            <StatTile key={k} label={CYCLE_LABEL[k]} stat={o.cycle[k]} color={CYCLE_COLOR[k]} />
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card icon="calendar" tone="emerald" title={C.recentTitle} hint={C.recentHint}>
          <div className="mb-3 flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5"><Swatch color={ACCENT} />{C.legendCurrent}</span>
            <span className="flex items-center gap-1.5"><Swatch color={DEEMPHASIS} />{C.legendPrevious}</span>
          </div>
          <div className="space-y-4">
            <Compare label={C.opened} current={o.recent.opened.current} previous={o.recent.opened.previous} />
            <Compare label={C.closed} current={o.recent.closed.current} previous={o.recent.closed.previous} />
            <Compare
              label={C.paid}
              current={paidValue(o.recent.paid.current)}
              previous={paidValue(o.recent.paid.previous)}
              currentText={paidShown(o.recent.paid.current)}
              previousText={paidShown(o.recent.paid.previous)}
            />
          </div>
        </Card>

        <Card icon="userCheck" tone="blue" title={C.collectionTitle} hint={C.collectionHint}>
          {o.collection.links === 0 ? (
            <p className="text-sm text-zinc-500">{C.collectionNone}</p>
          ) : (
            <div>
              <div className="text-4xl font-extrabold text-ink">{Math.round(rate * 100)}%</div>
              <div className="mt-3">
                <Meter ratio={rate} label={`${Math.round(rate * 100)}%`} />
              </div>
              <p className="mt-2 text-sm text-zinc-500">
                {C.of(o.collection.completed, o.collection.links)} לקוחות השלימו את מילוי הפרטים
              </p>
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

const STAGE_ICON: Record<(typeof OPEN_STAGES)[number], { name: IconName; tone: Tone }> = {
  with_client: { name: "user", tone: "slate" },
  before_send: { name: "file", tone: "amber" },
  sent: { name: "send", tone: "blue" },
  awaiting_payment: { name: "wallet", tone: "violet" },
};

function Card({
  icon, tone, title, hint, children,
}: {
  icon: IconName; tone: Tone; title: string; hint: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <IconTile name={icon} tone={tone} />
        <div>
          <h2 className="text-base font-bold text-zinc-900">{title}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">{hint}</p>
        </div>
      </div>
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

function StatTile({ label, stat, color }: { label: string; stat: Stat; color: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-600">
        <Swatch color={color} />
        {label}
      </div>
      {stat.median === null ? (
        <div className="mt-2 text-sm text-zinc-400">
          {C.notEnough} ({stat.n})
        </div>
      ) : (
        <>
          <div className="mt-2 text-3xl font-extrabold text-ink">{C.days(stat.median)}</div>
          <div className="mt-0.5 text-xs text-zinc-400">{stat.n} תיקים</div>
        </>
      )}
    </div>
  );
}

// This period against the one before, on one scale: accent for now, gray for then.
function Compare({
  label, current, previous, currentText, previousText,
}: {
  label: string; current: number; previous: number; currentText?: string; previousText?: string;
}) {
  const max = Math.max(current, previous);
  const cur = currentText ?? String(current);
  const prev = previousText ?? String(previous);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
        <span className="text-zinc-600">{label}</span>
        <span>
          <span className="font-semibold text-ink">{cur}</span>
          <span className="ms-2 text-xs text-zinc-400">{C.previous(prev)}</span>
        </span>
      </div>
      <div className="space-y-[2px]">
        <HBar value={current} max={max} color={ACCENT} title={`${C.legendCurrent}: ${cur}`} />
        <HBar value={previous} max={max} color={DEEMPHASIS} title={`${C.legendPrevious}: ${prev}`} />
      </div>
    </div>
  );
}
