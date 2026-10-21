import { toILDate } from "@/lib/dates";
import type { SubmissionClaim } from "./compose";

const UNKNOWN = "לא ידוע";

// Deterministic subject line. The trailing short id is the correlation key a
// future inbound-email phase will match replies on; harmless to a human today.
export function buildSubject(c: SubmissionClaim): string {
  const date = c.eventDate ? toILDate(c.eventDate) : UNKNOWN;
  const ours = c.ourPlate || UNKNOWN;
  const theirs = c.tpPlate || UNKNOWN;
  const shortId = c.id.slice(0, 8);
  switch (c.claimType) {
    case "own_policy":
      return `הודעה על תאונה — פוליסה — אירוע מיום ${date} — רכב ${ours} — ${shortId}`;
    case "third_party_settlement":
      return `בקשת הסדר — אירוע מיום ${date} — מבוטחכם ${theirs} — ${shortId}`;
    default:
      return `תביעת נזקי רכוש — אירוע מיום ${date} — מבוטחכם ${theirs} — נפגע ${ours} — ${shortId}`;
  }
}
