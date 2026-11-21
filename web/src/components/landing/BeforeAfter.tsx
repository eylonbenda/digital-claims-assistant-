// Hero visual — the product's before/after: a WhatsApp chase collapsing into an
// ordered case file. Bubbles pop in sequence, then the checkmarks land. The
// keyframes live in the landing page's own <style> block.
export function BeforeAfter() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      {/* the old way: a WhatsApp thread going nowhere */}
      <div className="rounded-2xl border border-line bg-[#efeae2] p-4 shadow-[0_1px_2px_rgba(24,36,56,.06)]">
        <p className="mb-3 text-center text-[11px] font-medium text-zinc-500">
          יום שלישי, 23:47
        </p>
        <div className="space-y-2 text-sm leading-snug text-zinc-900">
          <div className="pop pop-1 me-auto w-fit max-w-[80%] rounded-xl rounded-ss-none bg-white px-3 py-2 shadow-sm">
            עברתי תאונה 😰
          </div>
          <div className="pop pop-2 ms-auto w-fit max-w-[80%] rounded-xl rounded-se-none bg-[#dcf8c6] px-3 py-2 shadow-sm">
            מצטערים לשמוע! תשלח צילום רישיון + רישיון רכב + תמונות נזק
          </div>
          <div className="pop pop-3 me-auto w-fit max-w-[80%] rounded-xl rounded-ss-none bg-white px-3 py-2 shadow-sm">
            <span className="block h-16 w-36 rounded-lg bg-zinc-300/70 blur-[2px]" />
            <span className="mt-1 block text-[11px] text-zinc-400">תמונה מטושטשת</span>
          </div>
          <div className="pop pop-4 ms-auto w-fit max-w-[80%] rounded-xl rounded-se-none bg-[#dcf8c6] px-3 py-2 shadow-sm">
            זה הצד הלא נכון… ומי הצד השני? יש לו ביטוח?
          </div>
          <div className="pop pop-5 me-auto w-fit max-w-[80%] rounded-xl rounded-ss-none bg-white px-3 py-2 shadow-sm">
            אשלח מחר מבטיח
          </div>
        </div>
      </div>

      {/* the new way: an ordered tik */}
      <div className="pop pop-6 relative z-10 -mt-6 ms-8 rounded-2xl border border-line bg-white p-4 text-ink shadow-[0_18px_40px_-18px_rgba(24,36,56,.35)]">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold">תיק תביעה — דנה כהן</p>
          <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
            צד ג׳ · דוח פרטי
          </span>
        </div>
        <ul className="mt-3 space-y-1.5 text-sm">
          {[
            "רישיון נהיגה + רישיון רכב",
            "תמונות נזק (4)",
            "פרטי צד ג׳ + חברת ביטוח",
            "טופס הודעה על תאונה — ממולא",
          ].map((item, i) => (
            <li key={item} className="flex items-center gap-2">
              <span
                className={`check check-${i + 1} grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700`}
              >
                ✓
              </span>
              {item}
            </li>
          ))}
        </ul>
        <div className="check check-5 mt-3 flex items-center justify-between border-t border-line pt-3 text-xs">
          <span className="text-muted">השלב הבא</span>
          <span className="font-semibold text-brand">שליחה למבטחת</span>
        </div>
      </div>
    </div>
  );
}
