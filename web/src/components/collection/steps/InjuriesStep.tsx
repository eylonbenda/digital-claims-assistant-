import type { State } from "@/lib/collection/claim-state";
import { Choice } from "./fields";

export default function InjuriesStep({
  s,
  set,
  advance,
  cancelAdvance,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  advance: () => void;
  cancelAdvance: () => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold">יש נפגעים בתאונה?</h2>
      <div className="mt-4">
        <Choice<"yes" | "no">
          value={s.injuries === null ? null : s.injuries ? "yes" : "no"}
          options={[
            { v: "yes", label: "כן, יש נפגעים" },
            { v: "no", label: "לא, אין נפגעים" },
          ]}
          onChange={(v) => {
            set({ injuries: v === "yes" });
            // "יש נפגעים" must never be overtaken by a still-pending "לא" advance
            // from a rapid no→yes double-tap — cancel it before it can fire.
            if (v === "yes") cancelAdvance();
            else advance();
          }}
        />
      </div>
      {s.injuries && (
        <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-base text-red-800">
          <strong>אם יש סכנת חיים — חייגו 101 מיד.</strong> מומלץ גם להזעיק משטרה
          (100). הסוכן יקבל התראה דחופה. אפשר לסגור עכשיו ולחזור לקישור מאוחר
          יותר — התשובות שלך נשמרות.
        </div>
      )}
    </div>
  );
}
