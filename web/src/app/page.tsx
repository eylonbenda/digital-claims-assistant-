import type { Metadata } from "next";
import { Frank_Ruhl_Libre } from "next/font/google";
import Image from "next/image";
import Link from "next/link";

// Display face for the landing headline only — the serif of Israeli print and
// official forms, the world this product modernizes. Body text stays sans.
const frank = Frank_Ruhl_Libre({
  subsets: ["hebrew"],
  weight: ["700", "900"],
  variable: "--font-frank",
});

export const metadata: Metadata = {
  title: "OpenTik — עוזר התביעות הדיגיטלי לסוכני ביטוח",
  description:
    "מ׳עברתי תאונה׳ בוואטסאפ לתיק תביעה מסודר עם טופס הודעה על תאונה ממולא — בלי מרדף אחרי הלקוח.",
  openGraph: {
    title: "OpenTik — עוזר התביעות הדיגיטלי לסוכני ביטוח",
    description:
      "מ׳עברתי תאונה׳ בוואטסאפ לתיק תביעה מסודר עם טופס הודעה על תאונה ממולא — בלי מרדף אחרי הלקוח.",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
};

const WHATSAPP_DEMO_URL = `https://wa.me/972524488867?text=${encodeURIComponent(
  "היי, אשמח לתאם הדגמה של OpenTik"
)}`;

const INSURERS =
  "הראל · מגדל · הפניקס · מנורה · איילון · הכשרה · שלמה · ליברה · AIG";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.18-1.42-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.05 2a9.9 9.9 0 0 0-8.57 14.86L2 22l5.27-1.38A9.9 9.9 0 1 0 12.05 2zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 1 1 6.97 3.86z" />
    </svg>
  );
}

// Hero visual — the product's before/after: a WhatsApp chase collapsing into an
// ordered case file. Bubbles pop in sequence, then the checkmarks land.
function BeforeAfter() {
  return (
    <div className="relative mx-auto w-full max-w-md">
      {/* the old way: a WhatsApp thread going nowhere */}
      <div className="rounded-2xl border border-zinc-200 bg-[#efeae2] p-4 shadow-sm">
        <p className="mb-3 text-center text-[11px] font-medium text-zinc-500">
          יום שלישי, 23:47
        </p>
        <div className="space-y-2 text-sm leading-snug">
          <div className="pop pop-1 me-auto w-fit max-w-[80%] rounded-xl rounded-ss-none bg-white px-3 py-2 shadow-sm">
            עברתי תאונה 😰
          </div>
          <div className="pop pop-2 ms-auto w-fit max-w-[80%] rounded-xl rounded-se-none bg-[#dcf8c6] px-3 py-2 shadow-sm">
            מצטער לשמוע! תשלח צילום רישיון + רישיון רכב + תמונות נזק
          </div>
          <div className="pop pop-3 me-auto w-fit max-w-[80%] rounded-xl rounded-ss-none bg-white px-3 py-2 shadow-sm">
            <span className="block h-16 w-36 rounded-lg bg-zinc-300/70 blur-[2px]" aria-hidden />
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
      <div className="pop pop-6 relative z-10 -mt-6 ms-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold text-zinc-900">תיק תביעה — דנה כהן</p>
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            מקיף · הסדר מוסכים
          </span>
        </div>
        <ul className="mt-3 space-y-1.5 text-sm text-zinc-700">
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
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "שולחים ללקוח קישור אחד",
    body: "בוואטסאפ, מיד אחרי הטלפון הראשון. בלי אפליקציה ובלי סיסמה.",
  },
  {
    title: "הלקוח עונה ומצלם",
    body: "אשף מודרך אוסף את פרטי התאונה, המסמכים והתמונות — ובודק בעצמו מה חסר.",
  },
  {
    title: "מקבלים תיק מוכן",
    body: "סיווג התביעה, צ׳ק־ליסט מסמכים, וטופס ההודעה על תאונה ממולא לחברת הביטוח.",
  },
];

const PAINS = [
  {
    title: "המרדף בוואטסאפ",
    body: "״תשלח צילום רישיון״, ״חסר עוד מסמך״ — שעות של הודעות על כל תיק.",
  },
  {
    title: "אותו טופס, ביד, כל פעם",
    body: "הודעה על תאונה שממולאת ידנית מחדש לכל חברת ביטוח.",
  },
  {
    title: "אין תמונת מצב",
    body: "מה חסר בכל תיק? מי תקוע על מה? הכול בראש או בפתקים.",
  },
];

