import type { Metadata } from "next";
import { Frank_Ruhl_Libre } from "next/font/google";
import Image from "next/image";
import Link from "next/link";
import { BeforeAfter } from "@/components/landing/BeforeAfter";
import { DashboardMock } from "@/components/landing/DashboardMock";
import { WizardMock } from "@/components/landing/WizardMock";

// Display face for headlines only — the serif of Israeli print and official
// forms, the world this product modernizes. Body text stays sans (Heebo).
const frank = Frank_Ruhl_Libre({
  subsets: ["hebrew"],
  weight: ["700", "900"],
  variable: "--font-frank",
});

const TITLE = "OpenTik — ניהול תביעות רכב למוסכים ולסוכני ביטוח";
const DESCRIPTION =
  "מ׳עברתי תאונה׳ בוואטסאפ ועד שהכסף נכנס: איסוף הפרטים והמסמכים מהלקוח, טופס הודעה על תאונה ממולא, ומעקב אחרי כל תביעה עד התשלום.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
};

const WHATSAPP_DEMO_URL = `https://wa.me/972524488867?text=${encodeURIComponent(
  "היי, אשמח לתאם הדגמה של OpenTik"
)}`;

// Every insurer with a form template today (`lib/formfill/templates/`).
const INSURERS = [
  "הראל",
  "מגדל",
  "הפניקס",
  "כלל",
  "מנורה",
  "איילון",
  "הכשרה",
  "שלמה",
  "ליברה",
  "AIG",
  "שומרה",
  "חקלאי",
  "קש",
  "ווישור",
  "אנקור",
];

const serif = { fontFamily: "var(--font-frank), serif" } as const;

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.29.18-1.42-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.05 2a9.9 9.9 0 0 0-8.57 14.86L2 22l5.27-1.38A9.9 9.9 0 1 0 12.05 2zm0 18.1a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 1 1 6.97 3.86z" />
    </svg>
  );
}

