import type { Template } from "../engine";

// Coordinate map: canonical field -> position on הפניקס (Phoenix) accident-notice form.
// Source PDF: docs/accidentStatementPdf/הפניקס_טופס_תאונה.pdf (2 pages).
//
// IMPORTANT: this PDF's embedded text layer uses a broken/custom glyph encoding — extracted
// text is garbage. All coordinates below were authored VISUALLY: rendering the blank source at
// high DPI (mupdf render.mjs) plus a custom coordinate-grid overlay (pdf-lib, red ruler lines
// every 20pt with axis labels) to read cell edges and label positions by eye, then cross-checked
// against raw glyph x/y anchors from coords.mjs (positions are reliable even though the decoded
// characters are not) and vector-circle centers from boxdetect.mjs for every checkbox.
//
// Page index: 0 = page 1 (header / insured / driver / vehicle / accident basics + description +
//                          damage + third-party-with-insurance + 2 more third-party rows +
//                          fault + witnesses),
//             1 = page 2 (injured persons x3 / work-related yes-no questions / witnesses (dup) /
//                          bank account / mailing address for refund).
//
// SCHEMA GAPS (present on form, no canonical key):
//  - Top incident-type checkboxes (תאונה / גניבת רכב / רדיו טייפ / מק אש / אחר) — a different
//    taxonomy from ClaimData.claim_type (own_policy/third_party_report/settlement/unknown, which
//    is about who pays); no canonical field for "incident category". Left unmapped.
//  - "מס' תביעה" (insurer's internal claim number) — no canonical key.
//  - "אמדן ראשוני/דוח שמאי ... כתובת/פקס/דוא"ל" delivery-method checkboxes — no canonical key.
//  - "טלפון לברורים" (inquiries phone/fax/mobile) — no canonical key.
//  - "שים לב, יש לצרף..." attachment-reminder checkboxes (6 document types) — instructional, not
//    a data field; no canonical key.
//  - driver.license_number's neighbouring "האם הרשיון נפסל?" (was license revoked, כן/לא) — no
//    canonical key (revocation status isn't in ClaimData). "תוקף רשיון מ:___" (license validity
//    FROM-date) also has no canonical key — only the "עד:" (expiry) half is mapped below.
//  - "מהו התמרור המוצב בדרכו..." (road sign at accident) x2, "מי מעורב משאית/אופנוע/נגרר/רכב
//    חונה" (vehicle-type-involved yes/no) x4 — no canonical keys.
//  - third_parties[].agent_name / damage_description — not present on this form for any TP row.
//  - Bank section: account-holder name + ID ("שם/ת.ז. בעל החשבון") and "מס' בנק" (bank CODE,
//    distinct from "שם בנק" bank NAME) — no canonical keys (BankAccount has bank/branch/
//    account_number only).
//  - "הועבר לתביעת גוף בתאריך" (transferred to bodily-injury claim on date) — no canonical key.
//  - injured_persons[].age — not collected on this form.
//  - injured_persons[].hospitalized — no separate כן/לא box for this on the form; "אשפוז (שם
//    בי"ח)" is a single free-text cell (mapped to injured_persons[].hospital), not a boolean box.
//  - declarations.poa_third_party / data_consent — boolean declaration checkmarks pre-printed on
//    the form (✓ glyphs already baked into the template graphic); no canonical key needed/usable.
const phoenix: Template = {
  insurer: "הפניקס",
  srcFile: "phoenix.pdf",
  fields: [
    // ── Header ───────────────────────────────────────────────────────────────
    { key: "policy_number", right: 488, y: 718, size: 8 },

    // ── מוסך / שמאי ──────────────────────────────────────────────────────────
    { key: "garage.name", right: 300, y: 665, size: 9 },
    { key: "assessor_name", right: 485, y: 665, size: 9 },
    // הסדר○ / לא הסדר○ circles, y=666 (now mappable via yes/no checkbox options)
    {
      key: "garage.is_arrangement",
      type: "checkbox",
      size: 8,
      options: { yes: [125, 666], no: [76, 666] },
    },

    // ── א. פרטי המבוטח ───────────────────────────────────────────────────────
    // "שם המבוטח" is a SINGLE narrow cell (no separate first/last columns) — both names share
    // the ~56pt blank area left of the label, small font to minimise collision risk.
    { key: "insured.last_name", right: 458, y: 640, size: 6 },
    { key: "insured.first_name", right: 428, y: 640, size: 6 },
    { key: "insured.address_line", right: 388, y: 640, size: 7 },
    // id_number cell (x≈128-259) hosts a 9-digit comb; the comb TICKS themselves sit high in the
    // cell (y≈645-652), well above the "מס' זיהוי (כולל ספרת ביקורת)" caption baseline (y≈609) —
    // right=248/y=647/size 9 lands the digits inside the tick band, clear of both the caption
    // below and the "כתובת" cell to its right (was right=254/y=640/size 5.5, which put the
    // digits on the caption's baseline instead of in the comb).
    { key: "insured.id_number", right: 248, y: 638, size: 9 },
    { key: "insured.phone", right: 95, y: 640, size: 7 },

    // ── ב. פרטי הנהג ─────────────────────────────────────────────────────────
    // right pulled in from 558 -> 540: at 558 a two-word last_name (e.g. "בן דוד") collided
    // with the rotated "פרטי הנהג" section-label column, which starts at x≈545.
    { key: "driver.last_name", right: 540, y: 616, size: 7 },
    { key: "driver.first_name", right: 520, y: 616, size: 7 },
    { key: "driver.address_line", right: 455, y: 616, size: 8 },
    { key: "driver.relation_to_insured", right: 320, y: 616, size: 8 },
    { key: "driver.phone", right: 248, y: 616, size: 8 },
    { key: "driver.mobile", right: 193, y: 616, size: 8 },
    {
      key: "driver.license_origin",
      type: "checkbox",
      size: 8,
      options: { israeli: [72, 621], foreign: [72, 610] },
    },

    // תאריך לידה מלא / מספר זיהוי (driver) / מס' רשיון נהיגה / סוג-דרגת הרשיון — y=584 row
    { key: "driver.birth_date", right: 534, y: 591, size: 8 },
    // id_number cell (x≈128-443) is a 9-digit comb spanning its FULL width — the comb TICKS sit
    // high in the cell (y≈592-598), above the "מספר זיהוי (כולל סיפרת ביקורת)" caption baseline
    // (y≈587); right=436/y=595/size 9 lands the digits in the tick band instead of on top of the
    // caption text (was right=452/y=594/size 6 — too small and one tick's-width too far right).
    { key: "driver.id_number", right: 436, y: 595, size: 9 },
    { key: "driver.license_number", right: 320, y: 591, size: 7 },
    { key: "driver.license_type", right: 259, y: 591, size: 7 },
    // תוקף רשיון מ:___ עד:___ — "עד:" cell only (no canonical key for "מ:" from-date);
    // cell spans x≈85-145, label "עד:" printed at its right edge (~x=137-145), y=596 baseline.
    { key: "driver.license_expiry", right: 130, y: 596, size: 7 },

    // ── ג. פרטי הרכב ─────────────────────────────────────────────────────────
    { key: "vehicle.plate", right: 530, y: 570, size: 9 },
    { key: "vehicle.manufacturer", right: 434, y: 570, size: 7 },
    { key: "vehicle.model", right: 342, y: 570, size: 7 },
    { key: "vehicle.type", right: 277, y: 570, size: 7 },
    { key: "vehicle.year", right: 198, y: 570, size: 8 },

    // ── ד. פרטי התאונה ───────────────────────────────────────────────────────
    { key: "accident.date", right: 560, y: 548, size: 9 },
    { key: "accident.time", right: 435, y: 548, size: 9 },
    // NOTE: accident.area_type (urban/intercity/parking/junction) has no matching checkbox on
    // this form — the only nearby circles are יום/לילה (day/night, no canonical field) and the
    // "האם חובא לידיעת המשטרה" police-notified boolean (mapped below via yes/no options).
    { key: "accident.location", right: 375, y: 550, size: 8 },
    // האם הובא לידיעת המשטרה — כן/לא circles, y=554
    {
      key: "accident.police.notified",
      type: "checkbox",
      size: 8,
      options: { yes: [267, 554], no: [241, 554] },
    },

    // מי לדעתך אחראי לתאונה? (fault) — circle centers re-measured directly off a rendered crop
    // (mupdf render.mjs at 20x scale per option) since these are vector circles with no
    // extractable text nearby to anchor on; boxdetect.mjs doesn't catch circles (only rectangle
    // constructPath ops), so the earlier y=337/x=404-475 "boxdetect" triplet was unrelated glyph
    // noise, and the previous x/y (me:424/377/340, y:350) were consistently short of the true
    // centers — the X rendered above-right of each circle instead of inside it. drawText's (x,y)
    // is the glyph's baseline-left origin, not its visual center, so each measured circle center
    // (me 450/427/383 @ y355) is nudged left/down by ~half the size-9 "X" glyph's box.
    {
      key: "fault",
      type: "checkbox",
      size: 9,
      options: {
        me: [448, 352],
        third_party: [425, 352],
        unknown: [381, 352],
      },
    },

    // תוך כדי עבודה / בדרך לעבודה (page 2, see below) drives accident.trip_type instead of a
    // page-1 box — this form has no trip-type row on page 1.

    // תאור נסיבות המקרה — box has exactly 2 ruled rows (top border y=520, mid divider y=490,
    // bottom border y=460, each 30pt tall), usable width x≈70-560 (490pt). Line 1 baseline
    // raised to 508 (was 503, which sat glyphs ON the rule) for clearance above the divider;
    // line 2 at y=482, centred in the second 30pt row. Long text wraps/shrinks (min 5pt) via
    // the engine before the last line is clipped.
    { key: "accident.description", right: 560, y: 508, size: 10, width: 480, lineHeight: 26, maxLines: 2 },

    // תאור מקים ברכב המבוטח — blank row directly below the label, band y≈420-455 (35pt tall,
    // divider left edge x≈310); line 1 at y=447, line 2 at y=435 (lineHeight 12) — tight but
    // clear of the "תאור מקים צד ג'" label row below (baseline 420, ascenders reach ~429).
    { key: "damage.insured_vehicle", right: 545, y: 447, size: 8, width: 230, lineHeight: 12, maxLines: 2 },
    // תאור מקים צד ג' — tight single answer band y≈400-420 (only ~18pt after the label);
    // room for at most 2 short lines at a smaller font — line 2 sits right at the y=400
    // divider, which beats the alternative (text overflowing the cell's left border).
    { key: "damage.third_party_vehicle", right: 545, y: 405, size: 7, width: 230, lineHeight: 9, maxLines: 2 },

    // ── עדים (page 1 — first 2 witness rows) ────────────────────────────────
    { key: "witnesses.0.name", right: 502, y: 320, size: 7 },
    { key: "witnesses.0.address", right: 390, y: 320, size: 7 },
    { key: "witnesses.0.phone", right: 195, y: 332, size: 7 },
    { key: "witnesses.1.name", right: 535, y: 305, size: 8 },
    { key: "witnesses.1.address", right: 395, y: 305, size: 8 },
    { key: "witnesses.1.phone", right: 195, y: 312, size: 7 },

    // ── ו. פרטי צד ג' — TOP block (vehicle + driver + insurance) ────────────
    // This block is actually THREE stacked rows sharing the same 5-ish column x-positions, each
    // with its own caption printed at the TOP of the row and the write-in area below it (caption
    // baselines measured off the raw glyph y's in .pdfwork/phoenix_coords.json — reliable even
    // though the decoded characters are garbage): row A "מס' רישוי/תוצרת/סוג/חברת ביטוח/פוליסה"
    // caption y=274; row B "שם בעל הרכב/כתובתו/טל' בית/טל' עבודה/שם הסוכן/טל'" caption y=252;
    // row C "שם הנהג/כתובתו/מס' ת.זיהוי/מס' רשיון נהיגה/טלפון" caption y=230. Each row's value
    // sits ~10pt below its own caption. The previous single y=244 for driver_name/address/
    // id_number/phone landed in ROW B (owner row) instead of row C (driver row), and
    // third_parties.0.owner_name was never mapped at all (row B rendered blank) — despite the
    // in-code comment claiming this block "has no owner_name cell", it does (row B).
    { key: "third_parties.0.vehicle_plate", right: 520, y: 264, size: 9 },
    { key: "third_parties.0.vehicle_type", right: 335, y: 264, size: 8 },
    { key: "third_parties.0.insurer", right: 215, y: 264, size: 8 },
    { key: "third_parties.0.policy_number", right: 95, y: 264, size: 8 },
    // row B (owner) — same rightmost column as row C's driver_name below.
    { key: "third_parties.0.owner_name", right: 540, y: 242, size: 9 },
    // row C (driver) — right pulled in from 558→540: under Noto Sans Hebrew (wider than the old
    // Arial), a long driver_name's rightmost glyph landed on/behind the rotated "פרטי רכב..."
    // column label that starts at x≈557 in this row's y-band; 540 gives clearance.
    { key: "third_parties.0.driver_name", right: 540, y: 220, size: 9 },
    { key: "third_parties.0.address", right: 455, y: 220, size: 8 },
    // id_number cell spans x≈240-310 (ticks fill most of it); the blank gap between this cell's
    // right border (310) and where the address text actually starts (≈388) is the safe zone —
    // right=378 clears both the comb and third_parties.0.address's own text (was right=315,
    // sitting on the comb; a first attempt at right=390 landed inside the address cell instead).
    { key: "third_parties.0.id_number", right: 378, y: 220, size: 8 },
    { key: "third_parties.0.phone", right: 95, y: 220, size: 8 },

    // ── מעורבים נוספים — block 1 (third_parties[1]) ─────────────────────────
    { key: "third_parties.1.vehicle_plate", right: 558, y: 204, size: 9 },
    { key: "third_parties.1.owner_name", right: 455, y: 204, size: 8 },
    { key: "third_parties.1.address", right: 315, y: 204, size: 8 },
    { key: "third_parties.1.driver_name", right: 195, y: 204, size: 8 },
    { key: "third_parties.1.phone", right: 95, y: 204, size: 8 },
    { key: "third_parties.1.insurer", right: 315, y: 184, size: 8 },
    { key: "third_parties.1.policy_number", right: 95, y: 184, size: 8 },

    // ── מעורבים נוספים — block 2 (third_parties[2]) ─────────────────────────
    { key: "third_parties.2.vehicle_plate", right: 558, y: 164, size: 9 },
    { key: "third_parties.2.owner_name", right: 455, y: 164, size: 8 },
    { key: "third_parties.2.address", right: 315, y: 164, size: 8 },
    { key: "third_parties.2.driver_name", right: 195, y: 164, size: 8 },
    { key: "third_parties.2.phone", right: 95, y: 164, size: 8 },
    { key: "third_parties.2.insurer", right: 315, y: 144, size: 8 },
    { key: "third_parties.2.policy_number", right: 95, y: 144, size: 8 },

    // ── Page 2 ───────────────────────────────────────────────────────────────

    // נפגעים — up to 3 rows on this form (schema supports up to 5)
    // name right:495 (not 558) — the printed "שם נפגע" caption sits inside the cell's right edge.
    { key: "injured_persons.0.name", page: 1, right: 495, y: 770, size: 8 },
    { key: "injured_persons.0.id_number", page: 1, right: 458, y: 770, size: 7 },
    { key: "injured_persons.0.address", page: 1, right: 375, y: 770, size: 7 },
    { key: "injured_persons.0.injury_nature", page: 1, right: 558, y: 750, size: 8 },
    { key: "injured_persons.0.hospital", page: 1, right: 415, y: 750, size: 7 },

    { key: "injured_persons.1.name", page: 1, right: 495, y: 730, size: 8 },
    { key: "injured_persons.1.id_number", page: 1, right: 415, y: 730, size: 7 },
    { key: "injured_persons.1.address", page: 1, right: 375, y: 730, size: 7 },
    { key: "injured_persons.1.injury_nature", page: 1, right: 558, y: 710, size: 8 },
    { key: "injured_persons.1.hospital", page: 1, right: 415, y: 710, size: 7 },

    { key: "injured_persons.2.name", page: 1, right: 495, y: 690, size: 8 },
    { key: "injured_persons.2.id_number", page: 1, right: 415, y: 690, size: 7 },
    { key: "injured_persons.2.address", page: 1, right: 375, y: 690, size: 7 },
    { key: "injured_persons.2.injury_nature", page: 1, right: 558, y: 670, size: 8 },
    { key: "injured_persons.2.hospital", page: 1, right: 415, y: 670, size: 7 },

    // תוך כדי עבודה / בדרך לעבודה — the closest fit for accident.trip_type on this form
    // (only 2 of the 3 yes/no rows have a matching enum value; "בחזרה מהעבודה" has none).
    {
      key: "accident.trip_type",
      type: "checkbox",
      size: 8,
      options: {
        work: [419, 640],
        to_from_work: [419, 625],
      },
    },
    // האם היתה הסעה בשכר? — כן/לא circles, y=553 (question 3, page 2; box centers verified via
    // boxdetect.mjs: y=569 is actually "האם מעורב נגרר" one row above — corrected here)
    {
      key: "accident.is_paid_transport",
      type: "checkbox",
      page: 1,
      size: 8,
      options: { yes: [423, 553], no: [392, 553] },
    },

    // ── פרטי חשבון הבנק ──────────────────────────────────────────────────────
    { key: "bank_account.bank", page: 1, right: 558, y: 390, size: 7 },
    { key: "bank_account.account_number", page: 1, right: 238, y: 390, size: 7 },
    { key: "bank_account.branch", page: 1, right: 118, y: 390, size: 7 },

    // כתובת למשלוח הודעת זיכוי — reuse insured address (form has no distinct canonical slot)
    { key: "insured.street", page: 1, right: 505, y: 357, size: 7 },
    { key: "insured.house_no", page: 1, right: 358, y: 357, size: 7 },
    { key: "insured.city", page: 1, right: 278, y: 357, size: 7 },
    { key: "insured.postal_code", page: 1, right: 198, y: 357, size: 7 },
    { key: "insured.email", page: 1, right: 118, y: 357, size: 6 },

    // ── הצהרה / חתימה (bottom of page 2) ─────────────────────────────────────
    // NOTE (2026-08-28): typed signatory name printed as a typed-signature stand-in on every
    // applicable printed signature line, per product decision (name+date, no drawn signature).
    // Two separate declaration blocks each have their own row of signature-line captions
    // (measured from raw glyph y/x in .pdfwork/phoenix_coords.json, since this PDF's text layer
    // is undecodable): the big "סעיף 68" paragraph's row (caption y≈152) has, right-to-left,
    // "חתימת הנהג" (x≈458-598, left for a physical driver signature — no canonical field to put
    // there), an uncaptioned middle cell (x≈171-458 — NOT "חתימת המבוטח" despite the previous
    // in-code claim; the name previously rendered here read as an unlabeled floating mark), and
    // "חתימת המבוטח" (x≈14-171, leftmost). The final "עלי קבלת טופס..." block's row (caption
    // y≈39) has "חתימת בעל הרכב" (x≈14-171) and a "תאריך" box (x≈459-570) that was previously
    // left empty. Both ✓ checkmarks are pre-printed in the blank PDF, not drawn by this template.
    { key: "declarations.signatory_name", page: 1, right: 145, y: 163, size: 9 }, // חתימת המבוטח
    { key: "declarations.signatory_name", page: 1, right: 585, y: 163, size: 8 }, // חתימת הנהג
    // right:145 (not 165) — the pre-printed ✓ occupies the cell's right edge; 165 overlapped it.
    { key: "declarations.signatory_name", page: 1, right: 145, y: 57, size: 9 }, // חתימת בעל הרכב
    { key: "declarations.date", page: 1, right: 555, y: 57, size: 8 }, // תאריך
  ],
};

export default phoenix;
