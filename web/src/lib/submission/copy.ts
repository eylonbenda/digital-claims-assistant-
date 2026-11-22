// Panel strings for the prepare-and-confirm submission screen.
export const SUBMISSION_COPY = {
  title: "שליחה למבטחת",
  subtitle:
    "המערכת הכינה את המייל — שלחו אותו מתיבת הדואר שלכם (העתק-הדבק), ואז סמנו כנשלח.",
  insurerLabel: "מבטחת היעד",
  insurerPlaceholder: "בחרו מבטחת",
  recipientLabel: "נמען",
  recipientManualHint: "אין כתובת מאומתת למבטחת זו — הזינו את כתובת מחלקת התביעות ידנית",
  insurerSaveFailed: "שמירת המבטחת נכשלה — נסו שוב",
  subjectLabel: "נושא (אל תשנו — מקשר תשובות לתביעה)",
  bodyLabel: "גוף ההודעה",
  attachmentsLabel: "קבצים לצירוף",
  copy: "העתקה",
  copied: "הועתק ✓",
  confirm: "סומן כנשלח",
  confirmAsk: "המייל נשלח מהתיבה שלכם?",
  confirmYes: "כן — סמן כנשלח",
  confirmNo: "עדיין לא",
  sentToast: "התביעה סומנה כנשלחה",
  invalidRecipient: "כתובת הנמען אינה תקינה",
  // Shown while blocking documents are still missing. Sending stays possible — the
  // handler may know the insurer accepts a partial file — but never by accident.
  missingTitle: "התיק עדיין לא מוכן לשליחה — חסרים מסמכים חוסמים:",
  missingAsk: "לשלוח בלי המסמכים החסרים?",
  confirmYesAnyway: "כן — סמן כנשלח בכל זאת",
  sendAnyway: "שליחה בכל זאת",
  demandLabel: "סכום הדרישה (₪) — רשות",
  demandHint: "משמש את עמוד הסקירה. אפשר להשלים גם אחר כך מעמוד התיק.",
} as const;
