import type { Template } from "../engine";

// Coordinate map: canonical field -> position on אנקור (Anchor) "טופס תביעה – הודעה על אירוע נזק רכב".
// Source: docs/accidentStatementPdf/אנקור_טופס_הודעה.pdf — 1 page A4, text layer present but
// glyph-fragmented (grouped by y/adjacency to recover labels).
// Grid cells: caption at the top-right, blank band below. `right` = cell right edge minus ~2pt,
// `y` = baseline in the band. Checkboxes are green vector CIRCLES (not squares) placed to the
// LEFT of their label; [x,y] is the X's lower-left = circle centre minus (3, 3.3) at size 9.
//
// SCHEMA GAPS (on the form, no canonical key): claim number, "אי הפעלת הפוליסה" / "נזק עצמי
// וצד ג׳" coverage boxes, insured full-name is one cell (first+last drawn side by side),
// contact person (שם/ת.ז./קרבה/כתובת/טלפון/דוא"ל/חתימה), preferred notification channel,
// vehicle "registered owner", police station/log number, accident diagram, third-party
// vehicle make/model, third-party driver's own id, injuries yes/no (no boolean key), witness
// rows beyond the first two, signature, claimant signatory name.
const anchor: Template = {
  insurer: "אנקור",
  srcFile: "anchor.pdf",
  fields: [
    // Header strip
    { key: "agent_name", right: 457, y: 738, size: 9 },
    // Only own_policy is ticked. On this form "נזק לצד ג׳ בלבד" means OUR insured damaged a third party —
    // not our third_party_* tracks (client claims from the other insurer). Those leave all four
    // circles empty for the clerk; "אי הפעלת הפוליסה" is the likely fit but unconfirmed.
    {
      key: "claim_type",
      type: "checkbox",
      size: 9,
      options: {
        own_policy: [360, 738.7],
      },
    },

    // פרטי המבוטח והפוליסה
    { key: "insured.first_name", right: 482, y: 700, size: 9 },
    { key: "insured.last_name", right: 430, y: 700, size: 9 },
    { key: "insured.id_number", right: 356, y: 700, size: 9 },
    { key: "insured.city", right: 267, y: 700, size: 9 },
    { key: "insured.birth_date", right: 150, y: 700, size: 9 },
    { key: "insured.mobile", right: 484, y: 675, size: 9 },
    { key: "insured.email", right: 355, y: 675, size: 9 },

    // הנהג באירוע
    { key: "driver.first_name", right: 482, y: 650, size: 9 },
    { key: "driver.last_name", right: 430, y: 650, size: 9 },
    { key: "driver.id_number", right: 356, y: 650, size: 9 },
    { key: "driver.address_line", right: 267, y: 650, size: 9 },
    { key: "driver.birth_date", right: 150, y: 650, size: 9 },
    { key: "driver.mobile", right: 484, y: 624, size: 9 },
    { key: "driver.email", right: 355, y: 624, size: 9 },

    // פרטי הרכב המבוטח
    { key: "vehicle.plate", right: 392, y: 505, size: 9 },
    { key: "vehicle.manufacturer", right: 483, y: 505, size: 9 },
    { key: "vehicle.model", right: 440, y: 505, size: 9 },
    { key: "vehicle.year", right: 294, y: 505, size: 9 },

    // פרטי האירוע
    { key: "accident.date", right: 531, y: 460, size: 9 },
    { key: "accident.time", right: 396, y: 460, size: 9 },
    { key: "accident.location", right: 293, y: 460, size: 9 },
    { key: "accident.police.notified", type: "checkbox", size: 9, options: { yes: [163.5, 464.2], no: [115.5, 464.2] } },
    { key: "accident.description", right: 531, y: 420, size: 8, width: 96, lineHeight: 11, maxLines: 11 },
    { key: "damage.insured_vehicle", right: 291, y: 423, size: 7, width: 94, lineHeight: 8, maxLines: 2 },
    { key: "damage.third_party_vehicle", right: 190, y: 423, size: 7, width: 94, lineHeight: 8, maxLines: 2 },
    { key: "fault", type: "checkbox", size: 9, options: { me: [257.5, 318.2], third_party: [207, 318.2] } },

    // פרטי רכבי צד ג׳ מעורבים — vehicle 1
    { key: "third_parties.0.vehicle_plate", right: 531, y: 250, size: 9 },
    { key: "third_parties.0.insurer", right: 291, y: 250, size: 9 },
    { key: "third_parties.0.policy_number", right: 191, y: 250, size: 9 },
    { key: "third_parties.0.owner_name", right: 531, y: 218, size: 9 },
    { key: "third_parties.0.address", right: 424, y: 218, size: 9 },
    { key: "third_parties.0.phone", right: 292, y: 218, size: 9 },
    { key: "third_parties.0.agent_name", right: 191, y: 218, size: 9 },
    // vehicle 2
    { key: "third_parties.1.vehicle_plate", right: 531, y: 186, size: 9 },
    { key: "third_parties.1.insurer", right: 291, y: 186, size: 9 },
    { key: "third_parties.1.policy_number", right: 191, y: 186, size: 9 },
    { key: "third_parties.1.owner_name", right: 531, y: 154, size: 9 },
    { key: "third_parties.1.address", right: 424, y: 154, size: 9 },
    { key: "third_parties.1.phone", right: 292, y: 154, size: 9 },
    { key: "third_parties.1.agent_name", right: 191, y: 154, size: 9 },

    // עדים
    { key: "witnesses.0.name", right: 404, y: 126, size: 8.5 },
    { key: "witnesses.0.address", right: 281, y: 126, size: 8.5 },
    { key: "witnesses.0.phone", right: 174, y: 126, size: 8.5 },
    { key: "witnesses.1.name", right: 404, y: 112, size: 8.5 },
    { key: "witnesses.1.address", right: 281, y: 112, size: 8.5 },
    { key: "witnesses.1.phone", right: 174, y: 112, size: 8.5 },

    // Declaration
    { key: "declarations.date", right: 419, y: 78, size: 8 },
    { key: "declarations.data_consent", type: "checkbox", size: 9, options: { yes: [274.5, 71.7] } },
  ],
};

export default anchor;
