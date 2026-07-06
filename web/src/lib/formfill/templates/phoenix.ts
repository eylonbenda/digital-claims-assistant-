import type { Template } from "../engine";

// Coordinate map: canonical field -> position on הפניקס (Phoenix) accident-notice form.
// Source PDF: docs/accidentStatementPdf/הפניקס_טופס_תאונה.pdf (2 pages).
//
// IMPORTANT: this PDF's embedded text layer uses a broken/custom glyph encoding — extracted
// text is garbage. All coordinates below were authored VISUALLY: rendering the blank source at
// high DPI (mupdf render.mjs) plus a custom coordinate-grid overlay (pdf-lib, red ruler lines
// every 20pt with axis labels) to read cell edges and label positions by eye, then cross-checked
// against raw glyph x/y anchors from coords.mjs (positions are reliable even though the decoded
// characters are not) and vector-circle centers from boxdetect.mjs for every checkbox.
//
// Page index: 0 = page 1 (header / insured / driver / vehicle / accident basics + description +
//                          damage + third-party-with-insurance + 2 more third-party rows +
//                          fault + witnesses),
//             1 = page 2 (injured persons x3 / work-related yes-no questions / witnesses (dup) /
//                          bank account / mailing address for refund).
//
// SCHEMA GAPS (present on form, no canonical key):
//  - Top incident-type checkboxes (תאונה / גניבת רכב / רדיו טייפ / מק אש / אחר) — a different
//    taxonomy from ClaimData.claim_type (own_policy/third_party_report/settlement/unknown, which
//    is about who pays); no canonical field for "incident category". Left unmapped.
//  - "מס' תביעה" (insurer's internal claim number) — no canonical key.
//  - "אמדן ראשוני/דוח שמאי ... כתובת/פקס/דוא"ל" delivery-method checkboxes — no canonical key.
//  - "טלפון לברורים" (inquiries phone/fax/mobile) — no canonical key.
//  - "שים לב, יש לצרף..." attachment-reminder checkboxes (6 document types) — instructional, not
//    a data field; no canonical key.
//  - driver.license_number's neighbouring "האם הרשיון נפסל?" (was license revoked, כן/לא) — no
//    canonical key (revocation status isn't in ClaimData). "תוקף רשיון מ:___" (license validity
//    FROM-date) also has no canonical key — only the "עד:" (expiry) half is mapped below.
//  - "מהו התמרור המוצב בדרכו..." (road sign at accident) x2, "מי מעורב משאית/אופנוע/נגרר/רכב
//    חונה" (vehicle-type-involved yes/no) x4 — no canonical keys.
//  - third_parties[0] block (top, w/ insurer+policy) has no owner_name cell (only driver_name);
//    third_parties[0].owner_name left unmapped for that row.
//  - third_parties[].agent_name / damage_description — not present on this form for any TP row.
//  - Bank section: account-holder name + ID ("שם/ת.ז. בעל החשבון") and "מס' בנק" (bank CODE,
//    distinct from "שם בנק" bank NAME) — no canonical keys (BankAccount has bank/branch/
//    account_number only).
//  - "הועבר לתביעת גוף בתאריך" (transferred to bodily-injury claim on date) — no canonical key.
//  - injured_persons[].age — not collected on this form.
//  - injured_persons[].hospitalized — no separate כן/לא box for this on the form; "אשפוז (שם
//    בי"ח)" is a single free-text cell (mapped to injured_persons[].hospital), not a boolean box.
//  - declarations.poa_third_party / data_consent — boolean declaration checkmarks pre-printed on
//    the form (✓ glyphs already baked into the template graphic); no canonical key needed/usable.
const phoenix: Template = {
  insurer: "הפניקס",
  srcFile: "phoenix.pdf",
  fields: [
    // ── Header ───────────────────────────────────────────────────────────────
    { key: "policy_number", right: 488, y: 718, size: 8 },

    // ── מוסך / שמאי ──────────────────────────────────────────────────────────
    { key: "garage.name", right: 300, y: 665, size: 9 },
    { key: "assessor_name", right: 485, y: 665, size: 9 },
    // הסדר○ / לא הסדר○ circles, y=666 (now mappable via yes/no checkbox options)
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      size: 8,
      options: { yes: [125, 666], no: [76, 666] },
    },

    // ── א. פרטי המבוטח ───────────────────────────────────────────────────────
    // "שם המבוטח" is a SINGLE narrow cell (no separate first/last columns) — both names share
    // the ~56pt blank area left of the label, small font to minimise collision risk.
    { key: "insured.last_name", right: 458, y: 640, size: 6 },
    { key: "insured.first_name", right: 428, y: 640, size: 6 },
    { key: "insured.address_line", right: 388, y: 640, size: 7 },
    { key: "insured.id_number", right: 290, y: 640, size: 7 },
    { key: "insured.phone", right: 95, y: 640, size: 7 },

    // ── ב. פרטי הנהג ─────────────────────────────────────────────────────────
    { key: "driver.last_name", right: 558, y: 616, size: 7 },
    { key: "driver.first_name", right: 520, y: 616, size: 7 },
    { key: "driver.address_line", right: 455, y: 616, size: 7 },
    { key: "driver.relation_to_insured", right: 320, y: 616, size: 7 },
    { key: "driver.phone", right: 248, y: 616, size: 7 },
    { key: "driver.mobile", right: 193, y: 616, size: 7 },
    {
      key: "driver.license_origin",
      type: "checkbox",
      size: 8,
      options: { israeli: [72, 621], foreign: [72, 610] },
    },

    // תאריך לידה מלא / מספר זיהוי (driver) / מס' רשיון נהיגה / סוג-דרגת הרשיון — y=584 row
    { key: "driver.birth_date", right: 534, y: 591, size: 7 },
    { key: "driver.id_number", right: 420, y: 600, size: 6 },
    { key: "driver.license_number", right: 320, y: 591, size: 6 },
    { key: "driver.license_type", right: 259, y: 591, size: 6 },
    // תוקף רשיון מ:___ עד:___ — "עד:" cell only (no canonical key for "מ:" from-date);
    // cell spans x≈85-145, label "עד:" printed at its right edge (~x=137-145), y=596 baseline.
    { key: "driver.license_expiry", right: 130, y: 596, size: 6 },

    // ── ג. פרטי הרכב ─────────────────────────────────────────────────────────
    { key: "vehicle.plate", right: 530, y: 570, size: 8 },
    { key: "vehicle.manufacturer", right: 434, y: 570, size: 6 },
    { key: "vehicle.model", right: 342, y: 570, size: 6 },
    { key: "vehicle.type", right: 277, y: 570, size: 6 },
    { key: "vehicle.year", right: 198, y: 570, size: 7 },

    // ── ד. פרטי התאונה ───────────────────────────────────────────────────────
    { key: "accident.date", right: 560, y: 550, size: 8 },
    { key: "accident.time", right: 435, y: 550, size: 8 },
    // NOTE: accident.area_type (urban/intercity/parking/junction) has no matching checkbox on
    // this form — the only nearby circles are יום/לילה (day/night, no canonical field) and the
    // "האם חובא לידיעת המשטרה" police-notified boolean (mapped below via yes/no options).
    { key: "accident.location", right: 375, y: 550, size: 7 },
    // האם הובא לידיעת המשטרה — כן/לא circles, y=554
    {
      key: "accident.police.notified",
      type: "checkbox",
      size: 8,
      options: { yes: [267, 554], no: [241, 554] },
    },

    // מי לדעתך אחראי לתאונה? (fault) — glyph circles, y≈353 (visually re-derived; the boxdetect
    // triplet near y=337 was a false lead / different element — see full-page ruled crosscheck)
    {
      key: "fault",
      type: "checkbox",
      size: 8,
      options: {
        me: [424, 350],
        third_party: [377, 350],
        unknown: [340, 350],
      },
    },

    // תוך כדי עבודה / בדרך לעבודה (page 2, see below) drives accident.trip_type instead of a
    // page-1 box — this form has no trip-type row on page 1.

    // תאור נסיבות המקרה — first blank line (label baseline 523, first line below it 503)
    { key: "accident.description", right: 560, y: 503, size: 8 },

    // תאור מקים ברכב המבוטח — blank row directly below the label (label baseline y=460)
    { key: "damage.insured_vehicle", right: 545, y: 443, size: 8 },
    // תאור מקים צד ג' — single-line cell; label sits at y=400 with no blank row below it
    // (that space belongs to the next question), so write inline, above the label baseline
    { key: "damage.third_party_vehicle", right: 545, y: 405, size: 7 },

    // ── עדים (page 1 — first 2 witness rows) ────────────────────────────────
    { key: "witnesses.0.name", right: 502, y: 320, size: 6 },
    { key: "witnesses.0.address", right: 390, y: 320, size: 6 },
    { key: "witnesses.0.phone", right: 195, y: 332, size: 7 },
    { key: "witnesses.1.name", right: 535, y: 305, size: 8 },
    { key: "witnesses.1.address", right: 395, y: 305, size: 8 },
    { key: "witnesses.1.phone", right: 195, y: 312, size: 7 },

    // ── ו. פרטי צד ג' — TOP block (vehicle + driver + insurance) ────────────
    { key: "third_parties.0.vehicle_plate", right: 520, y: 264, size: 9 },
    { key: "third_parties.0.vehicle_type", right: 335, y: 264, size: 8 },
    { key: "third_parties.0.insurer", right: 215, y: 264, size: 8 },
    { key: "third_parties.0.policy_number", right: 95, y: 264, size: 8 },
    { key: "third_parties.0.driver_name", right: 558, y: 244, size: 9 },
    { key: "third_parties.0.address", right: 455, y: 244, size: 8 },
    { key: "third_parties.0.id_number", right: 315, y: 244, size: 8 },
    { key: "third_parties.0.phone", right: 95, y: 244, size: 8 },

    // ── מעורבים נוספים — block 1 (third_parties[1]) ─────────────────────────
    { key: "third_parties.1.vehicle_plate", right: 558, y: 204, size: 9 },
    { key: "third_parties.1.owner_name", right: 455, y: 204, size: 8 },
    { key: "third_parties.1.address", right: 315, y: 204, size: 8 },
    { key: "third_parties.1.driver_name", right: 195, y: 204, size: 8 },
    { key: "third_parties.1.phone", right: 95, y: 204, size: 8 },
    { key: "third_parties.1.insurer", right: 315, y: 184, size: 8 },
    { key: "third_parties.1.policy_number", right: 95, y: 184, size: 8 },

    // ── מעורבים נוספים — block 2 (third_parties[2]) ─────────────────────────
    { key: "third_parties.2.vehicle_plate", right: 558, y: 164, size: 9 },
    { key: "third_parties.2.owner_name", right: 455, y: 164, size: 8 },
    { key: "third_parties.2.address", right: 315, y: 164, size: 8 },
    { key: "third_parties.2.driver_name", right: 195, y: 164, size: 8 },
    { key: "third_parties.2.phone", right: 95, y: 164, size: 8 },
    { key: "third_parties.2.insurer", right: 315, y: 144, size: 8 },
    { key: "third_parties.2.policy_number", right: 95, y: 144, size: 8 },

    // ── Page 2 ───────────────────────────────────────────────────────────────

    // נפגעים — up to 3 rows on this form (schema supports up to 5)
    { key: "injured_persons.0.name", page: 1, right: 558, y: 770, size: 7 },
    { key: "injured_persons.0.id_number", page: 1, right: 458, y: 770, size: 6 },
    { key: "injured_persons.0.address", page: 1, right: 375, y: 770, size: 6 },
    { key: "injured_persons.0.injury_nature", page: 1, right: 558, y: 750, size: 7 },
    { key: "injured_persons.0.hospital", page: 1, right: 415, y: 750, size: 6 },

    { key: "injured_persons.1.name", page: 1, right: 558, y: 730, size: 7 },
    { key: "injured_persons.1.id_number", page: 1, right: 415, y: 730, size: 6 },
    { key: "injured_persons.1.address", page: 1, right: 375, y: 730, size: 6 },
    { key: "injured_persons.1.injury_nature", page: 1, right: 558, y: 710, size: 7 },
    { key: "injured_persons.1.hospital", page: 1, right: 415, y: 710, size: 6 },

    { key: "injured_persons.2.name", page: 1, right: 558, y: 690, size: 7 },
    { key: "injured_persons.2.id_number", page: 1, right: 415, y: 690, size: 6 },
    { key: "injured_persons.2.address", page: 1, right: 375, y: 690, size: 6 },
    { key: "injured_persons.2.injury_nature", page: 1, right: 558, y: 670, size: 7 },
    { key: "injured_persons.2.hospital", page: 1, right: 415, y: 670, size: 6 },

    // תוך כדי עבודה / בדרך לעבודה — the closest fit for accident.trip_type on this form
    // (only 2 of the 3 yes/no rows have a matching enum value; "בחזרה מהעבודה" has none).
    {
      key: "accident.trip_type",
      type: "checkbox",
      size: 8,
      options: {
        work: [419, 640],
        to_from_work: [419, 625],
      },
    },
    // האם היתה הסעה בשכר? — כן/לא circles, y=553 (question 3, page 2; box centers verified via
    // boxdetect.mjs: y=569 is actually "האם מעורב נגרר" one row above — corrected here)
    {
      key: "accident.is_paid_transport",
      type: "checkbox",
      page: 1,
      size: 8,
      options: { yes: [423, 553], no: [392, 553] },
    },

    // ── פרטי חשבון הבנק ──────────────────────────────────────────────────────
    { key: "bank_account.bank", page: 1, right: 558, y: 390, size: 7 },
    { key: "bank_account.account_number", page: 1, right: 238, y: 390, size: 7 },
    { key: "bank_account.branch", page: 1, right: 118, y: 390, size: 7 },

    // כתובת למשלוח הודעת זיכוי — reuse insured address (form has no distinct canonical slot)
    { key: "insured.street", page: 1, right: 505, y: 357, size: 6 },
    { key: "insured.house_no", page: 1, right: 358, y: 357, size: 6 },
    { key: "insured.city", page: 1, right: 278, y: 357, size: 6 },
    { key: "insured.postal_code", page: 1, right: 198, y: 357, size: 6 },
    { key: "insured.email", page: 1, right: 118, y: 357, size: 5 },
  ],
};

export default phoenix;
