// Money the agent records on a claim: what was demanded from the insurer and what
// was paid (migration 012). ILS, optional, typed by hand — so parsing is lenient
// about thousands separators and the ₪ sign, and strict about everything else.

export const MAX_AMOUNT = 10_000_000;

export type AmountResult = { ok: true; value: number | null } | { ok: false; error: string };

const INVALID = "סכום לא תקין";

/** "", null, undefined → null (clears the field). "12,500.50", "₪ 12500", 12500 → number. */
export function parseAmount(raw: unknown): AmountResult {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "number") return check(raw);
  if (typeof raw !== "string") return { ok: false, error: INVALID };
  const cleaned = raw.replace(/[₪,\s]/g, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return { ok: false, error: INVALID };
  return check(Number(cleaned));
}

function check(n: number): AmountResult {
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: INVALID };
  if (n > MAX_AMOUNT) return { ok: false, error: "סכום גבוה מדי" };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** Postgres numeric arrives as a string through PostgREST. */
export function toAmount(db: unknown): number | null {
  if (db === null || db === undefined || db === "") return null;
  const n = Number(db);
  return Number.isFinite(n) ? n : null;
}

const ILS = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });

export function formatILS(n: number): string {
  return ILS.format(n);
}

export type AmountsPatch = { demand_amount?: number | null; paid_amount?: number | null };

export const AMOUNT_LABEL = {
  demand_amount: "סכום הדרישה",
  paid_amount: "סכום ששולם",
} as const;

// Pure planner behind PATCH /api/claims/[id]/amounts. Only the keys present in the
// body are touched, so each field can be saved (or cleared with null/"") on its own.
export function planAmountsUpdate(body: unknown): { error: string } | { update: AmountsPatch } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { error: "גוף הבקשה אינו תקין" };
  }
  const update: AmountsPatch = {};
  for (const key of ["demand_amount", "paid_amount"] as const) {
    if (!(key in body)) continue;
    const parsed = parseAmount((body as Record<string, unknown>)[key]);
    if (!parsed.ok) return { error: `${AMOUNT_LABEL[key]}: ${parsed.error}` };
    update[key] = parsed.value;
  }
  if (Object.keys(update).length === 0) return { error: "אין סכום לעדכן" };
  return { update };
}
