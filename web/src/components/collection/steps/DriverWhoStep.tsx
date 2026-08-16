import type { State } from "@/lib/collection/claim-state";
import { Choice } from "./fields";

export default function DriverWhoStep({
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
      <h2 className="text-2xl font-bold">מי נהג ברכב בזמן התאונה?</h2>
      <div className="mt-4">
        <Choice<"insured" | "other">
          value={s.driver.isInsured === null ? null : s.driver.isInsured ? "insured" : "other"}
          options={[
            { v: "insured", label: "אני (המבוטח)" },
            { v: "other", label: "מישהו אחר" },
          ]}
          onChange={(v) => {
            set({ driver: { ...s.driver, isInsured: v === "insured" } });
            advance();
          }}
        />
      </div>
    </div>
  );
}
