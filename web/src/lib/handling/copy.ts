import type { HandlingStatus } from "./types";

export const HANDLING_LABEL: Record<HandlingStatus, string> = {
  sent: "נשלחה למבטחת",
  docs_requested: "המבטחת ביקשה השלמות",
  approved_awaiting_payment: "אושרה — ממתין לתשלום",
  partial_paid: "תשלום חלקי",
  paid: "שולמה",
  rejected: "נדחתה",
  appeal: "ערעור",
  legal: "טיפול משפטי",
};

// Hebrew errors naming the missing requirement, keyed by target status.
export const REQUIREMENT_ERROR: Partial<Record<HandlingStatus, string>> = {
  paid: "לא ניתן לסמן כשולמה בלי הודעת תשלום בתיק — העלו אותה קודם",
  partial_paid: "לא ניתן לסמן תשלום חלקי בלי הודעת תשלום בתיק — העלו אותה קודם",
  rejected: "לא ניתן לסמן כנדחתה בלי מכתב הדחייה בתיק — העלו אותו קודם",
  docs_requested: "יש לציין מה המבטחת ביקשה להשלים",
  appeal: "יש לפרט את סיבת הערעור",
  legal: "יש להזין את פרטי עורך הדין (שם + טלפון או אימייל)",
};

export const SYSTEM_MILESTONE_HINT =
  "אבן דרך זו מתעדכנת אוטומטית — דרך מסך השליחה או עדכון הסטטוס";
