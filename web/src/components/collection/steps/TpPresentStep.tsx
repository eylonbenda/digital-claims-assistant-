import type { State } from "@/lib/collection/claim-state";
import { Choice } from "./fields";

export default function TpPresentStep({
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
      <h2 className="text-2xl font-bold">היה צד שני מעורב?</h2>
      <div className="mt-4">
        <Choice<"yes" | "no">
          value={s.thirdParty.present === null ? null : s.thirdParty.present ? "yes" : "no"}
          options={[
            { v: "yes", label: "כן" },
            { v: "no", label: "לא (תאונה עצמית)" },
          ]}
          onChange={(v) => {
            set({ thirdParty: { ...s.thirdParty, present: v === "yes" } });
            advance();
          }}
        />
      </div>
    </div>
  );
}
