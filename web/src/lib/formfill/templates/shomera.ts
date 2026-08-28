import type { Template } from "../engine";

// Coordinate map: canonical field -> position on שומרה (Shomera) accident-notice form
// ("טופס תביעה מקרה ביטוח לרכב"). Source: docs/accidentStatementPdf/שומרה_טופס_הודעה.pdf
// (1 page). This form is a dense grid of single-line dashed cells; most captions sit at the
// cell's right edge with the write-in dashes to its left (lower x) — same convention as
// menora/migdal. A few cells (email, insurer-name in the third-party block) place the caption
// UNDER a second, lower input line instead of sharing the caption's baseline — noted inline.
// Checkboxes are small vector squares (via boxdetect.mjs), not glyph boxes.
const shomera: Template = {
  insurer: "שומרה",
  srcFile: "shomera.pdf",
  fields: [
    // פרטי המבוטח והפוליסה
    // Comb ticks for this cell sit low, right against the row's bottom border (bottom-origin
    // y≈733.9-747.6) — baseline raised into the blank band above them, clear of the ticks.
    { key: "insured.id_number", right: 440, y: 748, size: 8 },
    { key: "insured.full_name", right: 494, y: 735, size: 8 }, // single "שם המבוטח" cell, no split first/last
    { key: "insured.address_line", right: 160, y: 736, size: 8 },
    { key: "insured.mobile", right: 409, y: 726, size: 8 }, // single "מס' טלפון / נייד" cell
    // Caption sits above the actual input line (marked by a pre-printed "@" hint at y≈706).
    // right pulled well clear of the printed "@" glyph (x=102) so the value's own "@" doesn't
    // collide with it.
    { key: "insured.email", right: 260, y: 706, size: 7 },
    { key: "policy_number", right: 220, y: 697, size: 8 },
    {
      key: "insurance_type",
      type: "checkbox",
      size: 7,
      options: { comprehensive: [102, 700], third_party: [102, 691], mandatory: [102, 682] },
    },
    // Very short row (~4pt blank band above the comb ticks, right under the row's top
    // border) — sized down hard to clear both the border above and the ticks below.
    // Straddles the dashed comb ticks like the other comb fields — legibility over purity
    // (a tick-clearing position only fits at ~4pt, which is unreadable).
    { key: "agent_name", right: 488, y: 688, size: 6.5 },

    // פרטי הרכב
    // Comb ticks run most of the row height; raised into the ~6.5pt blank band just below
    // the section header / row-top border, sized down so ascenders stay clear of it.
    { key: "vehicle.plate", right: 546, y: 653, size: 7 },
    { key: "vehicle.model", right: 304, y: 640, size: 8 }, // שם יצרן הרכב והדגם (combined cell)
    // סוג רכב: פרטי / מסחרי — "אחר" has no matching canonical VehicleType, left unmapped.
    {
      key: "vehicle.type",
      type: "checkbox",
      size: 7,
      options: { private: [219, 642], commercial: [187, 642] },
    },

    // פרטי הנהג
    { key: "driver.full_name", right: 496, y: 594, size: 8 },
    // Comb ticks sit low in this cell (bottom-origin y≈606-619); raised into the blank band
    // right under the "פרטי הנהג" section header, clear of them.
    { key: "driver.id_number", right: 428, y: 612, size: 8 },
    { key: "driver.relation_to_insured", right: 224, y: 594, size: 8 }, // הקשר לבעל הרכב
    // Narrow leftmost cell in this row (shares the row with name/ת"ז/הקשר לבעל הרכב) — much
    // less width than the insured's dedicated address row above, so shrunk hard to stay clear
    // of the table's left border instead of overflowing past the page edge.
    { key: "driver.address_line", right: 99, y: 594, size: 6.5 },
    { key: "driver.mobile", right: 515, y: 583, size: 8 }, // מס' טלפון / נייד
    { key: "driver.birth_date", right: 418, y: 575, size: 7 }, // תאריך לידה של הנהג (3-line label)
    { key: "driver.license_number", right: 326, y: 573, size: 8 }, // מס' רישיון
    // רשיון נהיגה ישראלי / זר — stacked pair of small squares at the same x.
    {
      key: "driver.license_origin",
      type: "checkbox",
      size: 7,
      options: { israeli: [126, 583], foreign: [126, 573] },
    },

    // פרטי האירוע
    { key: "accident.date", right: 546, y: 521, size: 8 },
    { key: "accident.time", right: 433, y: 521, size: 8 },
    // כתובת מקום האירוע — this cell's caption sits at the BOTTOM of a taller block (y=521);
    // there's a wide blank strip above it (row spans up to the "פרטי האירוע" header, ~y=545),
    // clear of both the police checkboxes (x<199) and the יום/שעה/תאריך columns (x>353).
    { key: "accident.location", right: 349, y: 536, size: 8 },
    {
      key: "accident.police.notified",
      type: "checkbox",
      size: 7,
      options: { yes: [180, 521], no: [148, 521] },
    },
    { key: "accident.police.station", right: 65, y: 521, size: 8 },
    // תיאור האירוע box: 4 ruled lines measured by pixel-scanning the rendered blank PDF at
    // bottom-based y = 499.7 / 481.4 / 461.0 / 441.75 (box top border at 518.9, spans x≈306-576).
    // Baseline set 1-2pt above each rule so text sits ON the line instead of floating above it.
    {
      key: "accident.description",
      right: 528,
      y: 501,
      size: 8,
      width: 215,
      lineHeight: 19,
      maxLines: 4,
    },
    // תאור הנזקים ברכב צד ג' — single description cell near the accident diagrams (not tied
    // to a specific third_parties[] entry), matches the top-level damage.third_party_vehicle.
    // No matching cell exists for the insured's own vehicle damage (diagram-only there).
    {
      key: "damage.third_party_vehicle",
      right: 305,
      y: 449,
      size: 8,
      width: 260,
      lineHeight: 10,
      maxLines: 3,
    },

    // פרטי טיפול בנזק
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      size: 7,
      options: { yes: [542, 372], no: [508, 372] },
    },
    { key: "garage.name", right: 454, y: 373, size: 8 },
    { key: "assessor_name", right: 317, y: 373, size: 8 },

    // פרטי צד ג'
    // driver_name / owner_name captions sit at the BOTTOM of their row (like כתובת מקום
    // האירוע above) — write the value in the blank strip above the caption, not beside it.
    { key: "third_parties.0.driver_name", right: 458, y: 324, size: 8 },
    { key: "third_parties.0.phone", right: 228, y: 330, size: 8 },
    // Comb ticks start well below the row's top border here — plenty of headroom (~14pt),
    // raised well clear of them.
    { key: "third_parties.0.vehicle_plate", right: 125, y: 327, size: 8 }, // מס' רישוי
    { key: "third_parties.0.owner_name", right: 473, y: 299, size: 8 },
    { key: "third_parties.0.id_number", right: 395, y: 286, size: 8 }, // owner's ת"ז
    {
      key: "third_parties.0.insurance_type",
      type: "checkbox",
      size: 7,
      options: { comprehensive: [132, 305], third_party: [132, 297], mandatory: [132, 289] },
    },
    // שם חברת הביטוח — very narrow column: caption ("שם חברת הביטוח") occupies almost the
    // full width at y=287, and the מקיף/צד ג'/חובה checkbox labels start at x=110. Write the
    // value just above the caption and left of the checkboxes to clear both.
    { key: "third_parties.0.insurer", right: 106, y: 298, size: 7 },

    // הרשאה לביצוע העברה בנקאית
    { key: "bank_account.bank", right: 225, y: 230, size: 8 },
    { key: "bank_account.branch", right: 88, y: 230, size: 8 },
    // Straddles the comb ticks (like agent_name) — the tick-free band only fits ~5.5pt.
    { key: "bank_account.account_number", right: 549, y: 217, size: 7 }, // מספר חשבון

    // הצהרת המבוטח — single check-to-consent boxes (unchecked = false, no "no" box on form).
    {
      key: "declarations.data_consent",
      type: "checkbox",
      size: 7,
      options: { yes: [380, 128] },
    },
    {
      key: "declarations.poa_third_party",
      type: "checkbox",
      size: 7,
      options: { yes: [567, 128] },
    },
    { key: "declarations.date", right: 519, y: 73, size: 8 },
    { key: "declarations.signatory_name", right: 314, y: 73, size: 8 }, // שם ושם משפחה
    // חתימה — separate signature-line cell left of the name (ClaimData has no signature-image
    // field; same convention as ayalon.ts, harel.ts etc. — the typed name stands in for the
    // handwritten signature on the signature line).
    { key: "declarations.signatory_name", right: 163, y: 72, size: 8 },
  ],
};

export default shomera;
