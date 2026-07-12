import type { Template } from "../engine";

// Coordinate map: canonical field -> position on הכשרה (Hachshara).
// Checkboxes are symbol glyphs ("7"); positions from text extraction (coords.mjs).
// Page index: 0 = page 1 (insured / driver / accident / third-party),
//             1 = page 2 (extra third-party rows / witnesses / injured persons / signatures).
//
// SCHEMA GAP: vehicle.manufacturer and vehicle.year are NOT present in הכשרה's
// insured-vehicle section (the form only has plate, date, time, location for the
// insured vehicle). "שנת ייצור" and "סוג ודגם" appear only in the THIRD-PARTY rows.
const hachshara: Template = {
  insurer: "הכשרה",
  srcFile: "hachshara.pdf",
  fields: [
    // ── Header ─────────────────────────────────────────────────────────────
    { key: "agent_name", right: 505, y: 708 },
    { key: "policy_number", right: 250, y: 708 },
    {
      key: "claim_type",
      type: "checkbox",
      options: {
        own_policy: [380, 677],
        third_party_report: [310, 677],
        third_party_settlement: [242, 677],
      },
    },
    // "בהסדר מוסכים" כן/לא — same row as סוג תביעה, left of "אי הגשת תביעה".
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      options: { yes: [245, 676], no: [200, 676] },
    },

    // ── א. פרטי המבוטח ──────────────────────────────────────────────────────
    { key: "insured.first_name", right: 455, y: 645 },
    { key: "insured.last_name", right: 300, y: 645 },
    { key: "insured.id_number", right: 163, y: 645, size: 9 },
    // Single address cell — map city (wizard-collected) here; address_line dropped
    // to avoid collision with insured.city.
    { key: "insured.city", right: 488, y: 617 },
    { key: "insured.mobile", right: 455, y: 590 },
    { key: "insured.email", right: 175, y: 590, size: 9 },

    // ── ב. פרטי הנהג ────────────────────────────────────────────────────────
    { key: "driver.first_name", right: 455, y: 558 },
    { key: "driver.last_name", right: 300, y: 558 },
    { key: "driver.id_number", right: 163, y: 558, size: 9 },
    { key: "driver.address_line", right: 488, y: 530 },
    { key: "driver.relation_to_insured", right: 455, y: 503 },
    { key: "driver.birth_date", right: 330, y: 503 },
    { key: "driver.license_number", right: 218, y: 503 },
    { key: "driver.license_date", right: 100, y: 503 },

    // ── ג. פרטי האירוע ──────────────────────────────────────────────────────
    { key: "vehicle.plate", right: 445, y: 470 },
    { key: "accident.date", right: 230, y: 470 },
    { key: "accident.time", right: 110, y: 470 },
    { key: "accident.location", right: 445, y: 443 },
    { key: "assessor_name", right: 235, y: 443 },
    { key: "garage.name", right: 470, y: 416 },
    { key: "garage.address", right: 300, y: 416 },
    { key: "garage.phone", right: 130, y: 416 },
    // תאור כללי של הנזק הנגרם לרכב המבוטח — first line
    { key: "damage.insured_vehicle", right: 488, y: 386 },

    // ── תאור המקרה (right column, 4 blank lines) ────────────────────────────
    // First line only — long text will overflow naturally into it
    { key: "accident.description", right: 555, y: 337, size: 9 },

    // ── מי אשם + המקרה אירע ─────────────────────────────────────────────────
    {
      key: "fault",
      type: "checkbox",
      options: { me: [451, 256], third_party: [416, 256], unknown: [370, 256] },
    },
    // המקרה אירע: the form has 3 work-related boxes only.
    // 'private', 'paid_transport', 'taxi' have no checkbox on this form — nothing is
    // marked when those values are set, which is the correct behaviour.
    {
      key: "accident.trip_type",
      type: "checkbox",
      options: {
        to_from_work: [263, 260],
        work: [196, 260],
      },
    },

    // ── פרטים נוספים צד ג' — first third-party row (page 1 bottom) ─────────
    { key: "third_parties.0.vehicle_plate", right: 490, y: 222 },
    { key: "third_parties.0.driver_name", right: 468, y: 168 },
    { key: "third_parties.0.owner_name", right: 468, y: 140 },
    { key: "third_parties.0.insurer", right: 360, y: 113 },
    { key: "third_parties.0.policy_number", right: 490, y: 113 },
    // "הניתנה הודעה למשטרה" כן/לא (same row as TP insurer/policy #, just below).
    {
      key: "accident.police.notified",
      type: "checkbox",
      options: { yes: [186, 109], no: [149, 109] },
    },

    // ── Page 2: עדים ────────────────────────────────────────────────────────
    { key: "witnesses.0.name", page: 1, right: 468, y: 435 },
    { key: "witnesses.0.address", page: 1, right: 290, y: 435 },
    { key: "witnesses.0.phone", page: 1, right: 130, y: 435 },

    // ── Page 2: נפגעי גוף — first row ───────────────────────────────────────
    { key: "injured_persons.0.name", page: 1, right: 510, y: 365 },
    { key: "injured_persons.0.address", page: 1, right: 380, y: 365 },
    { key: "injured_persons.0.age", page: 1, right: 270, y: 365 },
    { key: "injured_persons.0.id_number", page: 1, right: 215, y: 365 },
    { key: "injured_persons.0.injury_nature", page: 1, right: 115, y: 365 },

    // ── Page 2: תאריך חתימה ─────────────────────────────────────────────────
    { key: "declarations.date", page: 1, right: 517, y: 272, size: 9 },
  ],
};

export default hachshara;
