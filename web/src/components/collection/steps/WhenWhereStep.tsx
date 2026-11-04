import type { State } from "@/lib/collection/claim-state";
import { Text } from "./fields";

// No "current location" button: the client fills this in after the event, not at the
// scene (expert review 2026-11-01). The place is optional and split into street + city.
export default function WhenWhereStep({
  s,
  set,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">מתי ואיפה קרתה התאונה?</h2>
      <Text required label="תאריך" type="date" value={s.accident.date} onChange={(v) => set({ accident: { ...s.accident, date: v } })} />
      <Text required label="שעה" type="time" value={s.accident.time} onChange={(v) => set({ accident: { ...s.accident, time: v } })} />
      <Text label="עיר" value={s.accident.city ?? ""} onChange={(v) => set({ accident: { ...s.accident, city: v } })} placeholder="למשל: רעננה" />
      {/* A pre-split save's free-text location shows here until edited (see accidentPlace). */}
      <Text
        label="רחוב / שכונה"
        value={s.accident.street ?? s.accident.location}
        onChange={(v) => set({ accident: { ...s.accident, street: v } })}
        placeholder="רחוב, שכונה, צומת או כביש"
      />
    </div>
  );
}
