import type { Template } from "../engine";

// Coordinate map: canonical field -> position on ליברה (Libra) accident-notice form.
// Source PDF: docs/accidentStatementPdf/הודעה-על-תאונה-ליברה.pdf (3 pages, clean text layer).
// Layout convention: every table cell has an empty data row ABOVE a bold label row; the label's
// baseline y sits ~20pt below the data baseline, and both are right-anchored to the same column
// right-edge. Coordinates authored via coords.mjs (label positions) + raw line-op extraction
// (column/row dividers) + render.mjs QA renders.
//
// Page index: 0 = page 1 (insured / contact / vehicle / driver-at-accident-time / accident basics
//                          + free-text description lines + diagram),
//             1 = page 2 (accident-location checkboxes / damage-location checkboxes /
//                          third-party #1 (vehicle) / third-party #2 (property) / police / witnesses),
//             2 = page 3 (declarations + signature block).
//
// SCHEMA GAPS (present on form, no canonical key / engine can't render boolean checkboxes):
//  - "מבוטח / אחר" checkbox (page1, ~x488 y418/y403): whether the driver-at-accident-time IS the
//    insured or someone else — no canonical boolean for this.
//  - מקום האירוע extra options (דרך עפר / כיכר / חניון מקורה / חניון סגור) — accident.area_type
//    enum only has 4 values; the 4 best-fit boxes are mapped, the rest have no target.
//  - מוקד נזק (damage location on car diagram: חזית/גג/תחתון/... 11 boxes) — damage.* are free-text
//    strings, not an enum/checkbox in the schema; left unmapped.
//  - מעורבות משטרה כן/לא (accident.police.notified is boolean) — engine checkboxes only match
//    string enum values, so booleans never draw (same as other insurer templates); left unmapped.
//  - הריני מייפה את כוחה... (declarations.poa_third_party is boolean) — same boolean limitation.
//  - accident.passengers, vehicle.odometer's policy_number pairing, garage/assessor,
//    bank_account, injured_persons — not present anywhere on this form.
const libra: Template = {
  insurer: "ליברה",
  srcFile: "libra.pdf",
  fields: [
    // ── פרטי המבוטח (page1) ──────────────────────────────────────────────────
    { key: "insured.first_name", right: 375, y: 682 },
    { key: "insured.id_number", right: 227, y: 682 },
    { key: "insured.birth_date", right: 128, y: 682, size: 9 },

    // ── פרטי התקשרות (page1) ─────────────────────────────────────────────────
    { key: "insured.address_line", right: 382, y: 628, size: 9 },
    { key: "insured.email", right: 263, y: 628, size: 8 },
    { key: "insured.mobile", right: 140, y: 628, size: 9 },

    // ── פרטי הרכב (page1) ────────────────────────────────────────────────────
    // Row 1: סוג הרכב (wide merged cell, right edge 437) | שם היצרן והדגם (merged, right edge 211)
    { key: "vehicle.type", right: 437, y: 565, size: 9 },
    { key: "vehicle.model", right: 211, y: 565, size: 9 },
    // Row 2: שנת ייצור | מספר רישוי | מד קילומטר | מספר פוליסה
    { key: "vehicle.year", right: 392, y: 528, size: 9 },
    { key: "vehicle.plate", right: 287, y: 528 },
    { key: "vehicle.odometer", right: 205, y: 528, size: 9 },
    { key: "policy_number", right: 136, y: 528, size: 9 },

    // ── פרטי הנהג בעת האירוע (page1) — driver at time of accident ───────────
    // Row 1: שם הנהג | תעודת זהות | כתובת
    { key: "driver.first_name", right: 399, y: 477 },
    { key: "driver.id_number", right: 278, y: 477, size: 9 },
    { key: "driver.address_line", right: 143, y: 477, size: 8 },
    // Row 2: טלפון נייד | טלפון נוסף | דואר אלקטרוני
    { key: "driver.mobile", right: 402, y: 439, size: 9 },
    { key: "driver.phone", right: 275, y: 439, size: 9 },
    { key: "driver.email", right: 157, y: 439, size: 8 },
    // Row 3: תאריך לידה | תאריך הוצאת רישיון נהיגה | מספר רישיון נהיגה
    { key: "driver.birth_date", right: 397, y: 402, size: 9 },
    { key: "driver.license_date", right: 312, y: 402, size: 9 },
    { key: "driver.license_number", right: 163, y: 402, size: 9 },

    // ── פרטי האירוע (page1) — תאריך/שעה/כתובת ────────────────────────────────
    { key: "accident.date", right: 428, y: 341, size: 9 },
    { key: "accident.time", right: 304, y: 341, size: 9 },
    { key: "accident.location", right: 175, y: 341, size: 8 },

    // ── תיאור מפורט של האירוע והנזק — free-text lines (right column, page1) ─
    { key: "accident.description", right: 494, y: 254, size: 8 },

    // ── מקום האירוע checkboxes (page2) — 4 of 8 boxes have a canonical match ─
    {
      key: "accident.area_type",
      type: "checkbox",
      page: 1,
      options: {
        urban: [322, 647],
        intercity: [413, 647],
        parking: [145, 647],
        junction: [145, 629],
      },
    },

    // ── פרטי צד ג' #1 — vehicle/driver third party (page2) ──────────────────
    // Row1: שם הנהג | תעודת זהות | טלפון נייד (driver)
    { key: "third_parties.0.driver_name", page: 1, right: 371, y: 511, size: 8 },
    { key: "third_parties.0.id_number", page: 1, right: 251, y: 511, size: 8 },
    { key: "third_parties.0.phone", page: 1, right: 133, y: 511, size: 8 },
    // Row2: חברת ביטוח | יצרן ודגם (free-text; vehicle_type enum is the closest canonical fit) | מספר רישוי
    { key: "third_parties.0.insurer", page: 1, right: 381, y: 472, size: 8 },
    { key: "third_parties.0.vehicle_type", page: 1, right: 248, y: 472, size: 8 },
    { key: "third_parties.0.vehicle_plate", page: 1, right: 135, y: 472, size: 8 },
    // Row3: שם בעל הפוליסה | טלפון נייד (policy owner's phone — no canonical slot, schema gap) | כתובת
    { key: "third_parties.0.owner_name", page: 1, right: 397, y: 434, size: 8 },
    { key: "third_parties.0.address", page: 1, right: 123, y: 434, size: 8 },

    // ── פרטי צד ג' #2 — property-owner third party (page2) ──────────────────
    // Row1: שם בעל הרכוש | תעודת זהות | טלפון נייד
    { key: "third_parties.1.owner_name", page: 1, right: 399, y: 372, size: 8 },
    { key: "third_parties.1.id_number", page: 1, right: 263, y: 372, size: 8 },
    { key: "third_parties.1.phone", page: 1, right: 136, y: 372, size: 8 },
    // Row2: חברת ביטוח | יצרן ודגם (free-text; vehicle_type enum is the closest canonical fit) | מספר רישוי
    { key: "third_parties.1.insurer", page: 1, right: 384, y: 334, size: 8 },
    { key: "third_parties.1.vehicle_type", page: 1, right: 257, y: 334, size: 8 },
    { key: "third_parties.1.vehicle_plate", page: 1, right: 142, y: 334, size: 8 },
    // Row3: שם בעל הפוליסה (no separate canonical slot — owner_name used in row1 above; schema gap) |
    //       טלפון נייד (schema gap) | כתובת
    { key: "third_parties.1.address", page: 1, right: 123, y: 296, size: 8 },

    // ── עדים שנכחו במקום האירוע — first row (page2) ──────────────────────────
    { key: "witnesses.0.name", page: 1, right: 379, y: 183, size: 8 },
    { key: "witnesses.0.address", page: 1, right: 270, y: 183, size: 8 },
    { key: "witnesses.0.phone", page: 1, right: 129, y: 183, size: 8 },

    // ── הצהרות (page3) — signature block ─────────────────────────────────────
    { key: "declarations.signatory_name", page: 2, right: 497, y: 625, size: 9 },
    { key: "insured.id_number", page: 2, right: 381, y: 625, size: 9 },
    { key: "declarations.date", page: 2, right: 237, y: 625, size: 9 },
  ],
};

export default libra;
