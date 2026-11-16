// Damages ("פירוט הנזק") money rules for the demand form. Pure: no I/O.
// Amounts are stored before VAT with a per-line `vat` flag; money is computed in
// integer agorot and VAT is rounded half-up once, on the sum of the VAT-able lines.

import { parseAmount } from "../handling/amounts";
import { COPY as DEMAND_COPY } from "./copy";

export const VAT_RATE = 0.18;
const VAT_PERCENT = Math.round(VAT_RATE * 100);

export const MAX_DAMAGE_AMOUNT = 1_000_000;
export const MAX_OTHER_LINES = 10;
export const MAX_LABEL_LENGTH = 60;

export type DamageLine = { amount: number; vat: boolean };
export type OtherDamage = { label: string; amount: number; vat?: boolean };
export type Damages = {
  repair?: DamageLine;
  diminished_value?: DamageLine;
  assessor_fee?: DamageLine;
  towing?: DamageLine;
  other?: OtherDamage[];
  claimant_vat_registered?: boolean;
};
export type DamageKey = "repair" | "diminished_value" | "assessor_fee" | "towing";

export const DAMAGE_KEYS: readonly DamageKey[] = ["repair", "diminished_value", "assessor_fee", "towing"];

export const DEFAULT_VAT: Record<DamageKey, boolean> = {
  repair: true,
  diminished_value: false,
  assessor_fee: true,
  towing: true,
};

export type DamageTotals = {
  rows: { key: DamageKey | "other"; label: string; amount: number }[];
  vat: number | null;
  total: number;
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const validAmount = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_DAMAGE_AMOUNT && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const toAgorot = (n: number) => Math.round(n * 100);

export function computeDamageTotals(d: Damages | undefined | null): DamageTotals | null {
  if (!isObj(d)) return null;
  const rows: DamageTotals["rows"] = [];
  let sum = 0;
  let vatable = 0;
  const add = (key: DamageKey | "other", label: string, amount: unknown, vat: boolean) => {
    if (!validAmount(amount) || amount <= 0) return;
    const ag = toAgorot(amount);
    rows.push({ key, label, amount: ag / 100 });
    sum += ag;
    if (vat) vatable += ag;
  };
  for (const key of DAMAGE_KEYS) {
    const line = (d as Record<string, unknown>)[key];
    if (!isObj(line)) continue;
    add(key, "", line.amount, typeof line.vat === "boolean" ? line.vat : DEFAULT_VAT[key]);
  }
  if (Array.isArray(d.other)) {
    for (const o of d.other as unknown[]) {
      if (!isObj(o) || typeof o.label !== "string") continue;
      add("other", o.label, o.amount, o.vat === true);
    }
  }
  if (rows.length === 0) return null;
  const registered = d.claimant_vat_registered === true;
  const vatAg = registered ? 0 : Math.floor((vatable * VAT_PERCENT + 50) / 100);
  return {
    rows,
    vat: registered ? null : vatAg / 100,
    total: (sum + vatAg) / 100,
  };
}

/** "7,370.00 ₪" — hand-rolled so output never depends on the ICU build. */
export function formatLetterAmount(amount: number): string {
  const ag = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(ag / 100);
  const frac = String(ag % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount < 0 ? "-" : ""}${grouped}.${frac} ₪`;
}

export type ParseResult = { ok: true; value: number | null } | { ok: false; error: string };

export function parseAmountInput(raw: string): ParseResult {
  const r = parseAmount(raw);
  if (!r.ok) return r;
  if (r.value !== null && r.value > MAX_DAMAGE_AMOUNT) {
    return { ok: false, error: "סכום גבוה מדי (מעל 1,000,000 ₪)" };
  }
  return r;
}

export function validateDamages(v: unknown): { ok: true } | { ok: false; error: string } {
  if (v === undefined) return { ok: true };
  if (!isObj(v)) return { ok: false, error: "פירוט הנזק אינו תקין" };
  const checkAmount = (n: unknown, name: string) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return `${name}: סכום לא תקין`;
    if (n < 0) return `${name}: סכום לא תקין`;
    if (n > MAX_DAMAGE_AMOUNT) return `${name}: סכום גבוה מדי (מעל 1,000,000 ₪)`;
    if (!validAmount(n)) return `${name}: עד 2 ספרות אחרי הנקודה`;
    return null;
  };
  for (const key of DAMAGE_KEYS) {
    const line = v[key];
    if (line === undefined) continue;
    if (!isObj(line)) return { ok: false, error: "פירוט הנזק אינו תקין" };
    const e = checkAmount(line.amount, DEMAND_COPY.damages.labels[key]);
    if (e) return { ok: false, error: e };
    if (typeof line.vat !== "boolean") return { ok: false, error: `${DEMAND_COPY.damages.labels[key]}: מע״מ לא תקין` };
  }
  if (v.other !== undefined) {
    if (!Array.isArray(v.other)) return { ok: false, error: "סעיפים נוספים אינם תקינים" };
    if (v.other.length > MAX_OTHER_LINES) return { ok: false, error: `עד ${MAX_OTHER_LINES} סעיפים נוספים` };
    for (const o of v.other as unknown[]) {
      if (!isObj(o) || typeof o.label !== "string") return { ok: false, error: "סעיף נוסף אינו תקין" };
      const label = o.label.trim();
      if (label === "") return { ok: false, error: "חסר שם לסעיף נוסף" };
      if (label.length > MAX_LABEL_LENGTH) return { ok: false, error: `שם סעיף ארוך מדי (עד ${MAX_LABEL_LENGTH} תווים)` };
      const e = checkAmount(o.amount, label);
      if (e) return { ok: false, error: e };
      if (o.amount === 0) return { ok: false, error: `${label}: חסר סכום` };
      if (o.vat !== undefined && typeof o.vat !== "boolean") return { ok: false, error: `${label}: מע״מ לא תקין` };
    }
  }
  if (v.claimant_vat_registered !== undefined && typeof v.claimant_vat_registered !== "boolean") {
    return { ok: false, error: "סטטוס עוסק מורשה לא תקין" };
  }
  return { ok: true };
}
