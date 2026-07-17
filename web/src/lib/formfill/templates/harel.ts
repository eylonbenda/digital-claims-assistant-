import type { Template } from "../engine";

// Coordinate map: canonical field -> position on הראל (Harel) accident-notice form.
// Source: docs/accidentStatementPdf/הראל_טופס_הודעה.pdf (2 pages; page 2 is a privacy notice
// with no fillable fields). Checkboxes on this form are drawn as glyphs (☐) immediately to the
// right (higher x, in front of, in RTL reading order) of each option's label — centre ≈ label's
// right-edge x + ~5.3pt, calibrated against the vector-square notification checkboxes at the
// bottom of page 1 and cross-checked visually. All ID/date/plate cells are per-digit grid boxes
// on the source PDF; per menora/migdal precedent we fill them as a single right-anchored text run.
const harel: Template = {
  insurer: "הראל",
  srcFile: "harel.pdf",
  fields: [
    // א. פרטי המבוטח והפוליסה
    { key: "agent_name", right: 231, y: 731, size: 9 },
    { key: "insurance_type", right: 355, y: 731, size: 8 }, // free-text cell -> Hebrew via labels
    { key: "policy_number", right: 503, y: 731, size: 9 },

    { key: "vehicle.year", right: 95, y: 711, size: 9 },
    { key: "vehicle.model", right: 300, y: 711, size: 8 }, // תוצר ודגם (manufacturer+model cell)
    { key: "vehicle.plate", right: 515, y: 711, size: 9 },

    // מס' ת.ז. is a 9-digit grid cell (right edge 400); ticks sit just below the label line.
    { key: "insured.id_number", right: 397, y: 681, size: 8 },
    { key: "insured.first_name", right: 504, y: 691, size: 8 },
    { key: "insured.last_name", right: 460, y: 691, size: 8 },
    // vehicle.type — free-text cell would collide with the checkbox glyphs on this row, so map
    // as checkbox instead (private/commercial only — "אחר" has no canonical VehicleType value)
    {
      key: "vehicle.type",
      type: "checkbox",
      size: 8,
      options: {
        private: [262, 681],
        commercial: [230, 681],
      },
    },

    { key: "insured.street", right: 531, y: 669, size: 9 },
    { key: "insured.house_no", right: 324, y: 669, size: 9 },
    { key: "insured.city", right: 278, y: 669, size: 8 },
    { key: "insured.postal_code", right: 60, y: 669, size: 8 },

    { key: "insured.phone", right: 513, y: 649, size: 9 },
    { key: "insured.mobile", right: 360, y: 649, size: 9 },

    { key: "insured.email", right: 496, y: 629, size: 8 },

    // ב. פרטי הנהג
    // שם הנהג is a single blank cell (x≈301-517, ~216pt wide) with no separate last-name
    // column, unlike the insured row above — use the synthetic .full_name key (engine.ts)
    // to join first+last rather than dropping the surname.
    { key: "driver.full_name", right: 517, y: 592, size: 8 },
    // מס' ת.ז. / תאריך לידה are per-digit grid cells (right edges 301 / 165); label sits on the
    // row's top line (y=592), the digit boxes are lower (y≈580) — offset down to avoid collision.
    { key: "driver.id_number", right: 297, y: 580, size: 8 },
    { key: "driver.birth_date", right: 162, y: 580, size: 8 },

    { key: "driver.address_line", right: 531, y: 571, size: 8 }, // רחוב cell (single free-text line)
    { key: "driver.phone", right: 514, y: 551, size: 9 },
    { key: "driver.mobile", right: 247, y: 551, size: 9 },

    // These cells' labels occupy most of the cell width, so the answer is written to the
    // label's left (same pattern as accident.location below).
    { key: "driver.license_number", right: 493, y: 531, size: 8 },
    { key: "driver.license_type", right: 339, y: 531, size: 8 },
    // Cell (grid x=225.3-301.1, y=518.3-539.4) is tall — the label "שנת הוצאת רישיון" sits on the
    // top line (y=531) and occupies almost the full cell width there, but the cell has clear blank
    // room below the label down to the bottom border. Drop the date to that blank lower line
    // (y=521) instead of squeezing it beside the label — fully clear of "נהיגה" now.
    { key: "driver.license_date", right: 299, y: 521, size: 8 },
    // בתוקף עד -  (cell grid: x=135.2-225.3, label "בתוקף עד -" occupies its right portion 180-222,
    // leaving ~45pt clear at x=135-176 — wide enough for a full date at normal size, unlike the
    // narrow license_date cell to its right).
    { key: "driver.license_expiry", right: 176, y: 531, size: 8 },

    // ג. פרטי התאונה
    { key: "accident.date", right: 526, y: 492, size: 9 },
    { key: "accident.time", right: 355, y: 492, size: 9 },
    // location cell spans x=28-274; label "מקום/כתובת אתר התאונה" sits at its right portion
    // (169-271), so the answer must be written to the label's left with a clear gap.
    { key: "accident.location", right: 160, y: 492, size: 8 },

    { key: "accident.police.station", right: 409, y: 473, size: 8 },
    { key: "accident.police.log_number", right: 344, y: 473, size: 8 },

    // תיאור הנזק / מיקום הנזק ברכב המבוטח — single blank row (label sits top-right at
    // y≈453, cell spans left border x≈25 to the label at x≈410, bottom border y≈430).
    // One line normally fits, but wrap as a safety net for longer damage descriptions —
    // 2 lines max (445/435) to stay clear of the y≈430 bottom border.
    {
      key: "damage.insured_vehicle",
      right: 407,
      y: 445,
      size: 8,
      width: 380,
      lineHeight: 10,
      maxLines: 2,
    },

    // המקרה אירע — trip-type glyph checkboxes, y=260. This form only offers work-related options
    // (to/during/from work); private/taxi/paid_transport have no matching box and are left
    // unmapped rather than forced onto an unrelated option.
    {
      key: "accident.trip_type",
      type: "checkbox",
      size: 8,
      options: {
        to_from_work: [220, 261],
        work: [165, 261],
      },
    },

    // תיאור מפורט של התאונה — free-text area right of the diagram box has 3 dotted ruled
    // lines (y≈400/390/380, 10pt apart), spanning x≈310 (diagram's right border) to the
    // table's right edge (548). Wrap long descriptions across the 3 lines rather than
    // overflowing into/past the diagram, shrinking the font if it still doesn't fit.
    {
      key: "accident.description",
      right: 548,
      y: 401,
      size: 8,
      width: 236,
      lineHeight: 10,
      maxLines: 3,
    },

    // עדים — witness 1 / witness 2 (name / phone rows share a baseline; address on the row below)
    { key: "witnesses.0.name", right: 510, y: 345, size: 8 },
    { key: "witnesses.0.phone", right: 393, y: 345, size: 8 },
    { key: "witnesses.0.address", right: 500, y: 325, size: 8 },
    { key: "witnesses.1.name", right: 510, y: 305, size: 8 },
    { key: "witnesses.1.phone", right: 393, y: 305, size: 8 },
    { key: "witnesses.1.address", right: 500, y: 285, size: 8 },

    { key: "garage.name", right: 396, y: 265, size: 8 },
    { key: "assessor_name", right: 529, y: 265, size: 8 },

    // ד. פרטי המעורב - צד ג'
    { key: "third_parties.0.vehicle_plate", right: 513, y: 228, size: 9 },
    // סוג הרכב (light / heavy>4t) — mapped onto private/truck, the closest canonical values
    {
      key: "third_parties.0.vehicle_type",
      type: "checkbox",
      size: 8,
      options: {
        private: [344, 224],
        truck: [303, 224],
      },
    },
    // סוג ביטוח: מקיף / צד ג' / חובה — same row, glyph boxes right of each label (label right-edge + ~2pt)
    {
      key: "third_parties.0.insurance_type",
      type: "checkbox",
      size: 8,
      options: {
        comprehensive: [112, 224],
        third_party: [79, 224],
        mandatory: [50, 224],
      },
    },

    // owner row: id_number is a 9-digit grid (cell 253-391); ticks sit just below the label (y=208).
    // Other cells' labels occupy most of the cell width, so answers are written to the label's left.
    { key: "third_parties.0.owner_name", right: 498, y: 208, size: 8 },
    { key: "third_parties.0.id_number", right: 388, y: 200, size: 8 },
    { key: "third_parties.0.address", right: 224, y: 208, size: 8 },
    { key: "third_parties.0.phone", right: 84, y: 208, size: 8 },

    // driver row: shares the same grid geometry, one line lower (label y=188, ticks y≈180)
    { key: "third_parties.0.driver_name", right: 518, y: 188, size: 8 },

    { key: "third_parties.0.insurer", right: 482, y: 169, size: 8 },
    { key: "third_parties.0.policy_number", right: 337, y: 169, size: 8 },
    // תיאור הנזק / מיקום הנזק לצד ג' — narrow cell (x≈25-134, ~109pt wide, label at top
    // y=169, cell floor y≈160): wrap to 2 lines for longer damage descriptions.
    {
      key: "third_parties.0.damage_description",
      right: 134,
      y: 169,
      size: 8,
      width: 105,
      lineHeight: 9,
      maxLines: 2,
    },

    // ה. הצהרת המבוטח — "הנני מעוניין כי תביעת צד ג'... יטופל ע"י החברה" כן/לא (y=131).
    // Engine checkboxes match boolean values via yes/no option keys.
    // Box order on this form is (RTL) ...החברה [לא] [כן]: the לא box is the rightmost
    // (higher x=295), the כן box is left of it (x=274). Fixed 2026-07-14 — the two were
    // swapped, so poa_third_party=true (client authorized handling) marked לא. Verified by
    // render: yes now lands in the כן box.
    {
      key: "declarations.poa_third_party",
      type: "checkbox",
      size: 8,
      options: {
        yes: [274, 131],
        no: [295, 131],
      },
    },
    // Both cells are dotted fill-in lines whose dots sit right at/just above the label baseline
    // (y=81) — text drawn at that same y lands on top of the dots. Lift 4pt above the line.
    { key: "declarations.date", right: 524, y: 85, size: 8 },
    // right pulled in from 178 to clear a small pen-icon glyph at x≈173-176 just left of the
    // "חתימת המבוטח/ת" label (183).
    { key: "declarations.signatory_name", right: 168, y: 85, size: 8 },
  ],
};

export default harel;
