import type { Template } from "../engine";

// Coordinate map: canonical field -> position on קש חתמים בינלאומיים (KESH, Lloyd's coverholder)
// accident-notice form "הודעה על מקרה ביטוח/נזק" (מהדורה 5/16). Source:
// docs/accidentStatementPdf/קש_טופס_הודעה.pdf — 2 pages, both fillable, text layer present.
//   page 0: header (agent/garage/assessor), א. סוג ביטוח, ב. בעל הפוליסה, ג. הנהג,
//           ד. הרכב, ה. פרטי התאונה
//   page 1: תיאור המקרה, מי אשם, ו. צד ג', ז. נפגעים, ח. עדים, declaration + signature
// Each grid cell has its caption at the top-right; the write-in area is the blank band below.
// `right` = caption's right edge (cell right edge minus ~3pt), `y` = baseline in that band.
// Checkboxes are vector squares (boxdetect.mjs); [x,y] is the X's lower-left, i.e. box centre
// minus ~(3,3.3) at size 9.
//
// SCHEMA GAPS (on the form, no canonical key): insured occupation, fax, work phone (insured and
// driver), driver "drove with insured's permission" / "licence revoked" yes-no, vehicle
// "registered owner" and "pledged to", accident visibility, built-up/open area, speed, third-party
// vehicle make/model/colour/year, third-party driver's own id/phone/address (ThirdParty has one
// id/phone/address — drawn in the owner row), witness relation, damage-spot boxes, "injuries
// exist" yes/no, "why" free text, sub-type boxes in א (הודעה בלבד, נזק עצמי, ...).
const kash: Template = {
  insurer: "קש",
  srcFile: "kash.pdf",
  fields: [
    // ── Page 0 ─────────────────────────────────────────────────────────────
    // Header strip: שם הסוכן | מוסך מתקן | שמאי מטפל (captions y≈700, blank band below)
    { key: "agent_name", right: 556, y: 689, size: 9 },
    { key: "garage.name", right: 376, y: 689, size: 9 },
    { key: "assessor_name", right: 195, y: 689, size: 9 },

    // א. סוג ביטוח — main row (צ"ג = צד ג')
    {
      key: "insurance_type",
      type: "checkbox",
      size: 9,
      options: { comprehensive: [488, 646.7], third_party: [445, 646.7], mandatory: [410, 646.7] },
    },

    // ב. פרטי בעל הפוליסה
    { key: "insured.last_name", right: 558, y: 548, size: 9 },
    { key: "insured.first_name", right: 410, y: 548, size: 9 },
    { key: "insured.id_number", right: 308, y: 548, size: 9 },
    { key: "insured.phone", right: 558, y: 505, size: 9 }, // מספר טלפון בבית
    { key: "insured.mobile", right: 424, y: 505, size: 9 },
    { key: "insured.address_line", right: 558, y: 465, size: 9 },
    { key: "insured.email", right: 268, y: 465, size: 9 },

    // ג. פרטי הנהג ברכב בעת המקרה
    { key: "driver.last_name", right: 560, y: 397, size: 9 },
    { key: "driver.first_name", right: 404, y: 397, size: 9 },
    { key: "driver.id_number", right: 291, y: 397, size: 9 },
    { key: "driver.birth_date", right: 164, y: 397, size: 9 },
    { key: "driver.phone", right: 558, y: 357, size: 9 },
    { key: "driver.mobile", right: 430, y: 357, size: 9 },
    { key: "driver.relation_to_insured", right: 138, y: 357, size: 9 },
    { key: "driver.license_number", right: 558, y: 318, size: 9 },
    { key: "driver.license_type", right: 470, y: 318, size: 9 },
    { key: "driver.license_expiry", right: 394, y: 318, size: 8.5 },
    { key: "driver.license_date", right: 250, y: 318, size: 9 },
    { key: "driver.address_line", right: 558, y: 275, size: 9 },
    { key: "driver.email", right: 270, y: 275, size: 9 },

    // ד. פרטי הרכב
    { key: "vehicle.year", right: 370, y: 202, size: 9 },
    { key: "vehicle.manufacturer", right: 304, y: 202, size: 9 },
    { key: "vehicle.model", right: 258, y: 202, size: 9 },
    { key: "vehicle.plate", right: 147, y: 202, size: 9 },
    // סוג הרכב: פרטי / מסחרי is one shared box; משאית; (גורר/אוטובוס/אחר have no canonical value)
    {
      key: "vehicle.type",
      type: "checkbox",
      size: 9,
      options: { private: [411, 171.7], commercial: [411, 171.7], truck: [334, 171.7] },
    },

    // ה. פרטי התאונה
    { key: "accident.date", right: 560, y: 92, size: 9 },
    { key: "accident.time", right: 468, y: 92, size: 9 },
    { key: "accident.location", right: 407, y: 92, size: 9 },
    { key: "accident.passengers", right: 98, y: 48, size: 9 },
    { key: "accident.police.station", right: 148, y: 48, size: 8.5 },
    { key: "accident.police.log_number", right: 228, y: 48, size: 8.5 },
    {
      key: "accident.police.notified",
      type: "checkbox",
      size: 9,
      options: { yes: [346, 54.7], no: [319, 54.7] },
    },

    // ── Page 1 ─────────────────────────────────────────────────────────────
    // תיאור המקרה — ruled box, 4 lines (last line stays above "במקרה הצורך" caption)
    {
      key: "accident.description",
      page: 1,
      right: 558,
      y: 794,
      size: 9,
      width: 520,
      lineHeight: 11.5,
      maxLines: 4,
    },

    // מי אשם בתאונה? (אני / צ"ג / לא ידוע)
    {
      key: "fault",
      type: "checkbox",
      page: 1,
      size: 9,
      options: { me: [99.5, 603.7], third_party: [177, 588.7], unknown: [135, 588.7] },
    },

    // ו. פרטי הרכבים (צד ג') המעורבים — first vehicle
    { key: "third_parties.0.vehicle_plate", page: 1, right: 156, y: 482, size: 9 },
    {
      key: "third_parties.0.vehicle_type",
      type: "checkbox",
      page: 1,
      size: 9,
      options: { private: [505, 503.7], commercial: [505, 503.7] },
    },
    // owner row
    { key: "third_parties.0.owner_name", page: 1, right: 558, y: 428, size: 9 },
    { key: "third_parties.0.id_number", page: 1, right: 417, y: 428, size: 9 },
    { key: "third_parties.0.address", page: 1, right: 285, y: 428, size: 9 },
    { key: "third_parties.0.phone", page: 1, right: 156, y: 428, size: 9 },
    // driver row (name only — single id/phone/address live in the owner row)
    { key: "third_parties.0.driver_name", page: 1, right: 558, y: 378, size: 9 },
    // insurance row
    { key: "third_parties.0.insurer", page: 1, right: 120, y: 331, size: 8.5 },
    { key: "third_parties.0.agent_name", page: 1, right: 268, y: 331, size: 8.5 },
    { key: "third_parties.0.policy_number", page: 1, right: 413, y: 331, size: 9 },
    {
      key: "third_parties.0.insurance_type",
      type: "checkbox",
      page: 1,
      size: 9,
      options: { comprehensive: [548.5, 342.7], third_party: [505.5, 342.7], mandatory: [449.5, 342.7] },
    },

    // ח. עדים למקרה (2 rows)
    { key: "witnesses.0.name", page: 1, right: 558, y: 247, size: 9 },
    { key: "witnesses.0.address", page: 1, right: 397, y: 247, size: 9 },
    { key: "witnesses.0.phone", page: 1, right: 241, y: 247, size: 9 },
    { key: "witnesses.1.name", page: 1, right: 558, y: 228, size: 9 },
    { key: "witnesses.1.address", page: 1, right: 397, y: 228, size: 9 },
    { key: "witnesses.1.phone", page: 1, right: 241, y: 228, size: 9 },

    // Declaration block: תאריך | שם | מספר זהות / מספר תאגיד | חתימה (left blank)
    { key: "declarations.date", page: 1, right: 558, y: 90, size: 9 },
    { key: "declarations.signatory_name", page: 1, right: 452, y: 90, size: 9 },
    { key: "insured.id_number", page: 1, right: 338, y: 90, size: 9 },
  ],
};
export default kash;
