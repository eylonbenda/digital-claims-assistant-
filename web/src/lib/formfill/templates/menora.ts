import type { Template } from "../engine";

// Coordinate map: canonical field -> position on מנורה (Menora) page 1.
// Source PDF is the mislabeled כלל_טופס_תאונה.pdf (content is מנורה); bundled here as menora.pdf.
// Ported from .pdfwork/formfill/templates/menora.mjs (authored via the pdf-form-mapper agent).
// Enriched 2026-06-27: added fault, accident.description, third_parties[0], damage, insured.city.
const menora: Template = {
  insurer: "מנורה",
  srcFile: "menora.pdf",
  fields: [
    { key: "agent_name", right: 120, y: 767 },

    // א. פרטי המבוטח
    { key: "insured.first_name", right: 480, y: 756 },
    { key: "insured.last_name", right: 430, y: 756 },
    { key: "policy_number", right: 335, y: 756 },
    { key: "insured.id_number", right: 250, y: 748, size: 8 },
    { key: "insured.phone", right: 108, y: 756, size: 9 },
    { key: "insured.mobile", right: 108, y: 744, size: 9 },

    // ב. פרטי הנהג — כתובת cell (x≈185–412) carries insured city (no separate city field)
    { key: "driver.first_name", right: 489, y: 731 },
    { key: "driver.last_name", right: 455, y: 731 },
    { key: "insured.city", right: 408, y: 731, size: 8 },
    { key: "driver.id_number", right: 420, y: 668, size: 8 },
    // רישיון נהיגה cell: x≈288–332 (label right-edge 332), data right≈330
    { key: "driver.license_number", right: 330, y: 668, size: 8 },
    // דרגת רישיון cell: x≈219–269 (label right-edge 269), data right≈267
    { key: "driver.license_type", right: 267, y: 668, size: 8 },
    // תאריך הוצאה cell: x≈144–203 (label right-edge 203), data right≈200
    { key: "driver.license_date", right: 200, y: 668, size: 8 },
    // "כתובת דואר אלקטרוני (לכתובת מייל זה יישלחו הדיוורים ממנורה):" — blank line
    // below the driver license row; label starts at x=348, underline runs left of it.
    { key: "driver.email", right: 345, y: 654, size: 8 },

    // ג. פרטי הרכב
    { key: "vehicle.plate", right: 484, y: 615 },
    { key: "vehicle.manufacturer", right: 386, y: 615 },
    { key: "vehicle.model", right: 323, y: 615 },
    { key: "vehicle.type", right: 260, y: 615, size: 8 }, // free-text cell -> Hebrew via labels
    { key: "vehicle.year", right: 181, y: 615, size: 9 },

    // ד. פרטי התאונה
    { key: "accident.date", right: 476, y: 596 },
    { key: "accident.time", right: 406, y: 596 },
    { key: "accident.location", right: 288, y: 596, size: 8 },

    // The y=573 line packs three questions (per text dump): תוך כדי עבודה? כן=[350] לא=[323]
    // / מעורבת משאית? כן=[225] לא=[198] (no canonical key) / הסעה בשכר? כן=[91] לא=[65].
    // trip_type originally pointed at the הסעה בשכר circles by mistake — fixed 2026-07-05.
    {
      key: "accident.trip_type",
      type: "checkbox",
      options: {
        work: [350, 573],
        to_from_work: [350, 573],
        private: [323, 573],
        taxi: [323, 573],
        paid_transport: [323, 573],
      },
    },

    // "האם היתה הסעה בשכר? כן ○ לא ○" — same row, right of the trip_type boxes.
    {
      key: "accident.is_paid_transport",
      type: "checkbox",
      options: { yes: [91, 573], no: [65, 573] },
    },

    // "האם הובא לידעת המשטרה" — stacked כן (top)/לא (bottom) circles.
    {
      key: "accident.police.notified",
      type: "checkbox",
      options: { yes: [210, 594], no: [210, 584] },
    },

    // מי אחראי לארוע התאונה? — glyph checkboxes (w=7 empty glyphs), y=458
    // אני (me) glyph x=434 | נהג צד ג' (third_party) glyph x=398 | לא יודע (unknown) glyph x=349
    {
      key: "fault",
      type: "checkbox",
      options: {
        me: [434, 458],
        third_party: [398, 458],
        unknown: [349, 458],
      },
    },

    // תאור נסיבות המקרה — first blank line right of the label (y=561)
    // Underlines are vector rules; first line baseline ≈ y=556 (right side, x=281-548)
    { key: "accident.description", right: 548, y: 556, size: 8 },

    // נזקים — תאור הנזקים
    // Labels sit at y=421 (top of cell); data underline is within the cell at y≈411
    // Right column (insured vehicle): x=296-553, right≈546
    { key: "damage.insured_vehicle", right: 546, y: 411, size: 8 },
    // Left column (TP vehicle damage): x=34-276, right≈276
    { key: "damage.third_party_vehicle", right: 276, y: 411, size: 8 },

    // פרטי רכבים מעורבים / נפגעים — first TP row
    // Column header row y=361; data underline below labels at y≈351
    // מספר רישוי (של צד ג' הפוגע): rightmost col → data right=530 (avoid clipping at margin)
    { key: "third_parties.0.vehicle_plate", right: 530, y: 351, size: 8 },
    // שם בעל הרכב: label x=485-528 at y=343, data right of that → right=484
    { key: "third_parties.0.owner_name", right: 484, y: 343, size: 8 },
    // שם חברת הביטוח: col x=140-249 → data right=248
    { key: "third_parties.0.insurer", right: 248, y: 351, size: 8 },
    // טל. בית (TP owner phone): label x=225-249 at y=343 → data right=224
    { key: "third_parties.0.phone", right: 224, y: 343, size: 8 },

    // אשפוז — נפגעי גוף, שורה ראשונה: single circle (checked = hospitalized).
    {
      key: "injured_persons.0.hospitalized",
      type: "checkbox",
      options: { yes: [129, 253] },
    },

    // "אני ○ מאשר/ת טיפול בתביעת צד ג' בכפוף לתנאי הפוליסה." — single circle,
    // authorizes third-party claim handling; closest match to poa_third_party.
    {
      key: "declarations.poa_third_party",
      type: "checkbox",
      options: { yes: [547, 435] },
    },

    // מוסך + שמאי (תחתית הטופס)
    { key: "garage.name", right: 492, y: 62 },
    { key: "garage.phone", right: 383, y: 62, size: 9 },
    { key: "assessor_name", right: 154, y: 62 },
    // "מוסך הסדר: כן ○ לא ○" — same bottom row, right of garage phone/assessor.
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      options: { yes: [261, 62], no: [233, 62] },
    },
  ],
};

export default menora;
