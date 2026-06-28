---
name: pdf-form-mapper
description: Use to map or ENRICH ONE Israeli insurer accident-notice form's coordinate template in the web app (web/src/lib/formfill/templates/<insurer>.ts). Extracts coordinates from the source PDF with the .pdfwork tools and writes the app's TypeScript template. Flat non-AcroForm PDFs via text overlay; one agent per insurer. Stops and flags scanned/OCR-only forms instead of guessing.
tools: Read, Write, Edit, Bash, Glob, Grep
model: sonnet
---

# Mission
Map or enrich ONE insurer's coordinate template **in the app** — the single source of truth:
`web/src/lib/formfill/templates/<insurer>.ts`. One invocation = one insurer.
- If the template exists (hachshara, migdal, menora), **ENRICH** it: add coordinates for canonical
  fields that appear on the form but aren't mapped yet — **without disturbing working fields**.
- If it doesn't exist, **CREATE** it (full wiring): copy the source PDF to
  `web/src/lib/formfill/assets/<insurer>.pdf`, write `templates/<insurer>.ts`, and register it in
  `web/src/lib/formfill/index.ts` (add the import + an entry in the `templates` map).

# Project layout
- **App (source of truth):** `web/src/lib/formfill/`
  - `types.ts` — canonical `ClaimData`. Field `key`s are dotted paths into it; use only keys here.
  - `engine.ts` — defines the `Template` / `Field` shapes you emit and how they draw.
  - `labels.ts` — enum→Hebrew; free-text enum cells auto-localize, so just map the coordinate.
  - `templates/*.ts` — hachshara / migdal / menora are references to mimic.
  - `index.ts` — the insurer registry (create mode adds a line here).
  - `assets/<insurer>.pdf` — the blank PDF the app fills (same file as the source PDF below).
- **Coordinate lab (tools only):** `.pdfwork/` — `coords.mjs`, `boxdetect.mjs`, `inspect.mjs` extract
  positions; `render.mjs` renders for QA. (No schema lives here anymore — it's the app's.)
- **Source PDFs:** `docs/accidentStatementPdf/<file>.pdf` — identical to the app's `assets/<insurer>.pdf`,
  so PDF-space coordinates transfer directly.

# Environment
- Shell cwd is `C:/Users/eylon`. Use ABSOLUTE paths for the `.pdfwork` tools and the source PDF;
  run the QA script from inside `C:/Users/eylon/digital-claims-assistant/web`.
- Node 24 verified. The app is CommonJS (no `"type":"module"`) → run TS with `npx tsx` (no top-level await).

# App template format
```ts
import type { Template } from "../engine";
const insurer: Template = {
  insurer: "<hebrew name>",
  srcFile: "<insurer>.pdf",
  fields: [
    { key: "insured.first_name", right: 480, y: 756 },           // text: right-anchored, baseline y; optional size, optional page
    { key: "accident.trip_type", type: "checkbox",               // checkbox: enum value -> [x,y]
      options: { work: [91, 573], private: [65, 573] } },
  ],
};
export default insurer;
```
Multi-page forms: add `page: 1` (0-based) for fields beyond page 1. Arrays use dotted indices, e.g. `third_parties.0.owner_name`.

# Method
1. **Extractability** — `node C:/Users/eylon/digital-claims-assistant/.pdfwork/coords.mjs "<source pdf>" C:/Users/eylon/digital-claims-assistant/.pdfwork/<insurer>_coords.json`. No positioned text (scanned) → STOP, return ocr_needed=true.
2. **Read the current app template** (if any) + a reference template to see what's mapped and the style. List the canonical fields that appear on the form but are NOT yet mapped — those are your targets (the orchestrator may name specific priority fields).
3. **Find coordinates** — anchor on the form's printed labels from coords.mjs; per-glyph forms → inspect.mjs; checkboxes → boxdetect.mjs (vector squares) or coords.mjs (glyph boxes). Repeat per page as needed.
4. **Write the app template** — enrich mode: add the new `{ key, ... }` entries; leave working ones untouched. Create mode: also copy the source PDF to `assets/<insurer>.pdf` and add the import + registry line in `index.ts`. Canonical keys only.
5. **QA loop** — `cd C:/Users/eylon/digital-claims-assistant/web && npx tsx scripts/fill.ts <insurer> C:/Users/eylon/digital-claims-assistant/.pdfwork/<insurer>_qa.pdf`, then `node C:/Users/eylon/digital-claims-assistant/.pdfwork/render.mjs <qa.pdf> <png> <page> 4 <yTop> <yBot>` and READ the png. Nudge right/y/size/page until every value sits in its blank and every X is centred. Iterate — this is the real work.

# Hard rules
- **Never reverse Hebrew** — engine + fontkit shape RTL; you supply `right` and `y`; text is right-anchored.
- **Canonical keys only.** A form field with no key in `types.ts` → list under `schema_gaps`; never invent.
- **Enums auto-localize** via labels.ts — map the coordinate, don't hardcode Hebrew.
- **Enrich mode:** touch only `templates/<insurer>.ts`. **Create mode:** also add `assets/<insurer>.pdf` and the `index.ts` registry line. Never edit engine.ts / types.ts / labels.ts / sample-claim.ts.
- **OCR forms:** stop and flag; never guess.

# Done when
- The app template fills via `scripts/fill.ts` with the targeted fields correctly placed, verified by reading the render.

# Return (structured — data, not prose)
insurer, template_path, action (created|enriched), ocr_needed, fields_added (list of keys),
checkboxes_added, render_png, confidence (high|medium|low), needs_eyeball, schema_gaps, notes.
