import type { Template } from "../engine";

// Coordinate map: canonical field -> position on כלל (Clal) "claim kit" for vehicle losses.
// Source: docs/accidentStatementPdf/כלל_טופס-הודעה.pdf — a 9-page document (cover letter,
// appendix A doc checklist, then the actual fillable form as "נספח ב'" on pages 3-5, then
// appendix C terms). Only pages 3-5 (engine page indices 2-4) have fillable fields; the rest
// is boilerplate with no positioned blanks.
//
// Form layout (נספח ב' - הודעה על מקרה ביטוח - רכב):
//   p.3 (page 2): §1 פרטי התובע (claimant = insured), §2 איש קשר שאינו התובע (secondary
//     contact — no canonical field, skipped), §3 פרטי הרכב הפוגע (the vehicle that hit the
//     insured = third_parties.0.vehicle_*), §4 פרטי הנהג ברכב הפוגע (that vehicle's driver =
//     third_parties.0 driver/contact fields).
//   p.4 (page 3): §5 פרטי התאונה (accident date/location/description), §6 כלי הרכב המעורבים
//     (the INSURED's own vehicle: plate/manufacturer/model/year/type + owner row + driver row
//     + policy/insurer), §7 פרטי תשלום (bank account for reimbursement).
//   p.5 (page 4): §8 הצהרת תובע (declaration signature/date).
//
// Each data table on this form has a bold column-HEADER row (label) with the blank input cell
// directly below it (grid box for id/plate, blank line otherwise) — the opposite of forms where
// the label sits beside/on the blank. Row header baselines run ~38-40pt apart; the blank cell
// sits centred in that band, roughly 18pt below the header baseline.
//
// schema_gaps (fields on the form with no canonical ClaimData key — left unmapped):
//   - §2 secondary contact person (name/id/phone/address/relation) — no canonical slot.
//   - §3 vehicle manufacturer/model/year of the vehicle that hit the insured — ThirdParty has
//     no manufacturer/model/year fields (only vehicle_plate/vehicle_type).
//   - §6 vehicle color (צבע) — ClaimData.vehicle has no color field.
//   - §6 vehicle.type row and §6 insurance_type row are plain slash-separated option lists
//     ("פרטי / מסחרי / ... / אחר", "מקיף / צד ג' / חובה") with NO checkbox glyph anywhere near
//     them (verified — no "□" in the extracted text stream for either line, unlike §3's vehicle
//     type row which does have glyph boxes). No reliable coordinate to mark an "X" on, so both
//     are left unmapped rather than guessing a position on top of the wrong word.
//   - §6/§7 bank account holder name/id (שם/ת.ז בעל החשבון) — BankAccount has no holder field.
//   - §7 מס' בנק / מס' סניף (numeric bank/branch codes) — only one bank/branch slot each
//     (bank_account.bank/branch); mapped to the NAME cells (שם בנק / שם סניף) instead, per the
//     same convention as templates/ayalon.ts.
const clal: Template = {
  insurer: "כלל",
  srcFile: "clal.pdf",
  fields: [
    // ── p.3: §1 פרטי התובע (insured / claimant) ─────────────────────────────
    { key: "insured.id_number", page: 2, right: 495, y: 700, size: 8 },
    { key: "insured.last_name", page: 2, right: 330, y: 700, size: 8 },
    { key: "insured.first_name", page: 2, right: 150, y: 700, size: 8 },

    { key: "insured.mobile", page: 2, right: 208, y: 662, size: 8 },
    { key: "insured.phone", page: 2, right: 466, y: 662, size: 8 },

    { key: "insured.postal_code", page: 2, right: 101, y: 622, size: 8 },
    { key: "insured.city", page: 2, right: 228, y: 622, size: 8 },
    { key: "insured.house_no", page: 2, right: 373, y: 622, size: 8 },
    { key: "insured.street", page: 2, right: 519, y: 622, size: 8 },

    { key: "driver.license_date", page: 2, right: 131, y: 582, size: 8 },
    { key: "driver.license_expiry", page: 2, right: 242, y: 582, size: 8 },
    { key: "driver.license_type", page: 2, right: 386, y: 582, size: 8 },
    { key: "vehicle.plate", page: 2, right: 497, y: 582, size: 8 },

    // ── p.3: §3 פרטי הרכב הפוגע (the vehicle that hit the insured -> third_parties.0) ──
    // Row 1 (יצרן/דגם/שנת ייצור/רשום על שם) — only "owner" has a canonical slot.
    { key: "third_parties.0.owner_name", page: 2, right: 558, y: 277, size: 8 },
    // Row 2 (מספר רכב right col / סוג הרכב left col) shares one baseline with the checkbox
    // list below it (no separate blank row for the plate).
    { key: "third_parties.0.vehicle_plate", page: 2, right: 555, y: 237, size: 8 },
    // Checkbox glyphs (□) precede each label in RTL order (box x > label's own x). "פרטי" is
    // the last/rightmost option and its box glyph wasn't in the extracted text stream —
    // estimated from the ~5-6pt label-edge-to-box gap consistent across the other 5 options.
    {
      key: "third_parties.0.vehicle_type",
      type: "checkbox",
      page: 2,
      size: 8,
      options: {
        private: [367, 237],
        commercial: [330, 237],
      },
    },

    // ── p.3: §4 פרטי הנהג ברכב הפוגע (driver of the vehicle that hit -> third_parties.0) ──
    { key: "third_parties.0.id_number", page: 2, right: 495, y: 180, size: 8 },
    { key: "third_parties.0.driver_name", page: 2, right: 330, y: 180, size: 8 },

    { key: "third_parties.0.phone", page: 2, right: 208, y: 143, size: 8 },

    { key: "third_parties.0.address", page: 2, right: 519, y: 103, size: 8 },

    // ── p.4: §5 פרטי התאונה ──────────────────────────────────────────────────
    { key: "accident.date", page: 3, right: 480, y: 718, size: 9 },
    { key: "accident.location", page: 3, right: 280, y: 718, size: 8 },
    // 6 dotted ruled lines right of "תיאור המקרה:" (header y=698), spanning the full width
    // right of the accident-diagram box (diagram occupies the left ~half of the section).
    {
      key: "accident.description",
      page: 3,
      right: 555,
      y: 678,
      size: 8,
      width: 330,
      lineHeight: 15,
      maxLines: 6,
    },

    // ── p.4: §6 כלי הרכב המעורבים (the insured's own vehicle + policy) ──────
    // Row 1 columns (right→left): סוג הרכב (glyph-less list, unmapped) | שנת ייצור | יצרן |
    // דגם | צבע (no canonical field) | מספר רישוי — narrow columns sharing one baseline.
    { key: "vehicle.year", page: 3, right: 356, y: 559, size: 7 },
    { key: "vehicle.manufacturer", page: 3, right: 298, y: 559, size: 7 },
    { key: "vehicle.model", page: 3, right: 242, y: 559, size: 7 },
    { key: "vehicle.plate", page: 3, right: 135, y: 559, size: 8 },

    { key: "insured.full_name", page: 3, right: 570, y: 522, size: 8 },
    { key: "insured.id_number", page: 3, right: 415, y: 522, size: 8 },
    { key: "insured.address_line", page: 3, right: 258, y: 522, size: 8 },
    { key: "insured.mobile", page: 3, right: 121, y: 522, size: 8 },

    { key: "driver.full_name", page: 3, right: 570, y: 471, size: 8 },
    { key: "driver.id_number", page: 3, right: 415, y: 471, size: 8 },
    { key: "driver.address_line", page: 3, right: 258, y: 471, size: 8 },
    { key: "driver.mobile", page: 3, right: 121, y: 471, size: 8 },

    // שם חברת הביטוח (leftmost, skipped — this is Clal itself) | סוכן/טלפון | מספר פוליסה |
    // סוג הביטוח (rightmost, glyph-less list, unmapped) — all share one baseline (y=423) with
    // no separate blank row below the header (same pattern as the vehicle-type row above).
    { key: "agent_name", page: 3, right: 325, y: 423, size: 7 },
    { key: "policy_number", page: 3, right: 452, y: 423, size: 8 },

    // ── p.4: §7 פרטי תשלום (bank account) ────────────────────────────────────
    { key: "bank_account.bank", page: 3, right: 505, y: 291, size: 8 },
    { key: "bank_account.branch", page: 3, right: 333, y: 291, size: 8 },
    { key: "bank_account.account_number", page: 3, right: 144, y: 291, size: 8 },

    // ── p.5: §8 הצהרת תובע (declaration) ─────────────────────────────────────
    { key: "declarations.signatory_name", page: 4, right: 400, y: 505, size: 8 },
    { key: "declarations.date", page: 4, right: 545, y: 505, size: 8 },
  ],
};

export default clal;
