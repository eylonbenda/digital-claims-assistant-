import type { Template } from "../engine";

// Coordinate map: canonical field -> position on שלמה (Shlomo) accident-notice form.
// Source: docs/accidentStatementPdf/שלמה_ביטוח_טופס_הודעה.pdf (1 page, clean text layer,
// dense table layout — every section is a bordered grid with the Hebrew label printed at the
// TOP of each cell and the blank writing area below/left of it within the same cell).
// Checkboxes are glyph squares (□) immediately to the right (higher x, i.e. printed just before,
// in RTL reading order) of each option's label; centres calibrated visually against page renders.
//
// Boolean כן/לא checkboxes (engine.ts checkbox type now also matches boolean values via
// options.yes/options.no): accident.police.notified, garage.is_arrangement,
// injured_persons[].hospitalized, accident.is_paid_transport.
const shlomo: Template = {
  insurer: "שלמה",
  srcFile: "shlomo.pdf",
  fields: [
    // ===== פרטי המבוטח =====
    { key: "insured.last_name", right: 567, y: 718, size: 9 },
    { key: "insured.first_name", right: 494, y: 718, size: 9 },
    { key: "policy_number", right: 373, y: 718, size: 9 },
    { key: "insured.id_number", right: 257, y: 718, size: 8 },
    { key: "insured.phone", right: 100, y: 737, size: 7 }, // טל' בעבודה — value left of label
    { key: "insured.mobile", right: 100, y: 727, size: 7 }, // טל' בית

    // ===== פרטי הנהג בארוע =====
    { key: "driver.last_name", right: 567, y: 675, size: 9 },
    { key: "driver.first_name", right: 494, y: 675, size: 9 },
    { key: "driver.address_line", right: 418, y: 675, size: 8 },
    { key: "driver.relation_to_insured", right: 263, y: 675, size: 8 },
    { key: "driver.phone", right: 68, y: 694, size: 7 }, // טל' בעבודה — value left of label
    { key: "driver.mobile", right: 68, y: 684, size: 7 }, // טל' בית

    { key: "driver.birth_date", right: 567, y: 655, size: 8 },
    { key: "driver.id_number", right: 451, y: 655, size: 8 },
    { key: "driver.license_number", right: 328, y: 655, size: 8 },
    { key: "driver.license_type", right: 269, y: 655, size: 8 },
    { key: "driver.license_date", right: 200, y: 655, size: 8 },
    {
      key: "driver.license_origin",
      type: "checkbox",
      size: 6,
      options: { israeli: [108.5, 671], foreign: [108.5, 660] },
    },

    // ===== פרטי הרכב =====
    { key: "vehicle.plate", right: 552, y: 613, size: 9 },
    { key: "vehicle.year", right: 470, y: 613, size: 8 },
    { key: "vehicle.manufacturer", right: 230, y: 613, size: 7 }, // שם היצרן
    { key: "vehicle.model", right: 340, y: 613, size: 7 }, // דגם cell (no separate make field)
    { key: "vehicle.type", right: 280, y: 613, size: 7 }, // סוג הרכב, free-text -> Hebrew via labels

    // ===== פרטי המקרה/התאונה =====
    { key: "accident.date", right: 538, y: 563, size: 8 },
    { key: "accident.time", right: 478, y: 563, size: 8 },
    { key: "accident.location", right: 430, y: 563, size: 7 },
    { key: "accident.police.station", right: 202, y: 563, size: 7 },
    { key: "accident.police.log_number", right: 107, y: 563, size: 7 },
    {
      key: "accident.police.notified",
      type: "checkbox",
      size: 6,
      options: { yes: [229.5, 580.5], no: [230, 569.3] },
    },

    { key: "accident.description", right: 470, y: 549, size: 8 },

    // ===== תאור הנזקים =====
    { key: "damage.insured_vehicle", right: 565, y: 425, size: 8 },
    { key: "damage.third_party_vehicle", right: 296, y: 425, size: 8 },

    // ===== עדים =====
    { key: "witnesses.0.name", right: 505, y: 380, size: 7 },
    { key: "witnesses.0.address", right: 400, y: 380, size: 7 },
    { key: "witnesses.0.phone", right: 111, y: 380, size: 7 }, // טל' בית — value left of label
    { key: "witnesses.1.name", right: 505, y: 369, size: 7 },

    // ===== מוסך / שמאי =====
    { key: "garage.name", right: 493, y: 350, size: 7 },
    { key: "garage.phone", right: 393, y: 350, size: 7 },
    { key: "assessor_name", right: 150, y: 350, size: 8 },
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      size: 6,
      options: { yes: [258, 352], no: [233.2, 352] },
    },

    // ===== פרטי כלי רכב המעורבים (צד ג' — הרכב הפוגע) =====
    { key: "third_parties.0.vehicle_plate", right: 549, y: 317, size: 8 },
    { key: "third_parties.0.vehicle_type", right: 349, y: 317, size: 7 }, // סוג הרכב — free-text -> Hebrew via labels (array-indexed path now normalized by engine.ts)
    { key: "third_parties.0.insurer", right: 245, y: 317, size: 7 },
    { key: "third_parties.0.policy_number", right: 134, y: 317, size: 7 },

    { key: "third_parties.0.owner_name", right: 552, y: 291, size: 8 },
    { key: "third_parties.0.address", right: 418, y: 291, size: 7 },
    { key: "third_parties.0.phone", right: 211, y: 302, size: 6.5 }, // טל' בית line (more room)

    { key: "third_parties.0.driver_name", right: 552, y: 267, size: 8 },
    { key: "third_parties.0.id_number", right: 296, y: 267, size: 8 },

    // Second/third "other vehicles involved" rows — plate/owner/insurer only (no matching
    // canonical fields for a 4th/5th party beyond this array shape).
    { key: "third_parties.1.vehicle_plate", right: 552, y: 242, size: 8 },
    { key: "third_parties.1.owner_name", right: 497, y: 242, size: 8 },
    { key: "third_parties.1.insurer", right: 216, y: 242, size: 7 },

    { key: "third_parties.2.vehicle_plate", right: 552, y: 218, size: 8 },
    { key: "third_parties.2.owner_name", right: 497, y: 218, size: 8 },
    { key: "third_parties.2.insurer", right: 216, y: 218, size: 7 },

    // ===== נפגעים (עד 3 מוצגים על הטופס) =====
    { key: "injured_persons.0.name", right: 567, y: 178, size: 8 },
    { key: "injured_persons.0.address", right: 434, y: 178, size: 7 },
    { key: "injured_persons.0.id_number", right: 298, y: 178, size: 7 },
    { key: "injured_persons.0.age", right: 163, y: 155, size: 8 },
    { key: "injured_persons.0.injury_nature", right: 543, y: 155, size: 8 },
    {
      key: "injured_persons.0.hospitalized",
      type: "checkbox",
      size: 6,
      options: { yes: [193.8, 163], no: [45.8, 163] },
    },

    { key: "injured_persons.1.name", right: 567, y: 141, size: 8 },
    { key: "injured_persons.1.address", right: 434, y: 141, size: 7 },
    { key: "injured_persons.1.id_number", right: 298, y: 141, size: 7 },
    { key: "injured_persons.1.age", right: 163, y: 118, size: 8 },
    { key: "injured_persons.1.injury_nature", right: 543, y: 118, size: 8 },
    {
      key: "injured_persons.1.hospitalized",
      type: "checkbox",
      size: 6,
      options: { yes: [193.8, 120], no: [45.8, 120] },
    },

    { key: "injured_persons.2.name", right: 567, y: 104, size: 8 },
    { key: "injured_persons.2.address", right: 434, y: 104, size: 7 },
    { key: "injured_persons.2.id_number", right: 298, y: 104, size: 7 },
    { key: "injured_persons.2.age", right: 163, y: 81, size: 8 },
    { key: "injured_persons.2.injury_nature", right: 543, y: 81, size: 8 },
    {
      key: "injured_persons.2.hospitalized",
      type: "checkbox",
      size: 6,
      options: { yes: [193.8, 76], no: [45.8, 76] },
    },

    // ===== מידע נוסף (תחתית הטופס) =====
    {
      key: "accident.is_paid_transport",
      type: "checkbox",
      size: 6,
      options: { yes: [204.2, 57], no: [179.4, 57] },
    },

    // ===== הצהרה =====
    { key: "declarations.date", right: 209, y: 40, size: 9 },
  ],
};

export default shlomo;
