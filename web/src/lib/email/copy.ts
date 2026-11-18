// Every user-visible string of the email feature.
export const EMAIL_COPY = {
  inboxTitle: "דואר נכנס",
  inboxSubtitle: "מיילים שהגיעו ולא שויכו לתיק. שיוך לתיק מעביר את המייל להתכתבות של אותו תיק.",
  inboxEmpty: "כל המיילים משויכים לתיקים.",
  assign: "שיוך לתיק",
  assignSearch: "חיפוש לפי שם לקוח או לוחית",
  assignNoResults: "לא נמצא תיק מתאים",
  assignFailed: "השיוך נכשל — נסו שוב",
  correspondenceTitle: "התכתבות",
  attachmentsDropped: "הקבצים המצורפים גדולים מדי ולא נשמרו",
  noBody: "אין תוכן טקסט במייל",
  noSubject: "(ללא נושא)",
  showMore: "הצגת המייל המלא",
  sentByUs: "נשלח מהמערכת",
  to: "אל",
  deliveryFailed: "המייל חזר — לא נמסר",
  newEmailBadge: "מייל חדש",
  linkUnavailable: "קישור לא זמין",

  sendButton: "שליחה למבטחת",
  confirmTitle: "לשלוח את התיק למבטחת?",
  confirmTo: "אל",
  confirmCc: "העתק",
  confirmFrom: "מאת",
  confirmSubject: "נושא",
  confirmAttachments: "קבצים מצורפים",
  confirmNoCc: "לא הוגדרה כתובת להעתק",
  confirmYes: "שליחה",
  confirmNo: "ביטול",
  sending: "שולח…",
  sentDone: "התיק נשלח למבטחת",
  sendFailed: "השליחה נכשלה — המייל לא נשלח. נסו שוב",
  sentNotRecorded: "המייל נשלח, אך הסימון בתיק נכשל — סמנו כנשלח תחת ״שליחה ידנית״",
  attachmentMissing: "אחד הקבצים לא נמצא באחסון — המייל לא נשלח",
  manualTitle: "שליחה ידנית",

  setupTitle: "מייל",
  setupHint: "שליחה למבטחות מתוך המערכת, וקבלת התשובות שלהן לתיק.",
  setupAddress: "כתובת המערכת של העסק",
  setupAddressHint: "מכתובת זו נשלחים המיילים למבטחות, ואליה מגיעות התשובות.",
  setupMailbox: "תיבת התביעות של העסק",
  setupMailboxHint: "מקבלת העתק של כל מייל שנשלח למבטחת ושל כל מייל שמתקבל.",
  setupSave: "שמירה",
  setupSaved: "נשמר",
  setupSaveFailed: "השמירה נכשלה — נסו שוב",
  setupLast: "מייל אחרון שהתקבל",
  setupNoMail: "עדיין לא התקבל מייל",
  setupCopy: "העתקה",
  setupCopied: "הועתק",
  setupForwardTitle: "העברת מיילים ממבטחות שמגיעים ישירות לתיבה שלכם (Microsoft 365)",
  setupSteps: [
    "אנחנו מגדירים לעסק את כתובת המערכת ומאשרים איתכם את תיבת התביעות.",
    "מנהל ה-365 שלכם מאפשר העברה אוטומטית חיצונית לתיבת התביעות (מדיניות דואר יוצא מותאמת, למשתמש הזה בלבד).",
    "בתיבת התביעות יוצרים כלל דואר נכנס: כתובת השולח כוללת אחד מהדומיינים של המבטחות ← ״ניתוב מחדש״ (Redirect) לכתובת המערכת.",
    "בדיקה: מייל מכתובת שבכלל אמור להופיע כאן. אם לא הגיע, חפשו הודעת אי-מסירה עם הקוד 5.7.520 — היא אומרת ששלב 2 עוד לא בתוקף.",
  ],
  setupDomains: "דומיינים של מבטחות לכלל",
  setupDomainsEmpty: "רשימת הדומיינים תתווסף",
} as const;

const DAY_MS = 86_400_000;

/** "היום 14:05" / "אתמול 09:30" / "12.11.2026" — Israel time. */
export function emailTime(iso: string, now: Date): string {
  const tz = "Asia/Jerusalem";
  const day = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const at = new Date(iso);
  const time = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(at);
  if (day(at) === day(now)) return `היום ${time}`;
  if (day(at) === day(new Date(now.getTime() - DAY_MS))) return `אתמול ${time}`;
  return new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "numeric", year: "numeric", timeZone: tz }).format(at);
}