export default function Home() {
  return (
    <main className={`${frank.variable} flex-1 bg-stone-50 text-zinc-900`}>
      {/* orchestrated load-in; stills for reduced motion */}
      <style>{`
        .pop, .check { opacity: 0; animation: pop .35s ease-out forwards; }
        .pop-1 { animation-delay: .1s } .pop-2 { animation-delay: .35s }
        .pop-3 { animation-delay: .6s } .pop-4 { animation-delay: .85s }
        .pop-5 { animation-delay: 1.1s } .pop-6 { animation-delay: 1.5s }
        .check-1 { animation-delay: 1.8s } .check-2 { animation-delay: 1.95s }
        .check-3 { animation-delay: 2.1s } .check-4 { animation-delay: 2.25s }
        @keyframes pop {
          from { opacity: 0; transform: translateY(6px) scale(.97); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .pop, .check { animation: none; opacity: 1; }
        }
      `}</style>

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Image
          src="/brand/logo.svg"
          alt="OpenTik"
          width={150}
          height={40}
          priority
          className="h-9 w-auto"
        />
        <Link
          href="/login"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900"
        >
          כניסת סוכנים
        </Link>
      </header>

      {/* hero */}
      <section className="mx-auto grid w-full max-w-5xl items-center gap-10 px-6 pb-16 pt-8 md:grid-cols-2 md:gap-8">
        <div>
          <h1
            className="text-5xl font-black leading-[1.1] tracking-tight md:text-6xl"
            style={{ fontFamily: "var(--font-frank), serif" }}
          >
            פותחים תיק.
            <br />
            <span className="text-blue-600">סוגרים עניין.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-zinc-600">
            OpenTik אוסף מהלקוח את כל פרטי התאונה, המסמכים והתמונות — ומגיש לך
            תיק תביעה מסודר עם טופס ״הודעה על תאונה״ ממולא. בלי מרדף בוואטסאפ.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a
              href={WHATSAPP_DEMO_URL}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1faa55] px-6 py-3.5 font-semibold text-white shadow-sm hover:bg-[#178f47]"
            >
              <WhatsAppIcon className="size-5" />
              לתיאום הדגמה בוואטסאפ
            </a>
            <p className="text-sm text-zinc-500">
              עונים אישית · <span dir="ltr">052-448-8867</span>
            </p>
          </div>
        </div>
        <BeforeAfter />
      </section>

      {/* the old way */}
      <section className="border-y border-zinc-200 bg-white">
        <div className="mx-auto grid w-full max-w-5xl gap-8 px-6 py-14 md:grid-cols-3">
          {PAINS.map((p) => (
            <div key={p.title}>
              <h2 className="font-semibold text-zinc-900">{p.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-zinc-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works — a real sequence, hence the numbers */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2
          className="text-3xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-frank), serif" }}
        >
          איך זה עובד
        </h2>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600 font-bold text-white">
                {i + 1}
              </span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-600">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* proof: a real form, filled by the engine from demo data */}
      <section className="border-t border-zinc-200 bg-white">
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <div className="max-w-xl">
            <h2
              className="text-3xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-frank), serif" }}
            >
              הטופס מתמלא לבד
            </h2>
            <p className="mt-3 leading-relaxed text-zinc-600">
              מהפרטים שהלקוח מסר, OpenTik ממלא את טופס ה״הודעה על תאונה״ של חברת
              הביטוח — מוכן להגשה. כך זה נראה, על נתוני דוגמה:
            </p>
          </div>
          <div className="mt-8 overflow-hidden rounded-2xl border border-zinc-200 shadow-md">
            <Image
              src="/landing/form-sample.png"
              alt="טופס הודעה על תאונה שמולא אוטומטית על ידי המערכת (נתוני דוגמה)"
              width={1488}
              height={880}
              className="w-full"
              loading="eager"
            />
          </div>
          <p className="mt-4 text-sm text-zinc-500">עובד עם הטפסים של: {INSURERS}</p>
        </div>
      </section>

      {/* closing CTA */}
      <section className="mx-auto w-full max-w-5xl px-6 py-16 text-center">
        <h2
          className="text-3xl font-bold tracking-tight"
          style={{ fontFamily: "var(--font-frank), serif" }}
        >
          רוצה לראות את זה על תיק אמיתי?
        </h2>
        <p className="mx-auto mt-3 max-w-md text-zinc-600">
          הדגמה קצרה בוואטסאפ או בזום — על תביעה מהשולחן שלך.
        </p>
        <a
          href={WHATSAPP_DEMO_URL}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#1faa55] px-7 py-4 text-lg font-semibold text-white shadow-sm hover:bg-[#178f47]"
        >
          <WhatsAppIcon className="size-5" />
          לתיאום הדגמה
        </a>
      </section>

      <footer className="border-t border-zinc-200">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-zinc-500">
          <p>
            <span className="font-semibold text-zinc-700">
              Open<span className="text-blue-600">Tik</span>
            </span>{" "}
            — עוזר התביעות הדיגיטלי
          </p>
          <div className="flex items-center gap-4">
            <span dir="ltr">052-448-8867</span>
            <Link href="/login" className="hover:text-zinc-700">
              כניסת סוכנים
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
