// The cockpit's language layer: system vocabulary in, agent Hebrew out.
// Mirrors lib/dashboard/copy.ts (spec §6) and reuses its idioms.
import { doActionLine, joinHe } from "@/lib/dashboard/copy";

export const CLASSIFY_LINE = "התיק מחכה לאישור מסלול";

export function chaseLine(labels: string[]): string {
  if (!labels.length) return "חסרים מסמכים חוסמים להגשה";
  return `מחכים ל${joinHe(labels)} מהלקוח/ה`;
}

export function taskLine(title: string, overdueDays: number): string {
  return doActionLine(title, overdueDays);
}

export function formFieldsLine(n: number): string {
  return n === 1 ? "נותר שדה חסר אחד בטופס" : `נותרו ${n} שדות חסרים בטופס`;
}

export function formReadyLine(insurerLabel: string | null): string {
  return insurerLabel ? `הטופס מוכן להורדה — ${insurerLabel}` : "הטופס מוכן להורדה";
}

export const FILL_FORM_LINE = "הנתונים מלאים — מלא את טופס ההודעה";

export function milestoneLine(label: string): string {
  return `השלב הבא: ${label}`;
}

export const NO_ACTION_LINE = "אין פעולות פתוחות — התיק במעקב";
