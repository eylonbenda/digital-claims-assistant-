import type { Template } from "../engine";

// Coordinate map: canonical field -> position on ביטוח חקלאי "הודעה ותביעה על תאונה לרכב או
// למכונה חקלאית ולנפגעי גוף" (form 080-300-01, 11.2015). Source:
// docs/accidentStatementPdf/חקלאי_טופס_הודעה.pdf — 1 page, text layer present.
// Sections: א. הרכב המבוטח (3 rows), ב. הנהג, ג. אישור אי-הגשת תביעה, ד. פרטי התאונה,
// ה. התנגשות עם רכב אחר, תיאור המקרה, עדים + משטרה, ו. נפגעים (3 rows), declarations.
// Each cell has its caption at the top-right; `right` = caption's right edge, `y` = baseline in
// the blank band below. Choice marks are ❍ glyph circles (circle sits to the RIGHT of its
// label); [x,y] is the X's lower-left = glyph (x+1.5, y+0.2) at size 9.
//
// SCHEMA GAPS (on the form, no canonical key): chassis/engine number, agent phone / mobile,
// "אישור אי-הגשת תביעה" request + mailing address, accident year (date covers it), cargo type and
// quantity, licence-revoked yes/no, photos-at-scene yes/no, traffic sign / signal colour (insured
// and third party), third-party vehicle make/model/year, third-party driver's own id/phone/
// address, diagram "תרשים המקום והאירוע", per-injured: NI claim filed / work accident / status
// (שכיר-עצמאי) circles, "אני מבקש להעביר אליי את דוח השמאי" yes.
const haklai: Template = {
  insurer: "חקלאי",
  srcFile: "haklai.pdf",
  fields: [
    // ── א. פרטים על הרכב המבוטח ───────────────────────────────────────────
    { key: "insured.full_name", right: 538, y: 708, size: 9 },
    { key: "insured.id_number", right: 435, y: 708, size: 9 },
    { key: "insured.city", right: 333, y: 708, size: 9 }, // the wizard collects city only — address_line is never set
    { key: "insured.phone", right: 203, y: 708, size: 9 },
    { key: "insured.mobile", right: 115, y: 708, size: 9 },

    { key: "insured.email", right: 538, y: 687, size: 9 },
    { key: "vehicle.plate", right: 333, y: 687, size: 9 },
    { key: "vehicle.type", right: 180, y: 687, size: 8 },
    { key: "vehicle.year", right: 114, y: 687, size: 8.5 },
    { key: "vehicle.manufacturer", right: 85, y: 687, size: 6.5 },
    { key: "vehicle.model", right: 60, y: 687, size: 6.5 },

    { key: "policy_number", right: 538, y: 666, size: 9 },
    { key: "agent_name", right: 435, y: 666, size: 9 },

    // ── ב. פרטים על הנהג ברכב המבוטח בעת התאונה ──────────────────────────
    { key: "driver.full_name", right: 538, y: 632, size: 9 },
    { key: "driver.id_number", right: 404, y: 632, size: 9 },
    { key: "driver.birth_date", right: 308, y: 632, size: 9 },
    { key: "driver.phone", right: 246, y: 632, size: 9 },
    { key: "driver.mobile", right: 135, y: 632, size: 9 },

    { key: "driver.address_line", right: 538, y: 611, size: 9 },
    { key: "driver.email", right: 405, y: 611, size: 9 },
    { key: "driver.license_number", right: 246, y: 611, size: 9 },
    { key: "driver.license_type", right: 189, y: 611, size: 8.5 },
    { key: "driver.license_date", right: 155, y: 611, size: 8 },
    // התאונה אירעה באשמתך (כן / לא)
    {
      key: "fault",
      type: "checkbox",
      size: 9,
      options: { me: [81.5, 609.2], third_party: [55.5, 609.2] },
    },

    // ── ד. פרטים על התאונה ────────────────────────────────────────────────
    { key: "accident.date", right: 538, y: 541, size: 9 },
    { key: "accident.location", right: 415, y: 541, size: 9 },
    // damage to insured vehicle (2 underscore lines) | damage to third-party vehicle
    {
      key: "damage.insured_vehicle",
      right: 323,
      y: 540.5,
      size: 8.5,
      width: 141,
      lineHeight: 18,
      maxLines: 2,
    },
    {
      key: "damage.third_party_vehicle",
      right: 173,
      y: 540.5,
      size: 8.5,
      width: 141,
      lineHeight: 18,
      maxLines: 2,
    },

    // ── ה. התנגשות עם רכב אחר — first vehicle ─────────────────────────────
    { key: "third_parties.0.owner_name", right: 537, y: 462, size: 9 },
    { key: "third_parties.0.id_number", right: 443, y: 462, size: 9 },
    { key: "third_parties.0.phone", right: 350, y: 462, size: 9 },
    { key: "third_parties.0.address", right: 265, y: 462, size: 8.5 },
    { key: "third_parties.0.agent_name", right: 108, y: 462, size: 8.5 },
    { key: "third_parties.0.vehicle_plate", right: 537, y: 441, size: 9 },
    { key: "third_parties.0.insurer", right: 303, y: 441, size: 8.5 },
    { key: "third_parties.0.policy_number", right: 204, y: 441, size: 9 },
    { key: "third_parties.0.driver_name", right: 537, y: 421, size: 9 },

    // תיאור מלא של המקרה — 4 underscore lines
    {
      key: "accident.description",
      right: 535,
      y: 391,
      size: 9,
      width: 296,
      lineHeight: 18.3,
      maxLines: 4,
    },

    // האם ניתנה הודעה במשטרה (כן / לא) + תחנה + מספר תיק/יומן
    {
      key: "accident.police.notified",
      type: "checkbox",
      size: 9,
      options: { yes: [398.5, 314.2], no: [424.5, 314.2] },
    },
    { key: "accident.police.station", right: 480, y: 301, size: 8.5 },
    { key: "accident.police.log_number", right: 487, y: 283, size: 8.5 },

    // פרטי העדים (2 rows)
    { key: "witnesses.0.name", right: 328, y: 303, size: 8.5 },
    { key: "witnesses.0.address", right: 236, y: 303, size: 8.5 },
    { key: "witnesses.0.phone", right: 104, y: 303, size: 8.5 },
    { key: "witnesses.1.name", right: 328, y: 282, size: 8.5 },
    { key: "witnesses.1.address", right: 236, y: 282, size: 8.5 },
    { key: "witnesses.1.phone", right: 104, y: 282, size: 8.5 },

    // ── ו. נפגעים בכלי הרכב המבוטח (3 rows) ───────────────────────────────
    { key: "injured_persons.0.name", right: 536, y: 236, size: 9 },
    { key: "injured_persons.0.id_number", right: 444, y: 236, size: 9 },
    { key: "injured_persons.0.address", right: 361, y: 236, size: 8.5 },
    { key: "injured_persons.0.age", right: 233, y: 236, size: 9 },
    { key: "injured_persons.0.injury_nature", right: 462, y: 223.5, size: 8.5, width: 400 },
    { key: "injured_persons.1.name", right: 536, y: 199, size: 9 },
    { key: "injured_persons.1.id_number", right: 444, y: 199, size: 9 },
    { key: "injured_persons.1.address", right: 361, y: 199, size: 8.5 },
    { key: "injured_persons.1.age", right: 233, y: 199, size: 9 },
    { key: "injured_persons.1.injury_nature", right: 462, y: 186.5, size: 8.5, width: 400 },
    { key: "injured_persons.2.name", right: 536, y: 163, size: 9 },
    { key: "injured_persons.2.id_number", right: 444, y: 163, size: 9 },
    { key: "injured_persons.2.address", right: 361, y: 163, size: 8.5 },
    { key: "injured_persons.2.age", right: 233, y: 163, size: 9 },
    { key: "injured_persons.2.injury_nature", right: 462, y: 149.5, size: 8.5, width: 400 },

    // ── Declarations ─────────────────────────────────────────────────────
    // אני מאשר מסירת מידע ממאגרי משרד התחבורה (כן / לא)
    {
      key: "declarations.data_consent",
      type: "checkbox",
      size: 9,
      options: { yes: [508.5, 101.2], no: [485.5, 101.2] },
    },
    // אני מעונין שתביעת צד שלישי תשולם על-ידי החברה — סעיף 68 (כן / לא)
    {
      key: "declarations.poa_third_party",
      type: "checkbox",
      size: 9,
      options: { yes: [509.5, 67.2], no: [486.5, 67.2] },
    },
    // תאריך (signature left blank)
    { key: "declarations.date", right: 216, y: 31, size: 9 },
  ],
};
export default haklai;
