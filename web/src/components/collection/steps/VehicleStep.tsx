import type { State } from "@/lib/collection/claim-state";
import { Text } from "./fields";

export default function VehicleStep({
  s,
  set,
  lookup,
  plateWarn,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  lookup: "idle" | "looking" | "found" | "missing";
  plateWarn: (v: string) => string | undefined;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">הרכב שלך</h2>
      <p className="text-base text-zinc-500">
        הזן/י מספר רישוי — נשלים את פרטי הרכב אוטומטית.
      </p>
      <Text required label="מספר רישוי" inputMode="numeric" warn={plateWarn(s.vehicle.plate)} value={s.vehicle.plate} onChange={(v) => set({ vehicle: { ...s.vehicle, plate: v } })} />
      {lookup === "looking" && <p className="text-xs text-zinc-500">מחפש את הרכב…</p>}
      {lookup === "found" && (
        <p className="text-xs text-green-700">✓ מולא ממאגר משרד התחבורה — אפשר לתקן</p>
      )}
      {lookup === "missing" && (
        <p className="text-xs text-zinc-500">לא מצאנו את הרכב במאגר — אפשר למלא ידנית</p>
      )}
      <Text required label="יצרן ודגם" value={s.vehicle.manufacturer} onChange={(v) => set({ vehicle: { ...s.vehicle, manufacturer: v } })} placeholder="לדוגמה: טויוטה קורולה" />
      <Text required label="שנת ייצור" inputMode="numeric" value={s.vehicle.year} onChange={(v) => set({ vehicle: { ...s.vehicle, year: v } })} />
    </div>
  );
}
