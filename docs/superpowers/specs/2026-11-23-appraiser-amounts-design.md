# Amounts from the appraiser report → demand letter — design

**Status:** approved 2026-11-23. Short design for a small feature. Completes the part of
"smart document intake" that `2026-11-22-smart-doc-intake-design.md` left as a non-goal.

## Intent
On a third-party demand claim the clerk reads the appraiser report and types the repair
cost and the diminished value into "פירוט הנזק" by hand; the demand letter is rendered
from those lines. The system should read the report and offer the two figures, so she
confirms instead of typing.

## Goals
- When a document is filed as `appraiser_report` on a `third_party_report` claim, extract
  the repair cost before VAT and the diminished value.
- Show them as a suggestion on the claim; one click writes them into the damages lines and
  regenerates the demand letter.
- Keep what was suggested and what the clerk did, so accuracy can be measured.

## Non-goals
- Towing — it comes from another document and stays typed by hand.
- The garage invoice, the fee receipt, payment notices, any other document.
- Other claim tracks: only the demand track has damages lines.
- The privacy notice (parked by the owner 2026-11-22). Note: a report uploaded through the
  typed single upload was not sent to the model before; now it is.

## Anti-goals
- **No amount reaches the demand letter without the clerk's click.** There are no real
  reports to measure accuracy on yet, and a wrong figure in a letter sent to an insurer
  costs money.
- Extraction never fails or blocks an upload or a re-file. No answer → no suggestion.
- A typed amount is never overwritten silently: a differing current value is shown next
  to the suggested one.

## Approaches considered
1. **Fill the damages lines automatically.** Rejected: unmeasured accuracy, costly error.
2. **Suggestion the clerk confirms (chosen).** One click, and every confirmation or
   dismissal is a labelled data point.
3. **A "read from report" button inside the damages editor.** Rejected: the editor is two
   tabs away from where she drops the documents; she would have to know to look for it.

## Design
- `web/src/lib/ai/extract-appraiser-amounts.ts` — one Claude call on the file (same file
  blocks, client and model as the classifier), structured output with the figures printed
  in the report: repair before VAT, repair including VAT, diminished value, `confident`.
  `0` means "not stated". Not confident, or nothing stated → no result.
- **Consistency check, in code:** `verified` is true only when the report prints both
  repair figures and before-VAT × (1 + VAT) matches the printed total within 1 ₪. A
  report that prints only the VAT-inclusive total gets a derived before-VAT figure and
  `verified: false`. Unverified suggestions carry "לבדוק מול הדוח".
- **When:** inline in `POST …/documents` after the row is stored (typed or auto-detected
  as `appraiser_report`), and in `PATCH …/documents/[docId]` when a file is re-filed as
  `appraiser_report`. Bounded by a timeout; the response does not depend on it.
- **Storage — no migration:** event `appraiser_amounts_extracted
  { document_id, repair, diminished_value, verified }`. The clerk's answer is event
  `appraiser_amounts_resolved { document_id, outcome: "applied" | "dismissed" }`.
- **What is pending** (pure, `web/src/lib/demand/appraiser-suggestion.ts`): the newest
  extraction whose document still exists as an appraiser report, with no later resolution
  for that document, and at least one line that differs from the current damages.
- **UI:** a card on the claim overview, above the drop zone. Each line shows the suggested
  amount and, when one was typed and differs, the current one. "להכניס למכתב הדרישה"
  saves through the existing `PATCH …/form-data` (validation, demand-letter regeneration)
  and records the resolution; "לא עכשיו" records a dismissal.

## Addition, same day: the assessor fee
The owner asked for the appraiser's own fee as well. It is not in the report; it comes
from the fee invoice (`assessor_fee_invoice`), read by a second call of the same shape
(fee before VAT, fee including VAT, same consistency check). Consequences:
- The extraction event carries `doc_type`; a document suggests only its own lines
  (report → repair, diminished value; fee invoice → assessor fee), and only while it is
  still filed under the type it was read as.
- The card merges the pending readings of all source documents into one suggestion;
  when two documents state the same line the newer reading wins. "Unverified" is per
  line. Applying or dismissing records one resolution per source document.

## Left to the builder
Prompt wording, timeout, exact Hebrew copy, card layout.

## Addition, 2026-11-25: report and fee invoice in one file
The owner reported that appraisers sometimes send the report and their fee invoice as a
single PDF. Such a file is filed as `appraiser_report`, so the fee was never read.
- The report call now also asks for the fee (before VAT, including VAT; `0` when the
  file does not state it) — one call, not two. The extraction event of a report carries
  `assessor_fee` and its own check, `assessor_fee_verified`; `verified` stays the repair
  check.
- A report may therefore suggest the assessor-fee line. A separate fee invoice still
  does; when both state the fee the newer reading wins, as for any line.
- Auto-detect: a file that contains the damage assessment is `appraiser_report`,
  whatever is attached and in either order (fee invoice first used to file as `other`).
- Not covered: the combined file is one document of one type, so the checklist's
  `assessor_fee_invoice` item stays open until the invoice is filed on its own.
