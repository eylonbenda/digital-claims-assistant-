import { toILDate } from "@/lib/dates";
import type { SubmissionClaim } from "./compose";

// Deterministic Hebrew cover note (wa.ts style — no LLM in the send loop).
export function buildBody(c: SubmissionClaim, attachmentLabels: string[]): string {
  const date = c.eventDate ? toILDate(c.eventDate) : "לא ידוע";
  const who = c.agencyName || "משרדנו";
  const lines: string[] = ["שלום רב,", ""];

  if (c.claimType === "own_policy") {
    lines.push(
      `מצורפת הודעה על תאונה מיום ${date} ברכב ${c.ourPlate ?? ""}, על שם ${c.clientName ?? ""}.`.replace(/\s+/g, " ").trim(),
    );
    lines.push("נבקש לפתוח תביעה ולעדכן אותנו במספר התביעה ובהמשך הטיפול.");
  } else if (c.claimType === "third_party_settlement") {
    lines.push(
      `בהמשך לאירוע מיום ${date} בו היה מעורב רכב מבוטחכם ${c.tpPlate ?? ""}, נבקש אישור הסדר לתיקון רכב ${c.ourPlate ?? ""} על שם ${c.clientName ?? ""}.`.replace(/\s+/g, " ").trim(),
    );
  } else {
    lines.push(
      `בהמשך לאירוע מיום ${date} בו היה מעורב רכב מבוטחכם ${c.tpPlate ?? ""}, מצורפת דרישתנו לפיצוי בגין הנזק לרכב ${c.ourPlate ?? ""} על שם ${c.clientName ?? ""}.`.replace(/\s+/g, " ").trim(),
    );
    lines.push("נבקש אישור קבלה, מספר תביעה ועדכון על המשך הטיפול.");
  }

  if (attachmentLabels.length) {
    lines.push("", "המסמכים המצורפים:");
    for (const label of attachmentLabels) lines.push(`- ${label}`);
  }

  lines.push("", "בברכה,", who);
  return lines.join("\n");
}
