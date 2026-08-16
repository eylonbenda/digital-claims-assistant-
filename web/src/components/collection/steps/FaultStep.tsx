import type { Fault } from "@/lib/formfill/types";
import type { State } from "@/lib/collection/claim-state";
import { Choice } from "./fields";

export default function FaultStep({
  s,
  set,
  advance,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  advance: () => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold">מי אשם בתאונה?</h2>
      <p className="mt-1 text-base text-zinc-500">לפי דעתך — אפשר לשנות בהמשך.</p>
      <div className="mt-4">
        <Choice<Fault>
          value={s.fault}
          options={[
            { v: "third_party", label: "הצד השני אשם" },
            { v: "me", label: "אני אשם/ת" },
            { v: "unknown", label: "לא בטוח/ה" },
          ]}
          onChange={(v) => {
            set({ fault: v });
            advance();
          }}
        />
      </div>
    </div>
  );
}
