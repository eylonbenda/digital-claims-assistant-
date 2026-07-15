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
    // Name cell is narrow (blank zone x≈432-490, ~58pt total for BOTH first+last name,
    // unlike the roomier insured-name cell above) — stress-tested 2026-07-13 with long
    // names ("אילון"/"בן דוד"): the old right:489/right:455 default-size anchors collided
    // (last name ran into first name). Shrunk to size 8 and tightened anchors so both
    // fit with margin: first_name right edge pulled in from the cell border (488), last_name
    // anchored with a 3pt gap to its left, still comfortably clear of the "כתובת" label at x=431.
    { key: "driver.first_name", right: 488, y: 731, size: 8 },
    { key: "driver.last_name", right: 470, y: 731, size: 8 },
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
    // Date cell: printed label "תאריך המקרה" sits on the top line (y=596) with a row
    // of DD/MM/YYYY tick marks below it — the value goes on that lower row.
    // Fixed 2026-07-12 — date used to sit ON the label row, overlapping it.
    { key: "accident.date", right: 517, y: 586, size: 8 },
    // Time cell (x≈384-446) is fully occupied both rows by centered labels
    // ("שעת המקרה" / "היום בשבוע" "day of the week") with no blank line — the only
    // clear space is the ~28pt gap left of "המקום" label and right of "שעת" label's
    // left edge (x≈380-408); place the value there on the label's own baseline.
    // Fixed 2026-07-12 — time used to sit right on "שעת המקרה", overlapping it.
    { key: "accident.time", right: 406, y: 596, size: 8 },
    // Location cell (x≈289-403) has the printed label on the top line (y=596);
    // the answer goes on the blank line below the label, inside the same cell
    // (cell bottom border ≈ y=583). Fixed 2026-07-06 — value used to collide with the label.
    { key: "accident.location", right: 400, y: 587, size: 8 },

    // The y=573 line packs three questions (per text dump): תוך כדי עבודה? כן=[350] לא=[323]
    // / מעורבת משאית? כן=[225] לא=[198] (no canonical key) / הסעה בשכר? כן=[91] לא=[65].
    // trip_type originally pointed at the הסעה בשכר circles by mistake — fixed 2026-07-05.
    // Re-centered 2026-07-12: measured circle bbox centers (all on this row: y=575.4,
    // circle w≈5.75/h≈5.5) vs the size-11 default X (w≈7.3/h≈7.9, whose center sat
    // ~1.6pt above the circle) — switched to size 9 (w=6.0/h=6.44) and centered the
    // draw origin (x,y = circle-center minus half glyph w/h) so the X sits inside the O.
    {
      key: "accident.trip_type",
      type: "checkbox",
      size: 9,
      options: {
        work: [351, 572],
        to_from_work: [351, 572],
        private: [324, 572],
        taxi: [324, 572],
        paid_transport: [324, 572],
      },
    },

    // "האם היתה הסעה בשכר? כן ○ לא ○" — same row, right of the trip_type boxes.
    // Re-centered 2026-07-12 (same row/baseline, same circle size as trip_type above;
    // measured circle centers: yes(כן)=94.9, no(לא)=68.1, both cy=575.4).
    {
      key: "accident.is_paid_transport",
      type: "checkbox",
      size: 9,
      options: { yes: [92, 572], no: [65, 572] },
    },

    // "האם הובא לידעת המשטרה" — stacked כן (top)/לא (bottom) circles, cell x≈197-226
    // (to the right of the "רשיונך נפסל?" cell at x≈165-193 — verified no overlap).
    // Glyph circles sit at x=214 (w=7); corrected from [210,594]/[210,584] 2026-07-06.
    {
      key: "accident.police.notified",
      type: "checkbox",
      options: { yes: [214, 595], no: [214, 585] },
    },

    // מי אחראי לארוע התאונה? — glyph checkboxes (empty circle glyphs, d≈5.5, cy=460.7).
    // Re-centered 2026-07-12: default size-11 X (w≈7.3/h≈7.9) overshot the circle —
    // switched to size 8 (w=5.34/h=5.73) and centered on each measured circle center
    // (אני/me=437.2, נהג צד ג'/third_party=401.5, לא יודע/unknown=352.1).
    {
      key: "fault",
      type: "checkbox",
      size: 8,
      options: {
        me: [435, 458],
        third_party: [399, 458],
        unknown: [349, 458],
      },
    },

    // תאור נסיבות המקרה — measured the 5 vector rule lines under the label (2026-07-13):
    // they span x≈277-550, baselines (bottom-based y) ≈ 548.4/536.2/523.8/511.0/497.7
    // (~12.3pt pitch). Line 1 shares its row with the "תאור נסיבות המקרה:" label itself
    // (label occupies x≈476-554), so the wrap width is capped at 474 (not the full 550)
    // on EVERY line — the engine draws all wrapped lines at the same right/width, so this
    // trades a little space on lines 2-5 for guaranteed clearance under the label on line 1.
    // Stress-tested with a ~90-char description: wraps to 2 lines at size 8 well within the
    // 5-line/195pt budget, so maxLines:5 is a generous ceiling for even longer real text.
    { key: "accident.description", right: 474, y: 548, size: 8, width: 195, lineHeight: 12.3, maxLines: 5 },

    // נזקים — תאור הנזקים
    // Single-line cell (no ruled sub-lines): row spans bottom-based y≈410 (bottom border) to
    // 431 (top border, where the "תאור הנזקים..." labels sit at y=421); vertical dividers at
    // x≈31/279/553 confirmed via rule-line scan 2026-07-13. That leaves only ~8pt of clear
    // vertical space between the label and the border — genuinely too tight for 2 comfortable
    // text lines. Stress-tested with a ~100-char damage string: size 7/lineHeight 7.5 still had
    // line 1 crash into the label above (y=418 too close to the y=421 label baseline) or line 2
    // spill past the border. Settled on size 6.5/lineHeight 6.3/y=416.5 — line 1 clears the
    // label, line 2 lands right at the border (y≈410.2), the least-bad compromise for the rare
    // long-text case. Most real damage descriptions (<40 chars) stay on one line and sit
    // comfortably centered in the row.
    // Right column (insured vehicle): x=279-553, right≈546, usable width≈262 (margin off the divider)
    { key: "damage.insured_vehicle", right: 546, y: 416.5, size: 6.5, width: 262, lineHeight: 6.3, maxLines: 2 },
    // Left column (TP vehicle damage): x=31-279, right≈276, usable width≈238
    { key: "damage.third_party_vehicle", right: 276, y: 416.5, size: 6.5, width: 238, lineHeight: 6.3, maxLines: 2 },

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
    // Re-centered 2026-07-12 on the measured circle bbox (d≈11, center 129.5/252.8) —
    // this circle is bigger than the ones below, so the default size-11 X (w=7.3/h=7.9)
    // fits fine once centered.
    {
      key: "injured_persons.0.hospitalized",
      type: "checkbox",
      options: { yes: [126, 249] },
    },

    // "אני ○ מאשר/ת טיפול בתביעת צד ג' בכפוף לתנאי הפוליסה." — single circle,
    // authorizes third-party claim handling; closest match to poa_third_party.
    // Re-centered 2026-07-12: circle bbox center (550.2, 437.8), d≈5.5 — switched to
    // size 8 (w=5.34/h=5.73) to match the small circle, like the fault/trip_type ones.
    {
      key: "declarations.poa_third_party",
      type: "checkbox",
      size: 8,
      options: { yes: [548, 435] },
    },

    // מוסך + שמאי (תחתית הטופס)
    { key: "garage.name", right: 492, y: 62 },
    { key: "garage.phone", right: 383, y: 62, size: 9 },
    { key: "assessor_name", right: 154, y: 62 },
    // "מוסך הסדר: כן ○ לא ○" — same bottom row, right of garage phone/assessor.
    // Re-centered 2026-07-12 on measured circle bboxes (d≈12, cy=60.9;
    // yes/כן center x=262.0, no/לא center x=234.0) with the default size-11 X.
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      options: { yes: [258, 57], no: [230, 57] },
    },
  ],
};

export default menora;
