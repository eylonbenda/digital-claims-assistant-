// The dashboard's language layer: system vocabulary in, agent Hebrew out.
// Every user-visible string on the main screen comes from here (spec §5).

const DAY_MS = 86_400_000;
const TZ = "Asia/Jerusalem";

function israelHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TZ }).format(now),
  );
}

export function greeting(now: Date): string {
  const h = israelHour(now);
  if (h >= 5 && h < 12) return "בוקר טוב";
  if (h >= 12 && h < 17) return "צהריים טובים";
  if (h >= 17 && h < 22) return "ערב טוב";
  return "לילה טוב";
}

export function hebDate(now: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    weekday: "long", day: "numeric", month: "long", timeZone: TZ,
  }).format(now);
}

export const TRACK_LABEL: Record<string, string> = {
  own_policy: "פוליסת הלקוח",
  third_party_report: "צד ג׳ — דוח",
  third_party_settlement: "צד ג׳ — הסדר",
  unknown: "טרם סווג",
};

// Hebrew list join: "א", "א וב", "א, ב וג"
export function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ו${items[items.length - 1]}`;
}

function reminderTail(lastSentAt: string | null, now: Date): string {
  if (!lastSentAt) return "טרם נשלחה תזכורת";
  const days = Math.max(0, Math.floor((now.getTime() - new Date(lastSentAt).getTime()) / DAY_MS));
  if (days === 0) return "תזכורת נשלחה היום";
  if (days === 1) return "תזכורת אחרונה אתמול";
  return `תזכורת אחרונה לפני ${days} ימים`;
}

export function sendActionLine(
  opts: { taskKey: string; docLabels: string[]; lastSentAt: string | null },
  now: Date,
): string {
  const head =
    opts.taskKey === "finish_wizard"
      ? "הלקוח לא סיים למלא את הטופס"
      : opts.taskKey === "get_tp_insurer"
      ? "מחכים לפרטי המבטח של הצד השני מהלקוח"
      : opts.docLabels.length
        ? `מחכים ל${joinHe(opts.docLabels)} מהלקוח`
        : "מחכים למסמכים מהלקוח";
  return `${head} · ${reminderTail(opts.lastSentAt, now)}`;
}

function overdueClause(overdueDays: number): string {
  if (overdueDays === 0) return "";
  return overdueDays === 1 ? " · באיחור יום אחד" : ` · באיחור ${overdueDays} ימים`;
}

export function doActionLine(title: string, overdueDays: number): string {
  return `תורך: ${title}${overdueClause(overdueDays)}`;
}

export function alsoLine(title: string, overdueDays: number): string {
  const clause = overdueDays === 0 ? "" : overdueDays === 1 ? " (באיחור יום אחד)" : ` (באיחור ${overdueDays} ימים)`;
  return `וגם: ${title}${clause}`;
}

export function unclassifiedLine(daysOpen: number): string {
  return daysOpen === 1
    ? "התיק מחכה לסיווג מסלול כבר יום אחד"
    : `התיק מחכה לסיווג מסלול כבר ${daysOpen} יום`;
}

export function waitingLine(next: { title: string; due_at: string | null } | null): string {
  if (!next) return "אין פעולות פתוחות";
  const due = next.due_at
    ? ` · עד ${new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", timeZone: TZ }).format(new Date(next.due_at))}`
    : "";
  return `במעקב: ${next.title}${due}`;
}

export const WAITING_NOTE = "תקין — המערכת תזכיר כשיגיע הזמן לפעול";
export const ALL_DONE_NOTE = "הכל טופל להיום ✅";
// Where an unsubmitted claimant stopped — keyed by the wizard's StepKey
// (components/collection/steps.ts). The four tap questions read as one stage.
const STEP_LABEL: Record<string, string> = {
  intro: "מסך הפתיחה",
  injuries: "השאלות המהירות",
  driver_who: "השאלות המהירות",
  fault: "השאלות המהירות",
  tp_present: "השאלות המהירות",
  vehicle: "פרטי הרכב",
  insured: "פרטי המבוטח",
  driver_details: "פרטי הנהג",
  tp_details: "פרטי הצד השני",
  when_where: "מועד ומקום התאונה",
  description: "תיאור התאונה",
  documents: "העלאת המסמכים",
  summary: "הסיכום והשליחה",
};

function agoHe(iso: string, now: Date): string {
  const days = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS));
  if (days === 0) return "היום";
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}

export type DraftLite = { max_step_key?: unknown; saved_at?: unknown } | null | undefined;

// The card line for a claim the client hasn't submitted yet. The server draft is
// only written after consent, so "no draft" covers both a link never opened and
// one abandoned on the opening screen.
export function pendingClientLine(draft: DraftLite, createdAt: string, now: Date): string {
  const savedAt = typeof draft?.saved_at === "string" ? draft.saved_at : null;
  if (!savedAt) return `הלקוח עוד לא התחיל למלא · הקישור נוצר ${agoHe(createdAt, now)}`;
  const step = typeof draft?.max_step_key === "string" ? STEP_LABEL[draft.max_step_key] : undefined;
  const where = step ? `הגיע עד ${step}` : "התחיל למלא";
  return `הלקוח ${where} ולא סיים · פעילות אחרונה ${agoHe(savedAt, now)}`;
}
