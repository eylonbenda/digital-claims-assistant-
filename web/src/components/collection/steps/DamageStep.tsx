import { DAMAGE_AREA_LABEL, type DamageArea, type State } from "@/lib/collection/claim-state";
import { Choice } from "./fields";

type Damage = NonNullable<State["damage"]>;
const EMPTY_DAMAGE: Damage = { areas: [], hasMore: null, moreAreas: [] };

// מוקד נזק (expert review 2026-11-01). Areas are toggles laid out around a top-down car,
// so adjacent picks (front + right) read as one corner. The page is RTL, so the first
// grid column is the right-hand side — the car's right.
export default function DamageStep({ s, set }: { s: State; set: (patch: Partial<State>) => void }) {
  const d = s.damage ?? EMPTY_DAMAGE;
  const update = (patch: Partial<Damage>) => set({ damage: { ...d, ...patch } });
  return (
    <div>
      <h2 className="text-2xl font-bold">
        איפה נפגע הרכב שלך?<span className="text-red-500"> *</span>
      </h2>
      <p className="mt-1 text-base text-zinc-500">
        אפשר לסמן יותר מאזור אחד — למשל קדמי + צד ימין לפגיעה בפינה.
      </p>
      <CarAreas
        selected={d.unsure ? [] : d.areas}
        onToggle={(a) => update({ unsure: false, areas: toggle(d.areas, a) })}
      />
      <button
        type="button"
        onClick={() => update({ unsure: !d.unsure, areas: [], hasMore: null, moreAreas: [] })}
        className={`mt-3 w-full rounded-xl border px-4 py-3 text-base ${
          d.unsure ? "border-blue-600 bg-blue-50 font-medium" : "border-zinc-300 hover:bg-zinc-50"
        }`}
      >
        לא בטוח/ה
      </button>

      {!d.unsure && d.areas.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xl font-bold">יש מוקד נזק נוסף?</h3>
          <p className="mt-1 text-sm text-zinc-500">פגיעה נוספת במקום אחר ברכב, שאינה צמודה לפגיעה הראשית.</p>
          <div className="mt-3">
            <Choice<"yes" | "no">
              value={d.hasMore === null ? null : d.hasMore ? "yes" : "no"}
              options={[
                { v: "yes", label: "כן" },
                { v: "no", label: "לא" },
              ]}
              onChange={(v) => update({ hasMore: v === "yes", moreAreas: v === "yes" ? d.moreAreas : [] })}
            />
          </div>
          {d.hasMore && (
            <>
              <p className="mt-4 text-base text-zinc-600">איפה המוקד הנוסף?</p>
              <CarAreas selected={d.moreAreas} onToggle={(a) => update({ moreAreas: toggle(d.moreAreas, a) })} />
              <p className="mt-3 text-sm text-zinc-500">
                אם שתי הפגיעות קרו באירועים נפרדים (למשל בתאונת שרשרת), כדאי לציין זאת בתיאור בשלב הבא.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const toggle = (list: DamageArea[], a: DamageArea) =>
  list.includes(a) ? list.filter((x) => x !== a) : [...list, a];

function CarAreas({ selected, onToggle }: { selected: DamageArea[]; onToggle: (a: DamageArea) => void }) {
  const btn = (a: DamageArea) => (
    <button
      type="button"
      aria-pressed={selected.includes(a)}
      onClick={() => onToggle(a)}
      className={`min-h-12 rounded-xl border px-2 py-3 text-base transition-colors ${
        selected.includes(a) ? "border-blue-600 bg-blue-50 font-medium" : "border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {DAMAGE_AREA_LABEL[a]}
    </button>
  );
  return (
    <div className="mt-4 grid grid-cols-3 items-stretch gap-2">
      <div />
      {btn("front")}
      <div />
      {btn("right")}
      {/* Top-down car, nose up — an emoji car faces sideways and muddles front/rear. */}
      <div className="flex items-center justify-center" aria-hidden>
        <svg viewBox="0 0 40 72" className="h-20 text-zinc-400">
          <rect x="4" y="2" width="32" height="68" rx="10" fill="currentColor" opacity="0.25" />
          <path d="M9 22 Q20 14 31 22 L29 30 H11 Z" fill="currentColor" />
          <path d="M11 54 H29 L31 60 Q20 66 9 60 Z" fill="currentColor" opacity="0.7" />
        </svg>
      </div>
      {btn("left")}
      <div />
      {btn("rear")}
      <div />
    </div>
  );
}
