import type { OpenStage, WaitingBand } from "./compute";

export const OVERVIEW_COPY = {
  subtitle: "מצב התיקים, מה מחכה אצל המבטחות וכמה זמן לוקח כל שלב.",
  stagesTitle: "מצב התיקים",
  stagesHint: "לחיצה על שלב פותחת את רשימת התיקים שלו.",
  waitingTitle: "מחכים למבטחת",
  waitingHint: "תיקים שנשלחו ועדיין לא שולמו, לפי מספר הימים מאז השליחה.",
  waitingEmpty: "אין כרגע תיקים שמחכים למבטחת.",
  oldestTitle: "הוותיקים ביותר",
  unknownSince: (n: number) =>
    n === 1 ? "לתיק אחד אין תאריך שליחה רשום" : `ל-${n} תיקים אין תאריך שליחה רשום`,
  cycleTitle: "כמה זמן לוקח",
  cycleHint: "חציון בימים. מוצג רק כשיש לפחות 3 תיקים שעברו את השלב.",
  notEnough: "אין מספיק נתונים",
  recentTitle: "30 הימים האחרונים",
  recentHint: "מול 30 הימים שקדמו להם.",
  opened: "תיקים שנפתחו",
  closed: "תיקים שנסגרו",
  paid: "תשלומים שהתקבלו",
  collectionTitle: "איסוף מהלקוח",
  collectionHint: "קישורים שנשלחו ב-90 הימים האחרונים.",
  collectionNone: "לא נשלחו קישורים ב-90 הימים האחרונים.",
  amountsOff: "הסכומים עדיין לא זמינים בסביבה הזו. שאר הנתונים מוצגים כרגיל.",
  noAmounts: "לא הוזנו סכומים",
  late: "מעל 30 יום",
  waitingTotal: "סה״כ מחכה אצל המבטחות:",
  legendCurrent: "30 הימים האחרונים",
  legendPrevious: "30 הימים שקדמו",
  days: (n: number) => (n === 0 ? "פחות מיום" : n === 1 ? "יום אחד" : `${n} ימים`),
  previous: (n: number | string) => `קודם: ${n}`,
  of: (a: number, b: number) => `${a} מתוך ${b}`,
} as const;

export const BAND_LABEL: Record<WaitingBand, string> = {
  d0_14: "עד 14 יום",
  d15_30: "15–30 יום",
  d31_45: "31–45 יום",
  d46_plus: "מעל 45 יום",
};

export const CYCLE_LABEL = {
  collect: "מפתיחת התיק עד שהלקוח סיים",
  prepare: "מסיום הלקוח עד שליחה למבטחת",
  payment: "משליחה למבטחת עד תשלום",
} as const;

// Names for the cycle bar's tooltips, where the full labels are too long.
export const CYCLE_SHORT = {
  collect: "איסוף מהלקוח",
  prepare: "הכנה ושליחה",
  payment: "המתנה לתשלום",
} as const;

export type { OpenStage };
