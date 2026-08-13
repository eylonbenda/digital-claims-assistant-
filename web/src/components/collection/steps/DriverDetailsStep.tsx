import type { State } from "@/lib/collection/claim-state";
import { Text } from "./fields";

export default function DriverDetailsStep({
  s,
  set,
  idWarn,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  idWarn: (v: string) => string | undefined;
}) {
  return (
    <div>
      <h2 className="text-2xl font-bold">פרטי הנהג</h2>
      <p className="mt-1 text-base text-zinc-500">ציינת שמישהו אחר נהג — כמה פרטים עליו/עליה</p>
      <div className="mt-4 space-y-3">
        <Text required label="שם פרטי" value={s.driver.first_name} onChange={(v) => set({ driver: { ...s.driver, first_name: v } })} />
        <Text required label="שם משפחה" value={s.driver.last_name} onChange={(v) => set({ driver: { ...s.driver, last_name: v } })} />
        <Text required label="תעודת זהות" inputMode="numeric" warn={idWarn(s.driver.id_number)} value={s.driver.id_number} onChange={(v) => set({ driver: { ...s.driver, id_number: v } })} />
        <Text label="מספר רישיון נהיגה" inputMode="numeric" value={s.driver.license_number} onChange={(v) => set({ driver: { ...s.driver, license_number: v } })} />
        <Text label="קרבה למבוטח" value={s.driver.relation_to_insured} onChange={(v) => set({ driver: { ...s.driver, relation_to_insured: v } })} placeholder="בן/בת זוג, עובד, בן משפחה…" />
      </div>
    </div>
  );
}
