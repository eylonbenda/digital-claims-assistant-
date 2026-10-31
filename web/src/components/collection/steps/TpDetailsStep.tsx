import { useState } from "react";
import { EMPTY_TP, INSURERS, MAX_THIRD_PARTIES, type State, type TpEntry } from "@/lib/collection/claim-state";
import { Text } from "./fields";

// Select sentinel for "a company not in the list" — never stored in state.
const OTHER_INSURER = "__other__";

export default function TpDetailsStep({
  s,
  set,
  plateWarn,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  plateWarn: (v: string) => string | undefined;
}) {
  const extras = s.extraThirdParties ?? [];
  const setExtras = (next: TpEntry[]) => set({ extraThirdParties: next });
  const canAdd = 1 + extras.length < MAX_THIRD_PARTIES;
  return (
    <div>
      <h2 className="text-2xl font-bold">פרטי הצד השני</h2>
      <TpFields
        tp={s.thirdParty}
        onChange={(patch) => set({ thirdParty: { ...s.thirdParty, ...patch } })}
        plateWarn={plateWarn}
      />
      {extras.map((tp, i) => (
        <div key={i} className="mt-6 border-t border-zinc-200 pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold">רכב מעורב נוסף{extras.length > 1 ? ` ${i + 1}` : ""}</h3>
            <button
              type="button"
              onClick={() => setExtras(extras.filter((_, j) => j !== i))}
              className="text-sm text-red-600 underline"
            >
              הסר
            </button>
          </div>
          <TpFields
            tp={tp}
            onChange={(patch) => setExtras(extras.map((e, j) => (j === i ? { ...e, ...patch } : e)))}
            plateWarn={plateWarn}
          />
        </div>
      ))}
      {canAdd && (
        <button
          type="button"
          onClick={() => setExtras([...extras, { ...EMPTY_TP }])}
          className="mt-5 w-full rounded-xl border border-dashed border-zinc-300 px-3 py-3 text-base text-blue-700"
        >
          + היה מעורב רכב נוסף בתאונה
        </button>
      )}
    </div>
  );
}

function TpFields({
  tp,
  onChange,
  plateWarn,
}: {
  tp: TpEntry;
  onChange: (patch: Partial<TpEntry>) => void;
  plateWarn: (v: string) => string | undefined;
}) {
  // Insurer: select of known insurers; "חברה אחרת…" reveals a free-text field.
  // A restored session with a custom name (not in the list) reopens it too.
  const [otherPicked, setOtherPicked] = useState(false);
  const custom =
    otherPicked || (!!tp.insurer && tp.insurer !== "לא ידוע" && !INSURERS.some((i) => i.label === tp.insurer));
  const unknown = !!tp.details_unknown;
  return (
    <div className="mt-4 space-y-3">
      <label className="flex items-start gap-2 rounded-xl border border-zinc-200 p-3">
        <input
          type="checkbox"
          checked={unknown}
          onChange={(e) => onChange({ details_unknown: e.target.checked })}
          className="mt-1 h-5 w-5"
        />
        <span className="text-base">
          אין לי את פרטי הצד השני
          <span className="block text-xs text-zinc-500">למשל: הרכב הפוגע עזב את המקום</span>
        </span>
      </label>
      {unknown && (
        <p className="text-sm text-zinc-500">אפשר להמשיך — ואם ידוע לך פרט כלשהו (אפילו חלקי), כל פרט עוזר.</p>
      )}
      <Text required={!unknown} label="שם הנהג השני" value={tp.name} onChange={(v) => onChange({ name: v })} />
      <Text label="טלפון" type="tel" value={tp.phone} onChange={(v) => onChange({ phone: v })} />
      <Text required={!unknown} label="מספר רישוי" inputMode="numeric" warn={plateWarn(tp.plate)} value={tp.plate} onChange={(v) => onChange({ plate: v })} />
      <label className="block">
        <span className="text-base text-zinc-600">
          חברת הביטוח שלו{!unknown && <span className="text-red-500"> *</span>}
        </span>
        <select
          value={custom ? OTHER_INSURER : tp.insurer}
          onChange={(e) => {
            const v = e.target.value;
            setOtherPicked(v === OTHER_INSURER);
            onChange({ insurer: v === OTHER_INSURER ? "" : v });
          }}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
        >
          <option value="">בחר/י חברת ביטוח…</option>
          {INSURERS.map((i) => (
            <option key={i.key} value={i.label}>
              {i.label}
            </option>
          ))}
          <option value="לא ידוע">לא ידוע כרגע</option>
          <option value={OTHER_INSURER}>חברה אחרת…</option>
        </select>
      </label>
      {custom && (
        <Text required={!unknown} label="שם חברת הביטוח" value={tp.insurer} onChange={(v) => onChange({ insurer: v })} />
      )}
    </div>
  );
}
