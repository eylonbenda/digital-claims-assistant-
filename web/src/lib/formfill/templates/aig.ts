import type { Template } from "../engine";

// Coordinate map: canonical field -> position on AIG (הודעה על תאונה - ביטוח רכב).
// Source: docs/accidentStatementPdf/טופס-הודעה-על-תאונה-aig.pdf (3 pages, clean text layer,
// vector-drawn boxes/checkboxes — no AcroForm fields). Authored via the pdf-form-mapper agent.
//
// Layout convention on this form: each row has up to 3 bordered input boxes (right/mid/left
// columns at roughly x=398-486 / 220-308 / 42-130), with the Hebrew label printed just to the
// LEFT of its box. `right` below is each box's right edge (minus ~4pt padding).
//
// Checkboxes are plain vector squares (no AcroForm widgets); "yes/no" questions use a single
// two-cell bordered box split by a vertical rule (right half = כן, left half = לא). Boolean
// ClaimData fields (accident.police.notified, declarations.poa_third_party) are mapped via the
// checkbox type's yes/no option keys, matched against boolean values by engine.ts.
const aig: Template = {
  insurer: "AIG",
  srcFile: "aig.pdf",
  fields: [
    // ===== PAGE 1 =====
    // א. פרטי המבוטח
    { key: "insured.last_name", right: 482, y: 738 },
    { key: "insured.first_name", right: 304, y: 738 },
    { key: "insured.id_number", right: 126, y: 738, size: 9 },
    { key: "insured.phone", right: 482, y: 713, size: 9 },
    { key: "insured.mobile", right: 304, y: 713, size: 9 },
    { key: "policy_number", right: 482, y: 684 },
    { key: "insured.address_line", right: 304, y: 684, size: 8 },
    { key: "insured.email", right: 301, y: 655, size: 8 },

    // ב. פרטי הנהג ברכב בעת המקרה
    { key: "driver.last_name", right: 482, y: 600 },
    { key: "driver.first_name", right: 304, y: 600 },
    { key: "driver.id_number", right: 126, y: 600, size: 9 },
    { key: "driver.birth_date", right: 482, y: 573 },
    { key: "driver.phone", right: 304, y: 573, size: 9 },
    { key: "driver.mobile", right: 126, y: 573, size: 9 },
    { key: "driver.address_line", right: 304, y: 544, size: 8 },
    { key: "driver.relation_to_insured", right: 482, y: 519, size: 8 },
    { key: "driver.email", right: 305, y: 514, size: 8 },
    { key: "driver.license_number", right: 126, y: 492, size: 8 },
    { key: "driver.license_date", right: 304, y: 462, size: 8 },
    { key: "driver.license_type", right: 482, y: 457, size: 8 },
    { key: "driver.license_expiry", right: 126, y: 458, size: 8 },

    // ג. פרטי הרכב
    { key: "vehicle.manufacturer", right: 126, y: 400, size: 8 }, // combined "דגם ויצרן" cell
    { key: "vehicle.year", right: 304, y: 400 },
    {
      key: "vehicle.type",
      type: "checkbox",
      options: {
        private: [318, 373],
        commercial: [318, 373],
      },
    },
    { key: "vehicle.plate", right: 482, y: 345 },

    // ד. פרטי התאונה
    { key: "accident.date", right: 482, y: 288 },
    { key: "accident.time", right: 304, y: 288 },
    {
      key: "accident.trip_type",
      type: "checkbox",
      size: 9,
      options: {
        work: [298, 259],
        to_from_work: [298, 259],
        private: [227, 259],
        taxi: [227, 259],
        paid_transport: [227, 259],
      },
    },
    {
      key: "accident.area_type",
      type: "checkbox",
      options: {
        urban: [165, 259],
        intercity: [99, 259],
      },
    },
    { key: "accident.location", right: 482, y: 234, size: 8 },
    {
      key: "accident.police.notified",
      type: "checkbox",
      options: {
        yes: [105, 199],
        no: [60, 199],
      },
    },
    { key: "accident.police.station", right: 304, y: 168, size: 8 },
    { key: "accident.police.log_number", right: 482, y: 168, size: 8 },
    { key: "accident.passengers", right: 126, y: 168, size: 9 },

    // ===== PAGE 2 =====
    { key: "accident.description", page: 1, right: 548, y: 733, size: 9 },

    { key: "damage.insured_vehicle", page: 1, right: 216, y: 504, size: 8 },
    { key: "damage.third_party_vehicle", page: 1, right: 216, y: 475, size: 8 },

    {
      key: "fault",
      type: "checkbox",
      page: 1,
      options: {
        me: [457, 441],
        third_party: [410, 441],
        unknown: [361, 441],
      },
    },

    // ה. פרטי הרכבים המעורבים - צד ג'
    {
      key: "third_parties.0.vehicle_type",
      type: "checkbox",
      page: 1,
      options: {
        private: [497, 356],
        commercial: [497, 356],
      },
    },
    { key: "third_parties.0.vehicle_plate", page: 1, right: 482, y: 299 },
    { key: "third_parties.0.owner_name", page: 1, right: 304, y: 299, size: 8 },
    { key: "third_parties.0.id_number", page: 1, right: 126, y: 299, size: 9 },
    { key: "third_parties.0.phone", page: 1, right: 482, y: 270, size: 9 },
    { key: "third_parties.0.address", page: 1, right: 304, y: 270, size: 8 },
    { key: "third_parties.0.driver_name", page: 1, right: 482, y: 242, size: 8 },
    { key: "third_parties.0.policy_number", page: 1, right: 305, y: 185, size: 8 },
    { key: "third_parties.0.insurer", page: 1, right: 127, y: 185, size: 8 },
    { key: "third_parties.0.agent_name", page: 1, right: 482, y: 185, size: 8 },
    {
      key: "third_parties.0.insurance_type",
      type: "checkbox",
      page: 1,
      options: {
        comprehensive: [451, 155],
        third_party: [408, 155],
        mandatory: [363, 155],
      },
    },

    // האם הינך מאשר לפצות את צד ג' (ייפוי כוח סעיף 68 — declarations.poa_third_party)
    {
      key: "declarations.poa_third_party",
      type: "checkbox",
      page: 1,
      options: {
        yes: [105, 414],
        no: [60, 414],
      },
    },

    // ===== PAGE 3 =====
    // ז. עדים למקרה (2 rows)
    { key: "witnesses.0.name", page: 2, right: 548, y: 670, size: 8 },
    { key: "witnesses.0.address", page: 2, right: 421, y: 670, size: 8 },
    { key: "witnesses.0.phone", page: 2, right: 294, y: 670, size: 8 },
    { key: "witnesses.1.name", page: 2, right: 548, y: 654, size: 8 },
    { key: "witnesses.1.address", page: 2, right: 421, y: 654, size: 8 },
    { key: "witnesses.1.phone", page: 2, right: 294, y: 654, size: 8 },

    // ז. פרטי חשבון הבנק
    { key: "bank_account.bank", page: 2, right: 482, y: 530, size: 8 },
    { key: "bank_account.branch", page: 2, right: 305, y: 530, size: 8 },
    { key: "bank_account.account_number", page: 2, right: 127, y: 502, size: 8 },

    // הצהרה (final declaration)
    { key: "declarations.date", page: 2, right: 482, y: 303 },
    { key: "declarations.signatory_name", page: 2, right: 305, y: 303, size: 8 },
  ],
};

export default aig;
