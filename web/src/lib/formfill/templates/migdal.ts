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
    // ID comb has 9 boxes at ~11.1pt pitch, x≈467-566 (dividers via migdal_lines.mjs).
    // Default size drew the whole 9-digit string ~52pt wide (≈5.8pt/char) starting mid-comb,
    // so several digits shared one box while the trailing boxes sat empty. size:18 makes the
    // string's total width (~93pt / 10.3pt per char) approximate the comb's pitch so digits
    // land roughly one-per-box; right anchored a couple pt inside the comb's right edge (566).
    { key: "insured.id_number", right: 564, y: 660, size: 18 },
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
    // Date/time cells sit in adjacent columns divided at pdf x≈509.6 (found via
    // migdal_render_xy.mjs zoom); at default size the two values' text abutted the
    // divider from both sides with ~5pt combined gap and read as one jammed string
    // ("14:3022/06/2026"). size:9 + right anchors pulled off the divider (564/500)
    // give each value clear breathing room inside its own cell.
    { key: "accident.date", right: 564, y: 335, size: 9 },
    { key: "accident.time", right: 500, y: 335, size: 9 },
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

    // ה. פרטי נפגעי גוף — row 1
    // Identity sub-row (name/id/address; "האם בעת התאונה הייית" in/out-of-vehicle has no
    // canonical field — schema gap) sits just above the phone/age/hospital sub-row.
    // Columns (right→left): שם הנפגע [433-564] | מספר זהות comb [333.9-433.1, 9 boxes
    // @~11pt pitch] | האם בעת התאונה הייית [205-334, schema gap] | כתובת מגורים [28-205].
    { key: "injured_persons.0.name", page: 1, right: 558, y: 490, size: 9 },
    // Same 9-box comb convention as insured.id_number on page 1: size:18 makes the
    // 9-digit string's width approximate the comb's pitch so digits land one-per-box.
    { key: "injured_persons.0.id_number", page: 1, right: 431, y: 484, size: 18 },
    { key: "injured_persons.0.address", page: 1, right: 198, y: 490, size: 8 },
    // "האם הנפגע אושפז בבי"ח" כן/לא
    {
      key: "injured_persons.0.hospitalized",
      type: "checkbox",
      page: 1,
      size: 9,
      options: { yes: [337, 459], no: [359, 459] },
    },
    // מהות הפגיעה — narrow leftmost column [28-98] of the phone/age/hospital sub-row.
    { key: "injured_persons.0.injury_nature", page: 1, right: 97, y: 459, size: 7 },

    // ── Page 3 (index 2) ────────────────────────────────────────────────────

    // ו. פרטי צד ג' — row 1: רישוי | סוג רכב | חברת ביטוח | פוליסה | סוכן | טל' סוכן
    { key: "third_parties.0.vehicle_plate", page: 2, right: 561, y: 718, size: 9 },
    { key: "third_parties.0.insurer", page: 2, right: 378, y: 718, size: 9 },
    // row 2: מספר זהות | שם משפחה | שם פרטי | כתובת מגורים
    // driver_name (full name) -> שם משפחה column; שם פרטי needs first/last split (schema gap)
    { key: "third_parties.0.driver_name", page: 2, right: 429, y: 690, size: 9 },
    { key: "third_parties.0.address", page: 2, right: 295, y: 690, size: 8 },

    // מי אשם — "מי לדעתך אחרי לתאונה?"
    // Box centres (boxdetect.mjs): אני(המבוטח) מלא=(255,596) חלקי=(230,596) לא ידוע=(204,596)
    //                               צד ג'        מלא=(530,596) חלקי=(505,596) לא ידוע=(479,596)
    // X-position = box centre minus ~4,4 (this form's usual convention). The previous values
    // were offset an extra -3 in x, landing the X half outside the "מלא" box's left edge
    // (box spans x251-259/x526-534/x200-208) — corrected here to centre-4.
    // Mapping: fault=me -> X in "אני מלא"; fault=third_party -> X in "צד ג' מלא"; fault=unknown -> X in "אני לא ידוע"
    {
      key: "fault",
      type: "checkbox",
      page: 2,
      options: {
        me: [251, 592],
        third_party: [526, 592],
        unknown: [200, 592],
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
