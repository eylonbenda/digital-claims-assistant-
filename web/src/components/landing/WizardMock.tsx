// A miniature of the client's collection wizard (`/c/[token]`), drawn in markup
// so it stays sharp at phone width. It borrows the real wizard's vocabulary —
// three chapters, tap questions first, plate lookup, guided uploads — but is a
// picture, not the component: nothing here is interactive.
const CHAPTERS = ["שאלות קצרות", "פרטים", "מסמכים"];

export function WizardMock() {
  return (
    <div
      className="mx-auto w-full max-w-[19rem]"
      role="img"
      aria-label="המסך שהלקוח רואה בטלפון: שאלות קצרות, פרטי רכב שמתמלאים לפי מספר הרישוי, וצילום מסמכים"
    >
      <div className="rounded-[2.2rem] border border-zinc-800 bg-zinc-900 p-2 shadow-[0_30px_60px_-30px_rgba(24,36,56,.55)]">
        <div className="overflow-hidden rounded-[1.7rem] bg-white text-ink">
          {/* chapter progress */}
          <div className="border-b border-line px-4 pb-3 pt-5">
            <div className="flex gap-1.5">
              {CHAPTERS.map((c, i) => (
                <div key={c} className="flex-1">
                  <div
                    className={`h-1 rounded-full ${i < 2 ? "bg-brand" : "bg-line"}`}
                  />
                  <p
                    className={`mt-1.5 text-[10px] ${
                      i === 1 ? "font-semibold text-brand" : "text-muted"
                    }`}
                  >
                    {c}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4 px-4 py-4">
            {/* an answered tap question */}
            <div>
              <p className="text-xs text-muted">היה רכב נוסף שמעורב בתאונה?</p>
              <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-center text-xs font-medium">
                <span className="rounded-lg border border-brand bg-brand-soft py-2 text-brand">
                  כן
                </span>
                <span className="rounded-lg border border-line py-2 text-muted">לא</span>
              </div>
            </div>

            {/* plate lookup */}
            <div>
              <p className="text-xs text-muted">מספר הרכב שלך</p>
              {/* plates read left-to-right with the blue IL band on the left */}
              <div
                dir="ltr"
                className="mt-1.5 flex items-center overflow-hidden rounded-lg border border-line"
              >
                <span className="self-stretch bg-brand px-1.5 text-[9px] font-bold leading-[2.6rem] text-white">
                  IL
                </span>
                <span
                  dir="ltr"
                  className="flex-1 bg-[#ffd428] py-2 text-center font-mono text-base font-bold tracking-wider text-zinc-900"
                >
                  123-45-678
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-700">
                <span className="grid size-4 place-items-center rounded-full bg-emerald-100 text-[9px] font-bold">
                  ✓
                </span>
                מאזדה 3, 2021 — זוהה לפי משרד התחבורה
              </p>
            </div>

            {/* guided uploads */}
            <div>
              <p className="text-xs text-muted">צילומים</p>
              <ul className="mt-1.5 space-y-1.5 text-xs">
                <li className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span>רישיון נהיגה</span>
                  <span className="font-medium text-emerald-700">התקבל ✓</span>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-line px-3 py-2">
                  <span>תמונות הנזק</span>
                  <span className="font-medium text-emerald-700">4 תמונות ✓</span>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-dashed border-brand/50 bg-brand-soft/60 px-3 py-2">
                  <span>רישיון רכב</span>
                  <span className="font-semibold text-brand">לצלם עכשיו</span>
                </li>
              </ul>
            </div>

            <div className="rounded-xl bg-brand py-2.5 text-center text-sm font-semibold text-white">
              המשך
            </div>
            <p className="text-center text-[10px] text-muted">
              אפשר לעצור ולחזור — מה שמילאת נשמר
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
