import type { State } from "@/lib/collection/claim-state";
import { Text } from "./fields";

export default function WhenWhereStep({
  s,
  set,
  geoBusy,
  geoError,
  useMyLocation,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  geoBusy: boolean;
  geoError: string | null;
  useMyLocation: () => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">מתי ואיפה קרתה התאונה?</h2>
      <Text required label="תאריך" type="date" value={s.accident.date} onChange={(v) => set({ accident: { ...s.accident, date: v } })} />
      <Text required label="שעה" type="time" value={s.accident.time} onChange={(v) => set({ accident: { ...s.accident, time: v } })} />
      <Text required label="מיקום" value={s.accident.location} onChange={(v) => set({ accident: { ...s.accident, location: v } })} placeholder="צומת / כתובת / כביש" />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={geoBusy}
        className="min-h-12 rounded-lg border border-blue-600 px-3 py-3 text-sm text-blue-700 disabled:opacity-50"
      >
        {geoBusy ? "מאתר…" : "📍 המיקום הנוכחי שלי"}
      </button>
      {geoError && <p className="text-xs text-amber-600">{geoError}</p>}
    </div>
  );
}
