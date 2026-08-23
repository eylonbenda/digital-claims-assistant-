import { INSURERS, type State } from "@/lib/collection/claim-state";
import { Text } from "./fields";

// Select sentinel for "a company not in the list" — never stored in state.
const OTHER_INSURER = "__other__";

export default function TpDetailsStep({
  s,
  set,
  plateWarn,
  tpInsurerCustom,
  setTpInsurerOther,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  plateWarn: (v: string) => string | undefined;
  tpInsurerCustom: boolean;
  setTpInsurerOther: (v: boolean) => void;
}) {
  const unknown = !!s.thirdParty.details_unknown;
  return (
    <div>
      <h2 className="text-2xl font-bold">פרטי הצד השני</h2>
      <div className="mt-4 space-y-3">
        <label className="flex items-start gap-2 rounded-xl border border-zinc-200 p-3">
          <input
            type="checkbox"
            checked={unknown}
            onChange={(e) => set({ thirdParty: { ...s.thirdParty, details_unknown: e.target.checked } })}
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
        <Text required={!unknown} label="שם הנהג השני" value={s.thirdParty.name} onChange={(v) => set({ thirdParty: { ...s.thirdParty, name: v } })} />
        <Text label="טלפון" type="tel" value={s.thirdParty.phone} onChange={(v) => set({ thirdParty: { ...s.thirdParty, phone: v } })} />
        <Text required={!unknown} label="מספר רישוי" inputMode="numeric" warn={plateWarn(s.thirdParty.plate)} value={s.thirdParty.plate} onChange={(v) => set({ thirdParty: { ...s.thirdParty, plate: v } })} />
        <label className="block">
          <span className="text-base text-zinc-600">
            חברת הביטוח שלו{!unknown && <span className="text-red-500"> *</span>}
          </span>
          <select
            value={tpInsurerCustom ? OTHER_INSURER : s.thirdParty.insurer}
            onChange={(e) => {
              const v = e.target.value;
              setTpInsurerOther(v === OTHER_INSURER);
              set({ thirdParty: { ...s.thirdParty, insurer: v === OTHER_INSURER ? "" : v } });
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
        {tpInsurerCustom && (
          <Text required={!unknown} label="שם חברת הביטוח" value={s.thirdParty.insurer} onChange={(v) => set({ thirdParty: { ...s.thirdParty, insurer: v } })} />
        )}
      </div>
    </div>
  );
}
