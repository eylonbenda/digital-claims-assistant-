import type { State } from "@/lib/collection/claim-state";

export default function IntroStep({ s, set }: { s: State; set: (patch: Partial<State>) => void }) {
  return (
    <div>
      <h2 className="text-2xl font-bold">דיווח על תאונת רכב</h2>
      <p className="mt-2 text-zinc-600">
        מצטערים על התאונה — אנחנו כאן לעזור. כמה שאלות קצרות (כ־3 דקות), והסוכן
        ייקח את זה מכאן.
      </p>
      <p className="mt-2 text-base text-zinc-500">
        הפרטים מועברים לסוכן הביטוח שלך בלבד, והתשובות נשמרות — אפשר לעצור ולחזור
        לקישור בכל שלב.
      </p>
      <label className="mt-5 flex items-start gap-2">
        <input
          type="checkbox"
          checked={s.consent}
          onChange={(e) => set({ consent: e.target.checked })}
          className="mt-1 h-5 w-5"
        />
        <span className="text-base">אני מאשר/ת איסוף הפרטים והעברתם לסוכן הביטוח.</span>
      </label>
    </div>
  );
}
