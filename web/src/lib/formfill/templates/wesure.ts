import type { Template } from "../engine";

// Coordinate map: canonical field -> position on ווישור (WeSure) "הודעה על מקרה ביטוח - רכב".
// Source: docs/accidentStatementPdf/ווישור_טופס_הודעה.pdf — 3 pages A4, text layer present.
//   page 0: header (agent/plate/policy), 1 סוג מקרה, 2 בעל הפוליסה, 3 הנהג, 4 הרכב, 5 פרטי התאונה
//   page 1: מי אחראי + אישורים, 5 מוקדי נזק (insured), 6/7 צד ג׳ 1 and 2, 8 מוקדי נזק (צד ג׳)
//   page 2: 9 עדים (3 rows), פרטי מוסך, declaration (date / name / ID / signature)
// Cells have the caption at the top-right and a blank band below (or to the left of a two-line
// caption). `right` = caption's right edge minus ~2pt. Checkbox squares sit to the RIGHT of
// their labels; [x,y] is the X's lower-left = box centre minus (3, 3.3) at size 9.
// ID cells are per-digit combs but the engine has no letter-spacing, so IDs are right-anchored
// at the comb's right edge (digits do not land in individual cells).
//
// SCHEMA GAPS (on the form, no canonical key): סוג מקרה (1), insured work phone, vehicle
// "registered owner" / "pledged to", entrance/floor/PO box, driver licence-revoked yes/no (x2),
// day of week, street/road/area of accident, visibility, damage-spot boxes (קידמי/אחורי/ימני/
// שמאלי), deductible-charge consent, fault reasoning (נימוק), third-party vehicle make/model/
// year/colour, third-party driver's own id/address/phone, third-party insurance_type (no box),
// witness relation, claim number, declaration ID number.
const wesure: Template = {
  insurer: "ווישור",
  srcFile: "wesure.pdf",
  fields: [
    // ── Page 0 ─────────────────────────────────────────────────────────────
    { key: "agent_name", right: 553, y: 731, size: 9 },
    { key: "vehicle.plate", right: 356, y: 731, size: 9 },
    { key: "policy_number", right: 553, y: 705, size: 9 },

    // 2. פרטי בעל הפוליסה
    { key: "insured.last_name", right: 553, y: 603, size: 9 },
    { key: "insured.first_name", right: 364, y: 603, size: 9 },
    { key: "insured.id_number", right: 163, y: 602, size: 9 },
    { key: "insured.phone", right: 520, y: 577, size: 9 },
    { key: "insured.mobile", right: 340, y: 577, size: 9 },
    { key: "insured.city", right: 553, y: 546, size: 9 }, // wizard collects city only
    { key: "insured.street", right: 429, y: 546, size: 9 },
    { key: "insured.house_no", right: 310, y: 546, size: 9 },
    { key: "insured.postal_code", right: 165, y: 546, size: 9 },

    // 3. פרטי הנהג
    { key: "driver.last_name", right: 553, y: 499, size: 9 },
    { key: "driver.first_name", right: 354, y: 499, size: 9 },
    { key: "driver.birth_date", right: 139.5, y: 500, size: 9 },
    { key: "driver.id_number", right: 548, y: 469, size: 9 },
    { key: "driver.phone", right: 378, y: 478, size: 9 },
    { key: "driver.mobile", right: 242, y: 478, size: 9 },
    { key: "driver.address_line", right: 553, y: 441, size: 8.5 },
    { key: "driver.relation_to_insured", right: 505, y: 417, size: 8.5 },
    { key: "driver.email", right: 428, y: 418, size: 8.5 },
    { key: "driver.license_number", right: 134, y: 417, size: 9 },
    { key: "driver.license_type", right: 520, y: 389, size: 9 },
    { key: "driver.license_expiry", right: 378.5, y: 392, size: 9 },
    { key: "driver.license_date", right: 120, y: 391, size: 9 },

    // 4. פרטי הרכב
    { key: "vehicle.year", right: 364, y: 340, size: 9 },
    { key: "vehicle.manufacturer", right: 207, y: 340, size: 9 },
    { key: "vehicle.model", right: 140, y: 340, size: 9 },
    { key: "vehicle.type", type: "checkbox", page: 0, size: 9, options: { private: [354, 314.7], commercial: [319, 314.7], truck: [239, 314.7], tractor: [239, 314.7], scooter: [138, 314.7], motorcycle: [138, 314.7] } },

    // 5. פרטי התאונה
    { key: "accident.date", right: 481.5, y: 266, size: 9 },
    { key: "accident.time", right: 363, y: 266, size: 9 },
    { key: "accident.location", right: 553, y: 235, size: 9 },
    { key: "accident.police.notified", type: "checkbox", size: 9, options: { yes: [278, 209.7], no: [249, 209.7] } },
    { key: "accident.police.log_number", right: 191, y: 210, size: 8.5 },
    { key: "accident.police.station", right: 489, y: 195, size: 9 },
    { key: "accident.passengers", right: 214, y: 195, size: 9 },
    { key: "accident.description", right: 508, y: 167, size: 9, width: 464, lineHeight: 16, maxLines: 3 },

    // ── Page 1 ─────────────────────────────────────────────────────────────
    { key: "fault", type: "checkbox", page: 1, size: 9, options: { me: [430, 791.7], third_party: [400, 791.7], unknown: [352, 791.7] } },
    { key: "declarations.poa_third_party", type: "checkbox", page: 1, size: 9, options: { yes: [540, 775.7] } },
    { key: "damage.insured_vehicle", page: 1, right: 364, y: 713, size: 8 },
    { key: "damage.third_party_vehicle", page: 1, right: 364, y: 187, size: 8 },

    // צד ג׳ 1
    { key: "third_parties.0.vehicle_type", type: "checkbox", page: 1, size: 9, options: { private: [507, 516.7], commercial: [471, 516.7], tractor: [388, 516.7], truck: [388, 516.7], scooter: [284, 516.7], motorcycle: [284, 516.7] } },
    { key: "third_parties.0.vehicle_plate", page: 1, right: 422, y: 488, size: 9 },
    { key: "third_parties.0.owner_name", page: 1, right: 522, y: 466, size: 8.5 },
    { key: "third_parties.0.address", page: 1, right: 400, y: 466, size: 8.5 },
    { key: "third_parties.0.id_number", page: 1, right: 273, y: 462, size: 9 },
    { key: "third_parties.0.phone", page: 1, right: 115, y: 466, size: 8.5 },
    { key: "third_parties.0.driver_name", page: 1, right: 553, y: 433, size: 9 },
    { key: "third_parties.0.policy_number", page: 1, right: 553, y: 405, size: 9 },
    { key: "third_parties.0.agent_name", page: 1, right: 422, y: 405, size: 8.5 },
    { key: "third_parties.0.insurer", page: 1, right: 117, y: 408, size: 8 },

    // צד ג׳ 2
    { key: "third_parties.1.vehicle_type", type: "checkbox", page: 1, size: 9, options: { private: [507, 356.7], commercial: [471, 356.7], tractor: [388, 356.7], truck: [388, 356.7], scooter: [284, 356.7], motorcycle: [284, 356.7] } },
    { key: "third_parties.1.vehicle_plate", page: 1, right: 422, y: 328, size: 9 },
    { key: "third_parties.1.owner_name", page: 1, right: 522, y: 306, size: 8.5 },
    { key: "third_parties.1.address", page: 1, right: 400, y: 306, size: 8.5 },
    { key: "third_parties.1.id_number", page: 1, right: 273, y: 302, size: 9 },
    { key: "third_parties.1.phone", page: 1, right: 115, y: 306, size: 8.5 },
    { key: "third_parties.1.driver_name", page: 1, right: 553, y: 273, size: 9 },
    { key: "third_parties.1.policy_number", page: 1, right: 553, y: 245, size: 9 },
    { key: "third_parties.1.agent_name", page: 1, right: 422, y: 245, size: 8.5 },
    { key: "third_parties.1.insurer", page: 1, right: 117, y: 248, size: 8 },

    // ── Page 2 ─────────────────────────────────────────────────────────────
    // 9. עדים
    { key: "witnesses.0.name", page: 2, right: 553, y: 751, size: 8.5 },
    { key: "witnesses.0.address", page: 2, right: 414, y: 751, size: 8.5 },
    { key: "witnesses.0.phone", page: 2, right: 287, y: 751, size: 8.5 },
    { key: "witnesses.1.name", page: 2, right: 553, y: 734, size: 8.5 },
    { key: "witnesses.1.address", page: 2, right: 414, y: 734, size: 8.5 },
    { key: "witnesses.1.phone", page: 2, right: 287, y: 734, size: 8.5 },
    { key: "witnesses.2.name", page: 2, right: 553, y: 717, size: 8.5 },
    { key: "witnesses.2.address", page: 2, right: 414, y: 717, size: 8.5 },
    { key: "witnesses.2.phone", page: 2, right: 287, y: 717, size: 8.5 },
    // פרטי מוסך
    { key: "garage.name", page: 2, right: 466, y: 670, size: 9 },
    { key: "garage.phone", page: 2, right: 334, y: 670, size: 9 },
    { key: "garage.is_arrangement", type: "checkbox", page: 2, size: 9, options: { yes: [196, 666.7], no: [167, 666.7] } },
    { key: "assessor_name", page: 2, right: 113, y: 670, size: 9 },
    // Declaration
    { key: "declarations.date", page: 2, right: 512, y: 469, size: 9 },
    { key: "declarations.signatory_name", page: 2, right: 434, y: 469, size: 9 },
  ],
};
export default wesure;
