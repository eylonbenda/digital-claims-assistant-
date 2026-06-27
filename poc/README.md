# POC — Accident-Notice Form Auto-Fill

Proves the riskiest technical piece: **overlaying Hebrew (RTL) text onto a flat insurer PDF** at mapped coordinates, producing a filled form.

**Status:** ✅ Working on **הכשרה** (Hachshara) and **מגדל** (Migdal) page 1. Migdal stores each letter as a separate text item — `../.pdfwork/inspect.mjs` clusters glyphs into words + x-ranges so labels can be anchored. Outputs: `hachshara_FILLED_v2.pdf`, `migdal_FILLED.pdf` (previews: `hachshara_p1.png`, `migdal_crop.png`). `render.mjs` also takes an optional `yTop yBot` crop band for close-up QA.

## Method (reusable per insurer)
1. **Extract label coordinates** — `../.pdfwork/coords.mjs` dumps every text item with its PDF-space `(x, y)` (origin bottom-left, y up — same as pdf-lib). The form's own printed labels are the anchor grid.
2. **Map fields** — for each field, pick an anchor (right edge `x`, baseline `y`) in the blank just below/beside its label. This per-template map is the only per-insurer work.
3. **Overlay** — `../.pdfwork/pocfill.mjs` (Hachshara) / `migdalfill.mjs` (Migdal) use `pdf-lib` + `@pdf-lib/fontkit` with an embedded Hebrew font (Windows `arial.ttf`):
   - Draw Hebrew in **logical order — do NOT reverse.** pdf-lib + fontkit shape RTL correctly; reversing renders the text backwards. (Verified with `test.mjs`, which draws raw vs reversed side by side.)
   - Values are **right-anchored** (`x = right − textWidth`).
   - Checkboxes: an `X` at the box centre. Box coords come from **`boxdetect.mjs`** (vector squares — e.g. Migdal: `op=constructPath` paths whose coords are `[x0,y0,x1,y1]`) or from `coords.mjs` when the "box" is a symbol glyph (e.g. Hachshara draws boxes as a `7` in a dingbat font).
4. **Verify** — `../.pdfwork/render.mjs` (mupdf WASM, no native deps) renders the result to PNG for visual QA. Iterate on coordinates.

## Run
```powershell
$w = "..\.pdfwork"; $dir = "..\docs\accidentStatementPdf"
node "$w\coords.mjs"  "$dir\הכשרה_טופס_הודעה.pdf" "$w\hachshara_coords.json"   # 1. label coords
node "$w\pocfill.mjs" "$dir\הכשרה_טופס_הודעה.pdf" "$w\hachshara_FILLED.pdf"     # 2. fill
node "$w\render.mjs"  "$w\hachshara_FILLED.pdf"   "$w\hachshara_p1.png" 1 2      # 3. preview
```

## Schema-driven module ✅
`../.pdfwork/formfill/` — generic, template-driven fill (the real architecture, not hardcoded demos):
- `engine.mjs` — `fillForm(template, data)` → filled PDF bytes. Text right-anchored; checkboxes drawn by **value → box** lookup. No per-insurer code.
- `sample-claim.mjs` — the **canonical claim schema** (one shape for all insurers): `insured`, `driver`, `vehicle`, `accident`, `garage`, `claim_type`, `fault`, …
- `templates/<insurer>.mjs` — coordinate map: `{key,page,right,y[,size]}` for text, `{key,type:'checkbox',options:{value:[x,y]}}` for enums. **A new insurer = one template file.**
- `run.mjs <insurer> <out>` — CLI. Verified: one `sample-claim` → both `הכשרה` and `מגדל` forms (`poc/schema_*.pdf`).

## Toward production
- Map remaining insurers as template files (run `coords.mjs` / `boxdetect.mjs`, then place). **Done:** הכשרה, מגדל. **Remaining text-extractable:** מנורה, שלמה, ליברה, הראל, AIG. **Need OCR first:** הפניקס, איילון.
- Replace Arial with a bundled Hebrew font (e.g. Rubik / Open Sans Hebrew) for licensing + consistency.
- Mixed Hebrew+Latin+number runs rely on fontkit's shaping; spot-check RTL ordering per field via a render.
- Move the module into the app and feed it real collection data instead of `sample-claim.mjs`.
