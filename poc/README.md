# POC — Accident-Notice Form Auto-Fill

Proves the riskiest technical piece: **overlaying Hebrew (RTL) text onto a flat insurer PDF** at mapped coordinates, producing a filled form. The proven engine now ships in the app (see below); this folder is the **coordinate lab**.

**Status:** ✅ Working for **הכשרה**, **מגדל**, **מנורה** in the app. Migdal stores each letter as a separate text item — `../.pdfwork/inspect.mjs` clusters glyphs into words + x-ranges so labels can be anchored. `render.mjs` takes an optional `<page> <scale> <yTop> <yBot>` crop band for close-up QA.

## Method (reusable per insurer)
1. **Extract label coordinates** — `../.pdfwork/coords.mjs` dumps every text item with its PDF-space `(x, y)` (origin bottom-left, y up — same as pdf-lib). The form's own printed labels are the anchor grid.
2. **Map fields** — for each field, pick an anchor (right edge `x`, baseline `y`) in the blank just below/beside its label. This per-template map is the only per-insurer work.
3. **Overlay** — the app engine (`web/src/lib/formfill/engine.ts`) uses `pdf-lib` + `@pdf-lib/fontkit` with an embedded Hebrew font:
   - Draw Hebrew in **logical order — do NOT reverse.** pdf-lib + fontkit shape RTL correctly; reversing renders the text backwards. (Verified with `../.pdfwork/test.mjs`, which draws raw vs reversed side by side.)
   - Values are **right-anchored** (`x = right − textWidth`).
   - Checkboxes: an `X` at the box centre. Box coords come from **`boxdetect.mjs`** (vector squares — e.g. Migdal: `op=constructPath` paths whose coords are `[x0,y0,x1,y1]`) or from `coords.mjs` when the "box" is a symbol glyph (e.g. Hachshara draws boxes as a `7` in a dingbat font).
4. **Verify** — fill via the app engine and render with `../.pdfwork/render.mjs` (mupdf WASM, no native deps) for visual QA. Iterate on coordinates.

## Schema-driven module → lives in the app ✅
The generic, template-driven fill engine is the **single source of truth** in the app:
`web/src/lib/formfill/` —
- `engine.ts` — `fillForm(template, data)` → filled PDF bytes. Text right-anchored; checkboxes by **value → box** lookup. No per-insurer code.
- `types.ts` — the **canonical `ClaimData`** (one shape for all insurers): `insured`, `driver`, `vehicle`, `accident`, `third_parties[]`, `damage`, `garage`, `claim_type`, `fault`, …
- `labels.ts` — enum→Hebrew for free-text enum cells (checkbox forms map the enum key to a box).
- `templates/<insurer>.ts` — coordinate map: `{key,page,right,y[,size]}` for text, `{key,type:'checkbox',options:{value:[x,y]}}` for enums.
- `index.ts` — insurer registry. **A new insurer = one template file + a registry line + the blank PDF in `assets/`.**

QA a template from this lab without leaving for the app UI:
```powershell
cd ..\web; npx tsx scripts/fill.ts hachshara ..\.pdfwork\hachshara_qa.pdf
node ..\.pdfwork\render.mjs ..\.pdfwork\hachshara_qa.pdf ..\.pdfwork\hachshara_qa.png 1
```
The `pdf-form-mapper` agent automates this extract → place → QA loop.

## Toward production
- Map remaining insurers as app template files via the `pdf-form-mapper` agent. **Done:** הכשרה, מגדל, מנורה. **Remaining text-extractable:** שלמה, ליברה, הראל, AIG. **Need OCR first:** הפניקס, איילון.
- Replace Arial (`web/src/lib/formfill/assets/app-hebrew.ttf`) with a bundled OFL Hebrew font (Rubik / Heebo / Noto Sans Hebrew) for licensing + Linux compatibility before deploying.
- Mixed Hebrew+Latin+number runs rely on fontkit's shaping; spot-check RTL ordering per field via a render.
- ✅ Module moved into the app (`web/src/lib/formfill/`) and wired to the collection wizard.
