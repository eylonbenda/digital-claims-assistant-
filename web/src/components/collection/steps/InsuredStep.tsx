import { INSURERS, type State } from "@/lib/collection/claim-state";
import { Text } from "./fields";

export default function InsuredStep({
  s,
  set,
  idWarn,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  idWarn: (v: string) => string | undefined;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">הפרטים שלך</h2>
      <Text required label="שם פרטי" value={s.insured.first_name} onChange={(v) => set({ insured: { ...s.insured, first_name: v } })} />
      <Text required label="שם משפחה" value={s.insured.last_name} onChange={(v) => set({ insured: { ...s.insured, last_name: v } })} />
      <Text required label="תעודת זהות" inputMode="numeric" warn={idWarn(s.insured.id_number)} value={s.insured.id_number} onChange={(v) => set({ insured: { ...s.insured, id_number: v } })} />
      <Text required label="טלפון נייד" type="tel" value={s.insured.mobile} onChange={(v) => set({ insured: { ...s.insured, mobile: v } })} />
      <Text required label="עיר מגורים" value={s.insured.city} onChange={(v) => set({ insured: { ...s.insured, city: v } })} />
      <label className="block">
        <span className="text-base text-zinc-600">
          חברת הביטוח שלך<span className="text-red-500"> *</span>
        </span>
        <select
          value={s.policyInsurer}
          onChange={(e) => set({ policyInsurer: e.target.value })}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
        >
          <option value="">בחר/י חברת ביטוח…</option>
          {INSURERS.map((i) => (
            <option key={i.key} value={i.key}>
              {i.label}
            </option>
          ))}
          <option value="unknown">לא בטוח/ה — הסוכן ישלים</option>
        </select>
      </label>
      <label className="block">
        <span className="text-base text-zinc-600">
          סוג הביטוח שלך<span className="text-red-500"> *</span>
        </span>
        <select
          value={s.insuranceType}
          onChange={(e) => set({ insuranceType: e.target.value as State["insuranceType"] })}
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
        >
          <option value="">בחר/י סוג ביטוח…</option>
          <option value="comprehensive">מקיף</option>
          <option value="third_party">צד ג׳</option>
          <option value="mandatory">חובה בלבד</option>
          <option value="unknown">לא בטוח/ה — הסוכן ישלים</option>
        </select>
        <span className="mt-1 block text-xs text-zinc-400">
          לא בטוח/ה? אין בעיה — בחר/י &quot;הסוכן ישלים&quot; והמשיכ/י.
        </span>
      </label>
    </div>
  );
}
