-- Migration 004: expand doc_type enum + add circumstance flags to claims.
-- Run AFTER 003_storage.sql.
-- Postgres allows ADD VALUE on an enum but not DROP/RENAME — additive only.

ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'id_card';               -- ת"ז (מנורה דורשת)
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'repair_receipt';        -- קבלה על תשלום (≠ garage_invoice)
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'loss_confirmation';     -- אישור הפסדים (≠ no_claim_confirmation)
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'lien_release';          -- אישור הסרת שיעבוד
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'info_consent';          -- הסכמה למשרד הרישוי
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'power_of_attorney';     -- ייפוי כוח §68
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'bank_details';          -- טופס בנק / שיק מבוטל / IBAN
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'vat_offset_confirmation'; -- אישור רו"ח — עסקי
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'keys';                  -- מפתחות (גניבה)
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'assessor_fee_invoice';  -- חשבון שכ"ט שמאי
ALTER TYPE doc_type ADD VALUE IF NOT EXISTS 'assessor_fee_receipt';  -- קבלה שכ"ט שמאי

-- Circumstance flags: drive the conditional checklist sections.
-- All default false so existing claims are unaffected.
ALTER TABLE claims
  ADD COLUMN IF NOT EXISTS theft                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lien                 boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS business_use         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS policy_activated     boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS garage_network_rider boolean NOT NULL DEFAULT false;
