import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-8">
      <h1 className="text-3xl font-bold tracking-tight">עוזר התביעות הדיגיטלי</h1>
      <p className="mt-3 text-zinc-600">
        מערכת ניהול תביעות רכב לסוכני ביטוח — הופכת תאונה מבולגנת לתיק מסודר ולטופס
        &quot;הודעה על תאונה&quot; ממולא.
      </p>

      <Link
        href="/c/demo"
        className="mt-5 inline-block rounded-lg bg-blue-600 px-5 py-3 font-medium text-white"
      >
        התחל דיווח תאונה (דמו)
      </Link>

      <div className="mt-8 rounded-xl border border-zinc-200 p-5">
        <h2 className="font-semibold">סטטוס השלד</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-600">
          <li>✓ Next.js + TypeScript + Tailwind (RTL)</li>
          <li>✓ Supabase + Anthropic SDK מותקנים</li>
          <li>
            בדיקת תצורה:{" "}
            <a className="text-blue-700 underline" href="/api/health">
              /api/health
            </a>
          </li>
        </ul>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 p-5">
        <h2 className="font-semibold">דמו: מילוי טופס &quot;הודעה על תאונה&quot;</h2>
        <p className="mt-1 text-sm text-zinc-600">נתוני דמו ← טופס ממולא (PDF):</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            {/* API route streams a filled PDF — a plain <a> download, not page navigation. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="text-blue-700 underline" href="/api/forms/hachshara">
              הכשרה
            </a>
          </li>
          <li>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="text-blue-700 underline" href="/api/forms/migdal">
              מגדל
            </a>
          </li>
        </ul>
      </div>
    </main>
  );
}
