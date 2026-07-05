import type { Template } from "../engine";

// Coordinate map: canonical field -> position on איילון (Ayalon) — הודעה על תאונת דרכים.
// SCANNED / IMAGE-ONLY PDF (0 extractable glyphs) — every coordinate below was measured
// PURELY VISUALLY from mupdf renders (.pdfwork/render.mjs + a custom cropx.mjs that renders
// an arbitrary [xL,xR]x[yTop,yBot] point-rectangle at a given scale), reading cell borders
// and label edges off the rendered pixels and converting back to PDF points:
//   pt_x = xL + pixel_x/scale ; pt_y_from_top = yTop + pixel_y/scale ; pdf_y = pageH - pt_y_from_top
// Page size: 598.68 x 826.56 pt (1 page, portrait). pageH = 826.56.
//
// Table quirk worth documenting: the "third parties" table's HEADER row (מס' רישוי / תוצרת-דגם /
// סוג הרכב / שם חברת הביטוח / מס' פוליסה) does not reuse the same column split in every data
// row — row1 (owner) and row2 (driver) reuse the header's rightmost column for name (plate row1 /
// driver row2 share one column), the model column for "כתובתו" (address), and the insurer/policy
// columns for id_number/phone respectively. Verified visually across multiple crops.
//
// SCHEMA GAPS (present on form, left unmapped):
//  - accident.police.notified, accident.is_paid_transport, garage.is_arrangement,
//    injured_persons[0].hospitalized are `boolean` in ClaimData and ARE mapped below as
//    checkbox fields using the engine's yes/no option-key support (booleans match
//    options.yes / options.no). Verified visually — X lands centered in the printed
//    כן/לא boxes for both true and false.
//  - "האם מעורבת משאית?" (was a truck involved) — no canonical key.
//  - "מהו התמרור המוצב בדרכו של הנהג המבוטח/הנהג צד ג'" (road sign) x2 — no canonical key.
//  - "תרשים מקום התאונה" (accident sketch diagram box) — no canonical key.
//  - "מס' יומן/תיק" is accident.police.log_number (mapped); "שם התחנה" is police.station (mapped).
//  - third_parties[].damage_description — no "תאור הנזק" column for TP rows on this form.
//  - third_parties[].vehicle_type / model ("תוצרת/דגם", "סוג הרכב" columns) — ThirdParty has a
//    vehicle_type field but the header column for it did not show corresponding data-row space
//    distinct from owner_name in the visual trace; left unmapped to avoid an inaccurate guess.
//  - witnesses[0].phone / relation-to-driver — the witness row's address/relation zone showed no
//    internal divider (visually confirmed merged cell); phone omitted as position was ambiguous.
//  - injured_persons[1.. ] (2nd/3rd injured-person rows below row1) — not mapped (only row1).
//  - declarations.poa_third_party / data_consent — no dedicated checkboxes found on this form.
const ayalon: Template = {
  insurer: "איילון",
  srcFile: "ayalon.pdf",
  fields: [
    // ── Header (top of form) ────────────────────────────────────────────────
    // "שם הסוכן" line (מס' תביעה above it has no canonical key — claim/reference number).
    { key: "agent_name", right: 70, y: 710 },

    // ── פרטי המבוטח (insured) ───────────────────────────────────────────────
    { key: "insured.first_name", right: 568, y: 653 },
    { key: "policy_number", right: 420, y: 653 },
    { key: "insured.id_number", right: 280, y: 651, size: 7 },
    { key: "insured.phone", right: 188, y: 658, size: 7 }, // טל' בית (home) line

    // ── פרטי הנהג (driver) ──────────────────────────────────────────────────
    { key: "driver.first_name", right: 568, y: 613 },
    { key: "driver.address_line", right: 462, y: 613, size: 8 },
    { key: "driver.relation_to_insured", right: 290, y: 613, size: 8 },
    { key: "driver.phone", right: 188, y: 618, size: 7 }, // טל' בית (home) line

    { key: "driver.birth_date", right: 550, y: 589, size: 9 },
    { key: "driver.id_number", right: 470, y: 589, size: 7 },
    { key: "driver.license_type", right: 350, y: 589, size: 8 },
    { key: "driver.license_number", right: 265, y: 589, size: 8 },
    { key: "driver.license_date", right: 195, y: 589, size: 8 },
    {
      key: "driver.license_origin",
      type: "checkbox",
      options: { israeli: [91, 601], foreign: [91, 589] },
    },

    // ── פרטי הרכב (vehicle) ─────────────────────────────────────────────────
    { key: "vehicle.plate", right: 550, y: 549, size: 9 },
    { key: "vehicle.manufacturer", right: 466, y: 548, size: 8 },
    { key: "vehicle.model", right: 407, y: 548, size: 8 },
    { key: "vehicle.type", right: 356, y: 548, size: 8 }, // free-text cell -> Hebrew via labels
    { key: "vehicle.year", right: 281, y: 548, size: 8 },

    // ── פרטי המקרה / התאונה (accident) ──────────────────────────────────────
    { key: "accident.date", right: 550, y: 510, size: 9 },
    { key: "accident.time", right: 468, y: 507, size: 8 },
    { key: "accident.location", right: 412, y: 507, size: 6.5 },
    {
      key: "accident.police.notified",
      type: "checkbox",
      options: { yes: [222, 521], no: [222, 506] },
    },
    { key: "accident.police.station", right: 205, y: 507, size: 8 },
    { key: "accident.police.log_number", right: 127, y: 507, size: 8 },

    // "תוך כדי עבודה / בדרך לעבודה או חזרה מהעבודה?" — כן -> work-related, לא -> not.
    {
      key: "accident.trip_type",
      type: "checkbox",
      options: {
        work: [306, 492],
        to_from_work: [306, 492],
        private: [286, 492],
        taxi: [286, 492],
      },
    },
    {
      key: "accident.is_paid_transport",
      type: "checkbox",
      options: { yes: [73, 490], no: [53, 490] },
    },

    // תאור נסיבות המקרה — first blank line
    { key: "accident.description", right: 475, y: 479, size: 8 },

    // מי לדעתך אחראי לארוע התאונה?
    {
      key: "fault",
      type: "checkbox",
      options: { me: [421, 359], third_party: [361, 359], unknown: [312, 359] },
    },

    // ── תאור הנזקים (damage) ────────────────────────────────────────────────
    // NOTE: this row is a single compact ~20pt-tall label+data cell (label text is centered
    // across the full cell width) — there is no separate blank line below the label, so the
    // filled value necessarily sits close to it. Minimized with small size + bottom-of-row y.
    { key: "damage.insured_vehicle", right: 565, y: 328.5, size: 6 },
    { key: "damage.third_party_vehicle", right: 276, y: 328.5, size: 6 },

    // ── עדים (witnesses) — row 1 ────────────────────────────────────────────
    { key: "witnesses.0.name", right: 512, y: 308, size: 8 },
    { key: "witnesses.0.address", right: 374, y: 308, size: 8 },

    // ── פרטי רכבים מעורבים (third parties) — combined owner+driver row ──────
    // NOTE: this table's rows carry their OWN inline label per cell (e.g. row1's rightmost
    // cell literally prints "שם בעל הרכב", row2's prints "שם הנהג") rather than reusing the
    // header row's column labels for data — every value below is right-anchored just to the
    // LEFT of its own row's printed label to avoid drawing on top of it. The plate number goes
    // in the blank space of the HEADER row itself (to the left of "מס' רישוי (של צד ג' הפוגע)").
    { key: "third_parties.0.vehicle_plate", right: 475, y: 264, size: 7 },
    { key: "third_parties.0.owner_name", right: 475, y: 252, size: 7 },
    { key: "third_parties.0.address", right: 384, y: 252, size: 5.5 },
    { key: "third_parties.0.insurer", right: 245, y: 252, size: 7 },
    { key: "third_parties.0.policy_number", right: 133, y: 258, size: 7 },
    { key: "third_parties.0.agent_name", right: 133, y: 246, size: 6 },

    { key: "third_parties.0.driver_name", right: 495, y: 232, size: 7 },
    { key: "third_parties.0.id_number", right: 245, y: 236, size: 7 },
    { key: "third_parties.0.phone", right: 100, y: 232, size: 7 },

    // ── פרטים נוספים על רכבים מעורבים — rows 3 & 4 ───────────────────────────
    // Same per-row inline-label pattern as above — anchor just left of each row's own label.
    { key: "third_parties.1.vehicle_plate", right: 490, y: 207, size: 7 },
    { key: "third_parties.1.owner_name", right: 368, y: 207, size: 7 },
    { key: "third_parties.1.insurer", right: 188, y: 207, size: 7 },
    { key: "third_parties.1.phone", right: 100, y: 207, size: 6 },

    { key: "third_parties.2.vehicle_plate", right: 490, y: 192, size: 7 },
    { key: "third_parties.2.owner_name", right: 368, y: 192, size: 7 },
    { key: "third_parties.2.insurer", right: 188, y: 192, size: 7 },
    { key: "third_parties.2.phone", right: 100, y: 192, size: 6 },

    // ── נפגעים ברכב ו/או ע"י הרכב המבוטח (injured persons) — row 1 ──────────
    { key: "injured_persons.0.name", right: 515, y: 161, size: 8 },
    { key: "injured_persons.0.address", right: 390, y: 161, size: 7 },
    { key: "injured_persons.0.id_number", right: 282, y: 155, size: 6.5 },
    { key: "injured_persons.0.age", right: 275, y: 140, size: 8 },
    { key: "injured_persons.0.injury_nature", right: 505, y: 140, size: 7 },
    {
      key: "injured_persons.0.hospitalized",
      type: "checkbox",
      options: { yes: [194, 141], no: [54, 141] },
    },

    // ── הרכב נמצא במוסך / השמאי המטפל (garage / assessor) ───────────────────
    { key: "garage.name", right: 480, y: 52, size: 8 },
    { key: "garage.phone", right: 408, y: 52, size: 8 },
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      options: { yes: [287, 46], no: [264, 46] },
    },
    { key: "assessor_name", right: 140, y: 52, size: 8 },

    // ── הצהרה + תאריך (declaration) ─────────────────────────────────────────
    { key: "declarations.date", right: 245, y: 33, size: 8 },
    { key: "declarations.signatory_name", right: 104, y: 33, size: 8 },
  ],
};

export default ayalon;
