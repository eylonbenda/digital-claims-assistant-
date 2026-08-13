import type { State } from "@/lib/collection/claim-state";
import type { StepKey } from "../steps";
import { toILDate } from "@/lib/dates";
import { Row } from "./fields";

// Local calendar date as ISO yyyy-mm-dd (avoids the UTC off-by-one of toISOString near midnight).
function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function SummaryStep({
  s,
  set,
  goTo,
  docDone,
  submitError,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  goTo: (key: StepKey) => void;
  docDone: number;
  submitError: string | null;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold">סיכום</h2>
      <p className="mt-1 text-base text-zinc-500">לחיצה על שורה חוזרת לשלב המתאים לתיקון.</p>
      <dl className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm">
        <Row k="שם" v={`${s.insured.first_name} ${s.insured.last_name}`.trim() || "—"} onEdit={() => goTo("insured")} />
        <Row k="רכב" v={[s.vehicle.plate, s.vehicle.manufacturer].filter(Boolean).join(" · ") || "—"} onEdit={() => goTo("vehicle")} />
        <Row k="נהג" v={s.driver.isInsured === false ? `${s.driver.first_name} ${s.driver.last_name}`.trim() || "—" : s.driver.isInsured ? "המבוטח" : "—"} onEdit={() => goTo("driver_who")} />
        <Row k="מתי" v={[toILDate(s.accident.date), s.accident.time].filter(Boolean).join(" ") || "—"} onEdit={() => goTo("when_where")} />
        <Row k="איפה" v={s.accident.location || "—"} onEdit={() => goTo("when_where")} />
        <Row k="מה קרה" v={s.accident.description || "—"} onEdit={() => goTo("description")} />
        <Row k="מי אשם" v={s.fault === "me" ? "אני" : s.fault === "third_party" ? "הצד השני" : "לא בטוח"} onEdit={() => goTo("fault")} />
        <Row k="נפגעים" v={s.injuries ? "כן" : "לא"} onEdit={() => goTo("injuries")} />
        <Row k="מסמכים" v={docDone ? `${docDone} צורפו` : "—"} onEdit={() => goTo("documents")} />
      </dl>

      <div className="mt-5 rounded-xl border border-zinc-200 p-4">
        <p className="text-base font-medium">הצהרת המבוטח</p>
        <p className="mt-2 text-xs leading-relaxed text-zinc-600">
          אני החתום/ה מטה מצהיר/ה כי הפרטים שמסרתי נכונים ומלאים, ומסכים/ה כי המידע יועבר
          לחברת הביטוח ולסוכן לצורך טיפול בתביעה, לרבות העברת מידע מהאגף לרישוי במשרד התחבורה.
        </p>
        <label className="mt-3 flex items-start gap-2">
          <input
            type="checkbox"
            checked={s.declaration.data_consent}
            onChange={(e) =>
              set({
                declaration: {
                  ...s.declaration,
                  data_consent: e.target.checked,
                  signed_date: e.target.checked ? s.declaration.signed_date || todayISO() : "",
                },
              })
            }
            className="mt-1 h-5 w-5"
          />
          <span className="text-base">אני מאשר/ת את ההצהרה ואת העברת המידע.</span>
        </label>
        {s.thirdParty.present && (
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={s.declaration.poa_third_party}
              onChange={(e) => set({ declaration: { ...s.declaration, poa_third_party: e.target.checked } })}
              className="mt-1 h-5 w-5"
            />
            <span className="text-base">
              אני מייפה את כוח חברת הביטוח לטפל בתביעת צד ג׳ (סעיף 68 לחוק חוזה הביטוח).
            </span>
          </label>
        )}
        <p className="mt-3 text-xs text-zinc-500">
          חתימה: <span className="font-medium">{`${s.insured.first_name} ${s.insured.last_name}`.trim() || "—"}</span>
          {s.declaration.signed_date && <> · {toILDate(s.declaration.signed_date)}</>}
        </p>
      </div>

      {submitError && (
        <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {submitError}
        </p>
      )}
    </div>
  );
}
