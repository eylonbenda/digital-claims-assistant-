import type { Template } from "../engine";

// Coordinate map: canonical field -> position on מגדל (Migdal).
// Pages: 0=page1, 1=page2, 2=page3.
// Checkbox X-positions are box centre minus ~4,4 (vector squares from boxdetect.mjs).
const migdal: Template = {
  insurer: "מגדל",
  srcFile: "migdal.pdf",
  fields: [
    // ── Page 1 ──────────────────────────────────────────────────────────────

    // א. פרטי המבוטח
    { key: "insured.first_name", right: 241, y: 662 },
    { key: "insured.last_name", right: 402, y: 662 },
    { key: "insured.id_number", right: 536, y: 662 },
    { key: "insured.birth_date", right: 142, y: 662 },
    { key: "insured.street", right: 405, y: 635 },
    { key: "insured.house_no", right: 286, y: 635 },
    { key: "insured.city", right: 526, y: 635 },
    { key: "insured.postal_code", right: 80, y: 635 },
    { key: "insured.mobile", right: 112, y: 605, size: 9 },
    { key: "insured.phone", right: 537, y: 605, size: 9 },
    { key: "insured.email", right: 284, y: 605, size: 8 },
    // "האם משטרת ישראל התערבה באירוע?" — box sits immediately left of each label (RTL).
    // Box centres (416,77)/(438,77) from boxdetect.mjs; offset -4,-4 like other checkboxes
    // on this form so the X glyph sits centred inside the box instead of high-and-right.
    {
      key: "accident.police.notified",
      type: "checkbox",
      options: { yes: [412, 73], no: [434, 73] },
    },
    // "האם הרכב שימש... להסעת נוסעים בשכר..." (same convention as police row above).
    {
      key: "accident.is_paid_transport",
      type: "checkbox",
      options: { yes: [127, 86], no: [147, 86] },
    },

    // ב. פרטי כלי רכב
    { key: "vehicle.plate", right: 536, y: 515 },
    { key: "vehicle.manufacturer", right: 169, y: 515 },
    { key: "vehicle.year", right: 86, y: 515 },
    {
      key: "vehicle.type",
      type: "checkbox",
      options: {
        private: [317, 513],
        commercial: [264, 513],
        truck: [291, 513],
        tractor: [353, 513],
        scooter: [383, 513],
        motorcycle: [414, 513],
      },
    },

    // ג. פרטי הנהג
    { key: "driver.id_number", right: 536, y: 440 },
    { key: "driver.last_name", right: 418, y: 440 },
    { key: "driver.first_name", right: 301, y: 440 },
    { key: "driver.license_number", right: 441, y: 380 },
    { key: "driver.license_type", right: 264, y: 380, size: 9 },
    { key: "driver.license_date", right: 115, y: 380, size: 9 },
    // "כתובת דואר אלקטרוני" — leftmost column of the driver row (id_number row, y=440).
    { key: "driver.email", right: 140, y: 440, size: 8 },

    // ד. פרטי האירוע
    { key: "accident.date", right: 558, y: 335 },
    { key: "accident.time", right: 504, y: 335 },
    { key: "accident.passengers", right: 181, y: 335 },
    {
      key: "accident.trip_type",
      type: "checkbox",
      options: {
        private: [308, 333],
        work: [420, 333],
        to_from_work: [389, 333],
        paid_transport: [276, 333],
        taxi: [226, 333],
      },
    },
    // מקום האירוע — blank underline to left of the label (same row, y=317)
    { key: "accident.location", right: 350, y: 317, size: 9 },
    // תיאור האירוע — 2 ruled writing lines below the label (rules at pdf y=220 and y=203;
    // label itself occupies the row above at y~237-240 so isn't available for wrap).
    // width=525 matches the ruled-line span (x=31..564); lineHeight=17 matches the rule
    // spacing; engine shrinks font (min 5pt) before it would overflow either line.
    {
      key: "accident.description",
      right: 561,
      y: 225,
      size: 8,
      width: 525,
      lineHeight: 17,
      maxLines: 2,
    },

    // ── Page 2 (index 1) ────────────────────────────────────────────────────

    // ה. פרטי נפגעי גוף — row 1: "האם הנפגע אושפז בבי"ח" כן/לא
    {
      key: "injured_persons.0.hospitalized",
      type: "checkbox",
      page: 1,
      size: 9,
      options: { yes: [337, 459], no: [359, 459] },
    },

    // ── Page 3 (index 2) ────────────────────────────────────────────────────

    // ו. פרטי צד ג' — row 1: רישוי | סוג רכב | חברת ביטוח | פוליסה | סוכן | טל' סוכן
    { key: "third_parties.0.vehicle_plate", page: 2, right: 561, y: 718, size: 9 },
    { key: "third_parties.0.insurer", page: 2, right: 378, y: 718, size: 9 },
    // row 2: מספר זהות | שם משפחה | שם פרטי | כתובת מגורים
    // driver_name (full name) -> שם משפחה column; שם פרטי needs first/last split (schema gap)
    { key: "third_parties.0.driver_name", page: 2, right: 429, y: 690, size: 9 },
    { key: "third_parties.0.address", page: 2, right: 295, y: 690, size: 8 },

    // מי אשם — "מי לדעתך אחרי לתאונה?"
    // אני(המבוטח): מלא=[255,596]  חלקי=[230,596]  לא ידוע=[204,596]
    // צד ג':        מלא=[530,596]  חלקי=[505,596]  לא ידוע=[479,596]
    // Mapping: fault=me -> X in "אני מלא"; fault=third_party -> X in "צד ג' מלא"; fault=unknown -> X in "אני לא ידוע"
    {
      key: "fault",
      type: "checkbox",
      page: 2,
      options: {
        me: [248, 592],
        third_party: [523, 592],
        unknown: [197, 592],
      },
    },
    // ט. הצהרות המבוטח — "אני מסכים/ה שהאגף לשירותי מידע במשרד התחבורה יעביר מידע..."
    // (Ministry of Transport data-bureau consent) — single checkbox, no "לא" glyph.
    {
      key: "declarations.data_consent",
      type: "checkbox",
      page: 2,
      options: { yes: [428, 370] },
    },
    // Signature block at page bottom — two boxes found via mupdf pixel-scan
    // (dark-pixel edges at scale=8): signature box x=[31,143.5], date box
    // x=[465.6,541.5], both y=[101.9,130.3]. Labels "חתימת המבוטח" / "תאריך"
    // sit just below each box (y≈103). Text baseline set a few pt above the
    // box bottom, right-anchored a few pt inside each box's right edge.
    { key: "declarations.signatory_name", page: 2, right: 138, y: 110, size: 9 },
    { key: "declarations.date", page: 2, right: 536, y: 110, size: 9 },
  ],
};

export default migdal;