function DemoButton({ size = "lg" }: { size?: "sm" | "lg" }) {
  const sizing =
    size === "sm" ? "px-3.5 py-2 text-sm" : "px-6 py-3.5 text-base shadow-sm";
  return (
    <a
      href={WHATSAPP_DEMO_URL}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-[#1faa55] font-semibold text-white hover:bg-[#178f47] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1faa55] ${sizing}`}
    >
      <WhatsAppIcon className={size === "sm" ? "size-4" : "size-5"} />
      {size === "sm" ? "הדגמה" : "לתיאום הדגמה בוואטסאפ"}
    </a>
  );
}

const PAINS = [
  {
    title: "עבודה שהולכת למקום אחר",
    body: "לקוח שתקוע בלי מסמכים לא מחכה. עד שהתיק מתמלא, הרכב כבר במוסך אחר.",
  },
  {
    title: "כסף שתקוע אצל המבטחת",
    body: "תיק שנשלח חסר חוזר עם בקשת השלמות — ועוד חודש עד שהתשלום נכנס.",
  },
  {
    title: "יום שלם של מרדף",
    body: "״תשלח צילום רישיון״, ״חסר עוד מסמך״, ואותו טופס שממולא ביד מחדש לכל חברת ביטוח.",
  },
];

// The three chapters are a real sequence — a claim moves through them in order.
const CHAPTERS = [
  { id: "collect", title: "איסוף מהלקוח", line: "הלקוח ממלא ומצלם בעצמו" },
  { id: "documents", title: "הפקת מסמכים", line: "הטפסים מתמלאים לבד" },
  { id: "manage", title: "ניהול ומעקב", line: "כל תיק עד שהכסף נכנס" },
];

function ChapterHeading({
  n,
  title,
  lead,
}: {
  n: number;
  title: string;
  lead: string;
}) {
  return (
    <div className="max-w-xl">
      <p className="flex items-center gap-3 text-sm font-semibold text-brand">
        <span
          className="grid size-8 place-items-center rounded-full border border-brand/30 text-base"
          style={serif}
        >
          {n}
        </span>
        שלב {n} מתוך 3
      </p>
      <h2
        className="mt-4 text-4xl font-bold leading-tight tracking-tight text-ink md:text-[2.75rem]"
        style={serif}
      >
        {title}
      </h2>
      <p className="mt-4 text-lg leading-relaxed text-zinc-600">{lead}</p>
    </div>
  );
}

function Points({ items }: { items: { title: string; body: string }[] }) {
  return (
    <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2">
      {items.map((p) => (
        <li key={p.title} className="border-s-2 border-brand/25 ps-4">
          <h3 className="font-semibold text-ink">{p.title}</h3>
          <p className="mt-1 text-[15px] leading-relaxed text-zinc-600">{p.body}</p>
        </li>
      ))}
    </ul>
  );
}

const COLLECT_POINTS = [
  {
    title: "קישור אחד בוואטסאפ",
    body: "שולחים ללקוח קישור אישי מיד אחרי השיחה. בלי אפליקציה, בלי סיסמה.",
  },
  {
    title: "שאלות קצרות קודם",
    body: "פציעות, מי נהג, מי אשם, האם היה צד ג׳ — בלחיצה. הפרטים הארוכים אחר כך.",
  },
  {
    title: "פרטי הרכב לפי מספר הרישוי",
    body: "יצרן, דגם ושנה נשלפים ממאגר משרד התחבורה. לא צריך להקליד.",
  },
  {
    title: "צילום מסמכים מודרך",
    body: "רישיון נהיגה, רישיון רכב, תמונות נזק ופרטי הצד השני — כל אחד במקומו.",
  },
  {
    title: "אפשר להפסיק ולחזור",
    body: "ההתקדמות נשמרת. לקוח שעצר באמצע ממשיך מאותה נקודה.",
  },
  {
    title: "יודע מה חסר",
    body: "המערכת מסמנת אילו מסמכים עוד לא הגיעו, ומכינה הודעת תזכורת מוכנה לשליחה.",
  },
];

const DOCUMENT_POINTS = [
  {
    title: "הודעה על תאונה — של כל מבטחת",
    body: "הטופס המקורי של חברת הביטוח, ממולא מהפרטים שהלקוח מסר. אפשר לתקן כל שדה לפני ההגשה.",
  },
  {
    title: "טופס דרישה לצד ג׳",
    body: "בתביעת דוח פרטי: מכתב דרישה למבטחת של הצד האשם, עם שורות הנזק ומע״מ מחושב.",
  },
  {
    title: "רשימת מסמכים לפי סוג התביעה",
    body: "מקיף, דוח פרטי או הסדר — כל מסלול עם המסמכים שהוא דורש, ומה כבר בתיק.",
  },
  {
    title: "חבילה מוכנה למבטחת",
    body: "נמען, נושא, גוף ההודעה והקבצים המצורפים — מוכנים לשליחה למחלקת התביעות הנכונה.",
  },
];

const MANAGE_POINTS = [
  {
    title: "כל התיקים ברשימה אחת",
    body: "מסודרים לפי שלב: אצל הלקוח, לפני שליחה, נשלח למבטחת, ממתין לתשלום.",
  },
  {
    title: "מה צריך אותך היום",
    body: "תיק שהלקוח סיים, מבטחת שביקשה השלמות, תזכורת שהגיע זמנה — בראש הרשימה.",
  },
  {
    title: "משימות ומועדים",
    body: "לכל סוג תביעה המשימות שלו, עם תאריכי יעד, כדי ששום תיק לא ייפול בין הכיסאות.",
  },
  {
    title: "מעקב אחרי שליחה",
    body: "ביקשו השלמות, אושרה, נדחתה, שולמה — הסטטוס והמסמכים בתיק אחד.",
  },
  {
    title: "כמה כסף מחכה, וכמה זמן",
    body: "סכומי התביעות הפתוחות, וכמה ימים כל תיק מחכה לתשובה מהמבטחת.",
  },
  {
    title: "התכתבות עם המבטחת בתיק",
    body: "מיילים מחברת הביטוח נשמרים על התיק שהם שייכים אליו.",
  },
];

export default function Home() {
  return (
    <main className={`${frank.variable} flex-1 bg-[#f7f6f2] text-ink`}>
      {/* the one orchestrated moment: the hero's before/after. Stills for reduced motion. */}
      <style>{`
        html { scroll-behavior: smooth; }
        .pop, .check { opacity: 0; animation: pop .35s ease-out forwards; }
        .pop-1 { animation-delay: .1s } .pop-2 { animation-delay: .35s }
        .pop-3 { animation-delay: .6s } .pop-4 { animation-delay: .85s }
        .pop-5 { animation-delay: 1.1s } .pop-6 { animation-delay: 1.5s }
        .check-1 { animation-delay: 1.8s } .check-2 { animation-delay: 1.95s }
        .check-3 { animation-delay: 2.1s } .check-4 { animation-delay: 2.25s }
        .check-5 { animation-delay: 2.5s }
        @keyframes pop {
          from { opacity: 0; transform: translateY(6px) scale(.97); }
          to   { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .pop, .check { animation: none; opacity: 1; }
        }
      `}</style>

      <header className="sticky top-0 z-30 border-b border-line/80 bg-[#f7f6f2]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-5 py-3 md:px-8">
          <Link href="/" aria-label="OpenTik — לראש העמוד">
            <Image
              src="/brand/logo.svg"
              alt="OpenTik"
              width={150}
              height={40}
              priority
              className="h-8 w-auto"
            />
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-zinc-600 md:flex">
            {CHAPTERS.map((c) => (
              <a key={c.id} href={`#${c.id}`} className="hover:text-ink">
                {c.title}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="whitespace-nowrap rounded-xl px-2 py-2 text-sm font-medium text-zinc-600 hover:text-ink sm:px-3"
            >
              כניסה למערכת
            </Link>
            <DemoButton size="sm" />
          </div>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-12 md:grid-cols-[1.1fr_1fr] md:px-8 md:pt-20">
        <div>
          <p className="text-sm font-semibold text-brand">למוסכים ולסוכני ביטוח</p>
          <h1
            className="mt-4 text-5xl font-black leading-[1.05] tracking-tight md:text-7xl"
            style={serif}
          >
            פותחים תיק.
            <br />
            סוגרים עניין.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-zinc-600">
            OpenTik מנהל את תביעת התאונה מההודעה הראשונה של הלקוח ועד שהכסף נכנס:
            אוסף ממנו את הפרטים, המסמכים והתמונות, ממלא את הטפסים לחברת הביטוח,
            ומראה לך בכל רגע איפה עומד כל תיק.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <DemoButton />
            <p className="text-sm text-zinc-500">
              עונים אישית · <span dir="ltr">052-448-8867</span>
            </p>
          </div>
        </div>
        <BeforeAfter />
      </section>

      {/* insurers */}
      <section className="border-y border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-6 md:flex-row md:items-center md:gap-8 md:px-8">
          <p className="shrink-0 text-sm font-medium text-zinc-500">
            הטפסים של {INSURERS.length} חברות ביטוח:
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-[15px] font-semibold text-zinc-700">
            {INSURERS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* pains */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20 md:px-8">
        <h2
          className="max-w-2xl text-3xl font-bold leading-snug tracking-tight md:text-4xl"
          style={serif}
        >
          תביעה שנתקעת עולה לך פעמיים: בעבודה שלא נכנסה, ובכסף שלא הגיע.
        </h2>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-3">
          {PAINS.map((p) => (
            <div key={p.title} className="bg-white p-6">
              <h3 className="font-semibold text-ink">{p.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-zinc-600">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* the route: three chapters as one line */}
      <section className="bg-ink text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 md:px-8">
          <h2 className="text-2xl font-bold md:text-3xl" style={serif}>
            מערכת אחת לכל הדרך
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3 md:gap-0">
            {CHAPTERS.map((c, i) => (
              <li key={c.id} className="relative md:pe-10">
                {i < CHAPTERS.length - 1 && (
                  <span
                    className="absolute start-12 end-6 top-5 hidden h-px bg-white/25 md:block"
                    aria-hidden
                  />
                )}
                <a href={`#${c.id}`} className="group block">
                  <span
                    className="relative grid size-10 place-items-center rounded-full bg-white text-lg font-bold text-ink"
                    style={serif}
                  >
                    {i + 1}
                  </span>
                  <span className="mt-4 block text-lg font-semibold group-hover:underline">
                    {c.title}
                  </span>
                  <span className="mt-1 block text-sm text-white/65">{c.line}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* 1 — collection */}
      <section id="collect" className="scroll-mt-20 bg-white">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-24 md:grid-cols-[1.25fr_1fr] md:px-8">
          <div>
            <ChapterHeading
              n={1}
              title="הלקוח ממלא בעצמו. בלי מרדף."
              lead="במקום עשרות הודעות הלוך ושוב, הלקוח מקבל אשף מודרך בטלפון שאוסף את כל מה שהתביעה צריכה — ואתה מקבל את זה מסודר."
            />
            <Points items={COLLECT_POINTS} />
          </div>
          <WizardMock />
        </div>
      </section>

      {/* 2 — documents */}
      <section id="documents" className="scroll-mt-20 border-y border-line">
        <div className="mx-auto w-full max-w-6xl px-5 py-24 md:px-8">
          <ChapterHeading
            n={2}
            title="הטפסים מתמלאים לבד."
            lead="מהפרטים שהלקוח מסר, OpenTik מפיק את המסמכים שחברת הביטוח מבקשת — על הטופס המקורי שלה, מוכן להגשה."
          />
          <figure className="mt-10">
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_60px_-34px_rgba(24,36,56,.45)]">
              <Image
                src="/landing/form-sample.png"
                alt="טופס הודעה על תאונה שמולא אוטומטית על ידי המערכת (נתוני דוגמה)"
                width={1488}
                height={880}
                className="w-full"
              />
            </div>
            <figcaption className="mt-3 text-sm text-zinc-500">
              טופס ״הודעה על תאונה״ אמיתי, כפי שהמערכת ממלאת אותו — על נתוני דוגמה.
            </figcaption>
          </figure>
          <Points items={DOCUMENT_POINTS} />
        </div>
      </section>

      {/* 3 — management */}
      <section id="manage" className="scroll-mt-20 bg-white">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-14 px-5 py-24 md:grid-cols-[1fr_1.15fr] md:px-8">
          <div>
            <ChapterHeading
              n={3}
              title="יודעים איפה עומד כל תיק."
              lead="אחרי השליחה התביעה לא נעלמת. כל תיק עובר משלב לשלב מול העיניים שלך, עד שהתשלום נכנס."
            />
            <Points items={MANAGE_POINTS} />
          </div>
          <DashboardMock />
        </div>
      </section>

      {/* privacy */}
      <section className="border-t border-line">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-14 md:grid-cols-[auto_1fr] md:items-center md:gap-12 md:px-8">
          <h2 className="text-xl font-bold" style={serif}>
            פרטים אישיים, בזהירות
          </h2>
          <p className="max-w-2xl leading-relaxed text-zinc-600">
            לכל לקוח קישור אישי משלו. תעודות, רישיונות ותמונות נשמרים באחסון מאובטח,
            וגישה אליהם יש רק לעסק שמטפל בתביעה — בהתאם לחוק הגנת הפרטיות.
          </p>
        </div>
      </section>

      {/* closing CTA */}
      <section className="bg-ink text-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 text-center md:px-8">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl" style={serif}>
            רוצה לראות את זה על תיק אמיתי?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/70">
            הדגמה קצרה בוואטסאפ או בזום — על תביעה מהשולחן שלך.
          </p>
          <div className="mt-8">
            <DemoButton />
          </div>
        </div>
      </section>

      <footer className="bg-ink text-white/60">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 border-t border-white/10 px-5 py-6 text-sm md:px-8">
          <p>
            <span className="font-semibold text-white">
              Open<span className="text-[#7aa2ff]">Tik</span>
            </span>{" "}
            — ניהול תביעות רכב למוסכים ולסוכני ביטוח
          </p>
          <div className="flex items-center gap-5">
            <span dir="ltr">052-448-8867</span>
            <Link href="/login" className="hover:text-white">
              כניסה למערכת
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
