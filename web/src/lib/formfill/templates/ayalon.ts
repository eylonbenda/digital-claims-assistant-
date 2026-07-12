import type { Template } from "../engine";

// Coordinate map: canonical field -> position on איילון (Ayalon) — הודעה על תאונת דרכים.
// REWRITTEN 2026-07-11 for the insurer's NEW official form (docs/accidentStatementPdf/
// איילון_טופס_הודעה_חדש.pdf, bundled as assets/ayalon.pdf). The old template mapped a
// SCANNED/image-only PDF (different layout) — those coordinates are entirely obsolete and
// have been discarded.
//
// This new PDF has a clean extractable text layer. Coordinates were measured from printed-
// label glyph positions via .pdfwork/coords.mjs and checkbox circle rectangles via
// .pdfwork/boxdetect2.mjs (CTM-aware; boxdetect.mjs's raw coords ignore the page's transform
// stack and are unreliable on this file — every checkbox below uses boxdetect2 output),
// verified visually against .pdfwork/render.mjs crops. Page size 595x842pt (1 page,
// portrait). Each label row is ~19-24pt tall with the printed label sitting at the TOP of the
// cell — data is written a few points BELOW the label's own baseline, not on it.
//
// Table quirk worth documenting: "פרטי רכבים מעורבים - צד ג'" (third-party vehicles) is a
// compact 2-line-per-party block with NO separate blank data line under each label row —
// the printed label sits at the top of each ~19pt row band and the value is written directly
// below it inside the same cell.
//
// SCHEMA GAPS (present on form, left unmapped — no canonical key fits):
//  - Top-strip claim-type radio: "אי הגשה / נזק לצד ג' בלבד / נזק עצמי וגם נזק לצד ג' /
//    נזק עצמי" — doesn't line up with ClaimData.claim_type's enum (own_policy/
//    third_party_report/third_party_settlement/unknown); left unmapped to avoid a wrong fit.
//  - "מס' בקשה לתשלום תגמולי ביטוח" (claim/request reference number, top-right header) — no
//    canonical key.
//  - "עוסק מורשה? כן/לא" (insured VAT-registered business) — no canonical key.
//  - "מס' פקס" (insured fax) / "מס' טלפון סוכן הביטוח" (agent phone) — no canonical key.
//  - "האם נהג ברשות המבוטח?" (driving with owner's permission, boolean) — no canonical key.
//  - "רישיון נהיגה בתוקף? כן/לא" (license currently valid, boolean) — no canonical key
//    (ClaimData has license_expiry as a date, not on this form).
//  - "מהו התמרור/רמזור המוצב בדרך המבוטח/בדרכו של צד ג'?" (road sign) x2 — no canonical key.
//  - "איזורי הפגיעה" impact-point diagrams (insured + TP vehicle silhouettes) x2 — no
//    canonical key (visual diagram, not text).
//  - "תיאור הנזקים ברכב צד ג'" — no canonical key (this form's damage section is a single
//    diagram box, not two separate text descriptions like older insurer forms; ClaimData's
//    damage.third_party_vehicle has no matching printed cell here — left unmapped since the
//    only nearby free space is the diagram legend, not a data-entry blank).
//  - "מי אשם בתאונה? ... נמק מדוע ___" free-text justification line — fault enum itself IS
//    mapped (checkbox below); the "נמק מדוע" blank has no canonical key.
//  - third_parties[].damage_description — no damage column in the TP vehicles table on this
//    form.
//  - injured_persons[].hospital ("כן, היכן" — hospital name) — the "היכן" answer has no
//    distinct blank cell separate from the checkbox itself; left unmapped.
//  - injured_persons[].age — no age column on this form (only תאריך לידה birth date, which
//    isn't in InjuredPerson either); no canonical key.
//  - "האם קרתה התאונה בדרך לעבודה או ממנה? כן / לא" (per injured person) — plain text "כן /
//    לא" with no distinguishable checkbox circle per value; left unmapped.
//  - "אני מבקש למנות שמאי באופן אקראי..." (random assessor assignment, boolean) — no
//    canonical key (distinct from garage.is_arrangement).
//  - "אני מאשר לאיילון לפצות את תובע צד ג'... (סעיף 68)" — this IS declarations.poa_third_party
//    (mapped below).
//  - Bottom delivery-method checkboxes (מסרון / דואר אלקטרוני / דואר) — no canonical key.
//  - declarations.data_consent — no dedicated checkbox found on this form (only the poa/סעיף
//    68 one, and the general "הריני מצהיר..." attestation which has no checkbox, just a
//    signature line already covered by declarations.signatory_name/date).
//  - bank_account.account_number cell is labeled "מס' חשבון" (mapped); bank/branch NAME
//    cells (שם הבנק / שם הסניף) are mapped to bank_account.bank/branch — the numeric "מס'
//    בנק"/"מס' סניף" cells have no separate canonical field and are left blank.
const ayalon: Template = {
  insurer: "איילון",
  srcFile: "ayalon.pdf",
  fields: [
    // ── Header ───────────────────────────────────────────────────────────────
    { key: "agent_name", right: 405, y: 753, size: 8 },

    // ── פרטי המבוטח והפוליסה (insured + policy) ─────────────────────────────
    { key: "insured.full_name", right: 562, y: 713, size: 9 },
    { key: "insured.id_number", right: 361, y: 713, size: 8 },
    { key: "insured.address_line", right: 244, y: 713, size: 7.5 },
    // "תאריך לידה" — value sits on the "__/__/__" template line (underscores at y:713)
    { key: "insured.birth_date", right: 101, y: 715, size: 6.5 },

    { key: "insured.email", right: 130, y: 690, size: 7 },
    { key: "insured.mobile", right: 407, y: 690, size: 8 },

    { key: "agent_name", right: 471, y: 668, size: 7.5 },
    { key: "policy_number", right: 230, y: 668, size: 7.5 },
    {
      key: "insurance_type",
      type: "checkbox",
      options: { mandatory: [75, 668], third_party: [103, 668], comprehensive: [137, 668] },
      size: 6,
    },

    // ── פרטי הרכב (vehicle) ─────────────────────────────────────────────────
    { key: "vehicle.plate", right: 561, y: 645, size: 8 },
    { key: "vehicle.manufacturer", right: 485, y: 645, size: 6.5 },
    { key: "vehicle.model", right: 400, y: 645, size: 6.5 },
    { key: "vehicle.year", right: 177, y: 645, size: 7 },
    {
      key: "vehicle.type",
      type: "checkbox",
      options: {
        private: [318, 646],
        commercial: [286, 646],
        truck: [249, 646],
        tractor: [249, 646],
        scooter: [249, 646],
        motorcycle: [249, 646],
      },
      size: 6,
    },

    // ── פרטי הנהג (driver) ──────────────────────────────────────────────────
    { key: "driver.full_name", right: 492, y: 623, size: 8 },
    { key: "driver.id_number", right: 361, y: 623, size: 7.5 },
    // "הקשר לבעל הרכב" cell (label x=213–265 at y=633; value written below it)
    { key: "driver.relation_to_insured", right: 262, y: 623, size: 6.5 },
    { key: "driver.address_line", right: 175, y: 623, size: 6.5 },

    // line-2 labels sit at y=611; values centred under each (phone cell x≈445–520,
    // birthdate template x=376–444). mobile was anchored left of its label — recentred.
    { key: "driver.mobile", right: 515, y: 602, size: 6.5 },
    { key: "driver.birth_date", right: 423, y: 603, size: 6 },
    { key: "driver.license_type", right: 338, y: 602, size: 6.5 },
    { key: "driver.license_number", right: 281, y: 602, size: 6.5 },
    {
      key: "driver.license_origin",
      type: "checkbox",
      options: { israeli: [175, 603], foreign: [140, 603] },
      size: 6,
    },

    // ── פרטי האירוע (accident) ───────────────────────────────────────────────
    { key: "accident.date", right: 476, y: 578, size: 7.5 },
    { key: "accident.time", right: 393, y: 578, size: 7.5 },
    { key: "accident.location", right: 306, y: 578, size: 6 },
    {
      key: "accident.police.notified",
      type: "checkbox",
      options: { yes: [179, 580], no: [154, 580] },
      size: 6,
    },
    { key: "accident.police.station", right: 82, y: 578, size: 6 },

    // תיאור האירוע: — large blank box, right column of the diagram row
    { key: "accident.description", right: 558, y: 535, size: 8 },

    // מי אשם בתאונה? — אני / צד ג' / לא יודע
    {
      key: "fault",
      type: "checkbox",
      options: { me: [502, 333], third_party: [477, 333], unknown: [447, 333] },
      size: 6,
    },

    // ── פרטי רכבים מעורבים - צד ג' (third parties) — row 1 ───────────────────
    // Header/label line (y=417) carries the value directly below the label inside the cell.
    { key: "third_parties.0.vehicle_plate", right: 561, y: 407, size: 6.5 },
    { key: "third_parties.0.vehicle_type", right: 397, y: 407, size: 6 },
    { key: "third_parties.0.insurer", right: 327, y: 407, size: 6 },
    { key: "third_parties.0.policy_number", right: 222, y: 407, size: 6.5 },
    // Owner/driver combined name line (y=398)
    { key: "third_parties.0.owner_name", right: 561, y: 388, size: 6.5 },
    { key: "third_parties.0.address", right: 464, y: 388, size: 5.5 },
    { key: "third_parties.0.phone", right: 296, y: 396, size: 6 },
    { key: "third_parties.0.agent_name", right: 193, y: 394, size: 6 },

    // ── row 2 ─────────────────────────────────────────────────────────────
    { key: "third_parties.1.vehicle_plate", right: 561, y: 368, size: 6.5 },
    { key: "third_parties.1.vehicle_type", right: 397, y: 368, size: 6 },
    { key: "third_parties.1.insurer", right: 327, y: 368, size: 6 },
    { key: "third_parties.1.policy_number", right: 222, y: 368, size: 6.5 },
    { key: "third_parties.1.owner_name", right: 561, y: 349, size: 6.5 },
    { key: "third_parties.1.address", right: 464, y: 349, size: 5.5 },
    { key: "third_parties.1.phone", right: 296, y: 357, size: 6 },
    { key: "third_parties.1.agent_name", right: 193, y: 355, size: 6 },

    // "אני מאשר לאיילון לפצות את תובע צד ג' בגין התאונה... (על פי סעיף 68)" — כן/לא circles
    {
      key: "declarations.poa_third_party",
      type: "checkbox",
      options: { yes: [95, 359], no: [70, 359] },
      size: 6,
    },

    // ── נפגעים ברכב (injured persons) — row 1 ────────────────────────────────
    { key: "injured_persons.0.name", right: 560, y: 287, size: 7.5 },
    { key: "injured_persons.0.address", right: 438, y: 287, size: 6.5 },
    { key: "injured_persons.0.id_number", right: 327, y: 287, size: 6.5 },
    { key: "injured_persons.0.injury_nature", right: 521, y: 253, size: 6.5 },
    { key: "injured_persons.0.birth_date", right: 294, y: 253, size: 6.5 },
    {
      key: "injured_persons.0.hospitalized",
      type: "checkbox",
      options: { yes: [216, 275], no: [260, 264] },
      size: 6,
    },

    // ── row 2 ─────────────────────────────────────────────────────────────
    { key: "injured_persons.1.name", right: 560, y: 240, size: 7.5 },
    { key: "injured_persons.1.address", right: 438, y: 240, size: 6.5 },
    { key: "injured_persons.1.id_number", right: 327, y: 240, size: 6.5 },
    { key: "injured_persons.1.injury_nature", right: 521, y: 207, size: 6.5 },
    { key: "injured_persons.1.birth_date", right: 294, y: 207, size: 6.5 },
    {
      key: "injured_persons.1.hospitalized",
      type: "checkbox",
      options: { yes: [216, 228], no: [260, 217] },
      size: 6,
    },

    // ── טיפול בנזק (garage / assessor) ──────────────────────────────────────
    { key: "assessor_name", right: 294, y: 188, size: 7 },
    { key: "garage.name", right: 426, y: 188, size: 7 },
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      options: { yes: [516, 189], no: [491, 189] },
      size: 6,
    },

    // ── הרשאה לביצוע העברה בנקאית (bank account) ─────────────────────────────
    { key: "bank_account.bank", right: 337, y: 120, size: 7 },
    { key: "bank_account.branch", right: 266, y: 120, size: 7 },
    { key: "bank_account.account_number", right: 201, y: 120, size: 7 },

    // ── הצהרה + תאריך (declaration, bottom-left) ─────────────────────────────
    // Narrow left column: "תאריך" label at top (y=81), "חתימת הנהג / המבוטח" signature-line
    // label at bottom (y=65) — date goes in the gap between them, signatory name below the
    // signature-line label.
    { key: "declarations.date", right: 146, y: 75, size: 6.5 },
    { key: "declarations.signatory_name", right: 146, y: 54, size: 6.5 },
  ],
};

export default ayalon;
