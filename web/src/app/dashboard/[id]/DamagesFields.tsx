"use client";

import { useEffect, useState } from "react";
import {
  DAMAGE_KEYS,
  DEFAULT_VAT,
  MAX_LABEL_LENGTH,
  MAX_OTHER_LINES,
  computeDamageTotals,
  formatLetterAmount,
  parseAmountInput,
  type DamageKey,
  type Damages,
  type OtherDamage,
} from "@/lib/demand/damages";
import { COPY as DEMAND_COPY } from "@/lib/demand/copy";
import { DAMAGES_COPY as C } from "@/lib/cockpit/copy";

const inputCls = (bad: boolean) =>
  `mt-1 w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-blue-500 ${
    bad ? "border-red-400 bg-red-50" : "border-zinc-300"
  }`;

// Existing numbers show as plain text ("7370"), never reformatted while typing.
const asText = (n: number | undefined) => (n === undefined ? "" : String(n));

export default function DamagesFields({
  damages,
  onChange,
  onErrors,
}: {
  damages: Damages | undefined;
  // Receives an updater over the current damages; the editor drops the key when empty.
  onChange: (fn: (d: Damages) => Damages) => void;
  // Hebrew error lines; non-empty keeps the editor's save disabled.
  onErrors: (errors: string[]) => void;
}) {
  // Raw input text lives here so "7,3" can be typed mid-entry; data is written only when it parses.
  const [raw, setRaw] = useState<Record<DamageKey, string>>(() => ({
    repair: asText(damages?.repair?.amount),
    diminished_value: asText(damages?.diminished_value?.amount),
    assessor_fee: asText(damages?.assessor_fee?.amount),
    towing: asText(damages?.towing?.amount),
  }));
  const [otherRaw, setOtherRaw] = useState<string[]>(() => (damages?.other ?? []).map((o) => asText(o.amount)));

  const other = damages?.other ?? [];

  const fixedErr = (k: DamageKey) => {
    const r = parseAmountInput(raw[k]);
    return r.ok ? null : r.error;
  };
  const otherAmountErr = (i: number) => {
    const r = parseAmountInput(otherRaw[i] ?? "");
    return r.ok ? null : r.error;
  };
  const otherLabelErr = (o: OtherDamage) => {
    const l = o.label.trim();
    return l === "" ? C.missingLabel : null;
  };

  const errors: string[] = [];
  for (const k of DAMAGE_KEYS) {
    const e = fixedErr(k);
    if (e) errors.push(`${DEMAND_COPY.damages.labels[k]}: ${e}`);
  }
  other.forEach((o, i) => {
    const name = o.label.trim() || `${i + 1}`;
    const le = otherLabelErr(o);
    if (le) errors.push(le);
    const ae = otherAmountErr(i);
    if (ae) errors.push(`${name}: ${ae}`);
    else if (o.label.trim() !== "" && (otherRaw[i] ?? "").trim() === "") errors.push(`${name}: ${C.missingAmount}`);
  });
  const errKey = errors.join("|");
  useEffect(() => {
    onErrors(errKey ? errKey.split("|") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errKey]);
  useEffect(() => () => onErrors([]), []); // eslint-disable-line react-hooks/exhaustive-deps

  function setFixed(k: DamageKey, text: string) {
    setRaw((r) => ({ ...r, [k]: text }));
    const r = parseAmountInput(text);
    if (!r.ok) return;
    onChange((d) => {
      const next = { ...d };
      if (r.value === null) delete next[k];
      else next[k] = { amount: r.value, vat: d[k]?.vat ?? DEFAULT_VAT[k] };
      return next;
    });
  }

  function setRegistered(on: boolean) {
    onChange((d) => {
      const next = { ...d };
      if (on) next.claimant_vat_registered = true;
      else delete next.claimant_vat_registered;
      return next;
    });
  }

  function patchOther(i: number, patch: Partial<OtherDamage>) {
    onChange((d) => ({ ...d, other: (d.other ?? []).map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  }
  function setOtherAmount(i: number, text: string) {
    setOtherRaw((r) => r.map((t, j) => (j === i ? text : t)));
    const r = parseAmountInput(text);
    if (r.ok) patchOther(i, { amount: r.value ?? 0 });
  }
  function addOther() {
    setOtherRaw((r) => [...r, ""]);
    onChange((d) => ({ ...d, other: [...(d.other ?? []), { label: "", amount: 0, vat: false }] }));
  }
  function removeOther(i: number) {
    setOtherRaw((r) => r.filter((_, j) => j !== i));
    onChange((d) => {
      const next: Damages = { ...d, other: (d.other ?? []).filter((_, j) => j !== i) };
      if (next.other?.length === 0) delete next.other;
      return next;
    });
  }

  const totals = computeDamageTotals(damages);

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-zinc-700">{C.title}</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
        {DAMAGE_KEYS.map((k) => {
          const err = fixedErr(k);
          return (
            <label key={k} className="block">
              <span className="text-xs text-zinc-500">
                {DEMAND_COPY.damages.labels[k]} <span className="text-zinc-400">({C.beforeVat})</span>
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={raw[k]}
                onChange={(e) => setFixed(k, e.target.value)}
                aria-invalid={!!err}
                className={inputCls(!!err)}
              />
              {err && <span className="mt-1 block text-xs text-red-600">{err}</span>}
            </label>
          );
        })}
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          checked={damages?.claimant_vat_registered === true}
          onChange={(e) => setRegistered(e.target.checked)}
        />
        {C.claimantVatRegistered}
      </label>

      <div className="mt-3 space-y-2">
        {other.map((o, i) => {
          const ae = otherAmountErr(i);
          const le = otherLabelErr(o);
          return (
            <div key={i} className="flex flex-wrap items-start gap-2">
              <label className="block min-w-40 flex-1">
                <span className="text-xs text-zinc-500">{C.otherLabel}</span>
                <input
                  type="text"
                  value={o.label}
                  maxLength={MAX_LABEL_LENGTH}
                  onChange={(e) => patchOther(i, { label: e.target.value })}
                  aria-invalid={!!le}
                  className={inputCls(!!le)}
                />
              </label>
              <label className="block w-32">
                <span className="text-xs text-zinc-500">{C.otherAmount}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={otherRaw[i] ?? ""}
                  onChange={(e) => setOtherAmount(i, e.target.value)}
                  aria-invalid={!!ae}
                  className={inputCls(!!ae)}
                />
                {ae && <span className="mt-1 block text-xs text-red-600">{ae}</span>}
              </label>
              <label className="mt-6 flex items-center gap-1 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={o.vat === true}
                  onChange={(e) => patchOther(i, { vat: e.target.checked })}
                />
                {C.otherVat}
              </label>
              <button
                type="button"
                onClick={() => removeOther(i)}
                className="mt-6 text-xs text-red-600 hover:underline"
              >
                {C.removeLine}
              </button>
            </div>
          );
        })}
        {other.length < MAX_OTHER_LINES && (
          <button
            type="button"
            onClick={addOther}
            className="w-full rounded-lg border border-dashed border-zinc-300 py-2 text-sm text-zinc-600 hover:border-blue-400 hover:text-blue-600"
          >
            {C.addLine}
          </button>
        )}
      </div>

      {totals && (
        <dl className="mt-3 space-y-1 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {totals.rows.map((r, i) => (
            <div key={i} className="flex justify-between gap-3">
              <dt>{r.key === "other" ? r.label : DEMAND_COPY.damages.labels[r.key]}</dt>
              <dd dir="ltr">{formatLetterAmount(r.amount)}</dd>
            </div>
          ))}
          {totals.vat !== null && (
            <div className="flex justify-between gap-3">
              <dt>{C.previewVat}</dt>
              <dd dir="ltr">{formatLetterAmount(totals.vat)}</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 border-t border-zinc-200 pt-1 font-semibold">
            <dt>{C.previewTotal}</dt>
            <dd dir="ltr">{formatLetterAmount(totals.total)}</dd>
          </div>
        </dl>
      )}
    </fieldset>
  );
}
