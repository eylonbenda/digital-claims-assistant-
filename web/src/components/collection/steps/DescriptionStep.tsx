import type { State } from "@/lib/collection/claim-state";

export default function DescriptionStep({ s, set }: { s: State; set: (patch: Partial<State>) => void }) {
  return (
    <div>
      <h2 className="text-2xl font-bold">
        מה קרה?<span className="text-red-500"> *</span>
      </h2>
      <p className="mt-1 text-base text-zinc-500">
        תאר/י בקצרה את האירוע במילים שלך — גם 2–3 משפטים מספיקים. הסוכן ישלים
        איתך פרטים אם צריך.
      </p>
      <textarea
        value={s.accident.description}
        onChange={(e) => set({ accident: { ...s.accident, description: e.target.value } })}
        rows={5}
        className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
        placeholder="למשל: עצרתי ברמזור אדום ורכב מאחור פגע בי..."
      />
    </div>
  );
}
