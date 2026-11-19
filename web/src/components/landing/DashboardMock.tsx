// A miniature of the business's side: the unified claims list with its stage
// chips, and the "waiting at the insurer" aging tile from the overview page.
// Names, plates and amounts are invented demo data. Like WizardMock this is a
// picture of the real UI's vocabulary, not the components themselves — keep the
// chip and status wording in step with `lib/dashboard/copy.ts` and
// `lib/handling/copy.ts`.
const CHIPS = [
  { label: "צריך אותך", count: 3, active: true },
  { label: "אצל הלקוח", count: 5 },
  { label: "לפני שליחה למבטחת", count: 2 },
  { label: "נשלח למבטחת", count: 7 },
  { label: "ממתין לתשלום", count: 4 },
];

const ROWS = [
  {
    name: "דנה כהן",
    meta: "צד ג׳ · דוח פרטי",
    line: "המבטחת ביקשה השלמות — חסרה חשבונית תיקון",
    tone: "amber",
    badge: "מסמך חדש",
  },
  {
    name: "יוסי לוי",
    meta: "מקיף",
    line: "הלקוח סיים למלא — הטופס מוכן לבדיקה",
    tone: "brand",
    badge: "חדש",
  },
  {
    name: "מיכל אברהם",
    meta: "צד ג׳ · הסדר",
    line: "נשלחה למבטחת לפני 32 יום — אין תשובה",
    tone: "red",
  },
  {
    name: "אבי מזרחי",
    meta: "מקיף",
    line: "אושרה — ממתין לתשלום",
    tone: "emerald",
  },
] as const;

const DOT = {
  amber: "bg-amber-500",
  brand: "bg-brand",
  red: "bg-red-500",
  emerald: "bg-emerald-500",
};

const AGING = [
  { band: "0–14 יום", count: 3, width: "38%" },
  { band: "15–30", count: 2, width: "26%" },
  { band: "31–45", count: 1, width: "14%", warn: true },
  { band: "45+", count: 1, width: "14%", warn: true },
];

export function DashboardMock() {
  return (
    <div
      className="w-full overflow-hidden rounded-2xl border border-line bg-white text-ink shadow-[0_30px_60px_-34px_rgba(24,36,56,.5)]"
      role="img"
      aria-label="מסך ניהול התביעות: רשימת תיקים לפי שלב, מה דורש טיפול היום, וכמה זמן כסף מחכה אצל חברת הביטוח"
    >
      {/* window bar */}
      <div className="flex items-center justify-between border-b border-line bg-canvas px-4 py-2.5">
        <p className="text-sm font-semibold">תביעות</p>
        <span className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white">
          + תיק חדש
        </span>
      </div>

      <div className="p-4">
        {/* stage chips */}
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <span
              key={c.label}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                c.active
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white text-zinc-600"
              }`}
            >
              {c.label} <span className={c.active ? "opacity-80" : "text-muted"}>{c.count}</span>
            </span>
          ))}
        </div>

        {/* claim rows */}
        <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
          {ROWS.map((r) => (
            <li key={r.name} className="flex items-start gap-3 px-3 py-2.5">
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${DOT[r.tone]}`} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-[11px] text-muted">{r.meta}</span>
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-600">{r.line}</p>
              </div>
              {"badge" in r && (
                <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand">
                  {r.badge}
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* aging tile */}
        <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold">מחכים למבטחת</p>
            <p className="text-xs text-muted">
              7 תיקים · <span className="font-semibold text-ink">₪48,300</span>
            </p>
          </div>
          <div className="mt-2.5 flex gap-1">
            {AGING.map((a) => (
              <div key={a.band} style={{ width: a.width }} className="min-w-0 grow">
                <div
                  className={`h-2 rounded-full ${
                    "warn" in a ? "bg-amber-500" : "bg-brand/70"
                  }`}
                />
                <p className="mt-1 truncate text-[10px] text-muted">
                  {a.band} · {a.count}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
