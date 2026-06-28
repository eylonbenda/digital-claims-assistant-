export const meta = {
  name: 'map-insurer-forms',
  description: 'Create the app coordinate template for each remaining Israeli insurer accident-notice PDF, then independently render-verify each filled form.',
  phases: [
    { title: 'Map', detail: 'one pdf-form-mapper agent per insurer' },
    { title: 'Verify', detail: 'independent render-QA of each filled form' },
  ],
}

const PDF_DIR = 'C:/Users/eylon/digital-claims-assistant/docs/accidentStatementPdf'

// Already in the app (excluded): hachshara, migdal, menora.
// Text-extractable -> create now:
const TODO = [
  { slug: 'shlomo', insurer: 'שלמה',  pdf: PDF_DIR + '/שלמה_ביטוח_טופס_הודעה.pdf', note: 'layout is close to מנורה — use templates/menora.ts as a starting reference' },
  { slug: 'libra',  insurer: 'ליברה', pdf: PDF_DIR + '/הודעה-על-תאונה-ליברה.pdf', note: 'thin/modern digital form; includes odometer + detailed area_type (עירוני/בין-עירוני/חניון/צומת)' },
  { slug: 'harel',  insurer: 'הראל',  pdf: PDF_DIR + '/הראל_טופס_הודעה.pdf' },
  { slug: 'aig',    insurer: 'AIG',   pdf: PDF_DIR + '/טופס-הודעה-על-תאונה-aig.pdf', note: 'כלל-group template; includes bank_account fields' },
]

// Scanned images — need an OCR pre-step before any coordinates exist. Skipped; reported at the end.
const OCR_FIRST = [
  { slug: 'phoenix', insurer: 'הפניקס', pdf: PDF_DIR + '/הפניקס_טופס_תאונה.pdf' },
  { slug: 'ayalon',  insurer: 'איילון', pdf: PDF_DIR + '/איילון_טופס_תאונה.pdf' },
]

const MAP_SCHEMA = {
  type: 'object',
  required: ['insurer', 'slug', 'ocr_needed'],
  properties: {
    insurer: { type: 'string' },
    slug: { type: 'string' },
    ocr_needed: { type: 'boolean' },
    template_path: { type: 'string' },
    fields_mapped: { type: 'number' },
    checkboxes_mapped: { type: 'number' },
    render_png: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    needs_eyeball: { type: 'array', items: { type: 'string' } },
    schema_gaps: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  required: ['insurer', 'overall'],
  properties: {
    insurer: { type: 'string' },
    overall: { type: 'string', enum: ['pass', 'partial', 'fail'] },
    rtl_ok: { type: 'boolean' },
    checkboxes_ok: { type: 'boolean' },
    field_verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { key: { type: 'string' }, ok: { type: 'boolean' }, issue: { type: 'string' } },
      },
    },
    notes: { type: 'string' },
  },
}

log(`Creating app templates for ${TODO.length} text-extractable insurers. ${OCR_FIRST.length} need OCR first (skipped): ${OCR_FIRST.map(o => o.insurer).join(', ')}.`)

// Pipeline, not a barrier: each insurer flows map -> verify on its own. A slow form
// doesn't hold up the others, and a verify starts the moment its own mapping lands.
const results = await pipeline(
  TODO,
  // Stage 1 — create the app template. agentType wires this to .claude/agents/pdf-form-mapper.md
  (item) => agent(
    `CREATE the app template for insurer "${item.insurer}" (slug: ${item.slug}).\n` +
    `Source PDF: ${item.pdf}\n` +
    (item.note ? `IMPORTANT: ${item.note}\n` : '') +
    `Full create mode per your instructions: copy the source PDF to web/src/lib/formfill/assets/${item.slug}.pdf, ` +
    `write web/src/lib/formfill/templates/${item.slug}.ts (ground on the app types.ts + reference templates), ` +
    `register it in web/src/lib/formfill/index.ts, then run the fill+render QA loop until aligned. ` +
    `If the PDF is a scanned image with no extractable text, STOP and return ocr_needed=true.`,
    { label: `map:${item.slug}`, phase: 'Map', schema: MAP_SCHEMA, agentType: 'pdf-form-mapper' }
  ),
  // Stage 2 — independent verify via the APP engine (skipped if mapping bailed for OCR)
  (mapping, item) => {
    if (!mapping || mapping.ocr_needed) return mapping
    return agent(
      `Independently verify the filled form for "${item.insurer}" (slug: ${item.slug}). Do NOT edit anything.\n` +
      `Fill (app engine): cd C:/Users/eylon/digital-claims-assistant/web && npx tsx scripts/fill.ts ${item.slug} C:/Users/eylon/digital-claims-assistant/.pdfwork/${item.slug}_verify.pdf\n` +
      `Render each page: node C:/Users/eylon/digital-claims-assistant/.pdfwork/render.mjs C:/Users/eylon/digital-claims-assistant/.pdfwork/${item.slug}_verify.pdf C:/Users/eylon/digital-claims-assistant/.pdfwork/${item.slug}_verify_p<N>.png <N> 4 <yTop> <yBot>\n` +
      `Read the PNGs. Check every value sits in the correct blank, Hebrew RTL ordering is correct, ` +
      `and each checkbox X is centred. Report per-field verdicts and an overall pass/partial/fail.`,
      { label: `verify:${item.slug}`, phase: 'Verify', schema: VERDICT_SCHEMA }
    ).then((verify) => ({ ...mapping, verify }))
  }
)

const done = results.filter(Boolean)
return {
  mapped: done.filter((r) => !r.ocr_needed),
  needs_attention: done.filter((r) => r.ocr_needed || (r.verify && r.verify.overall !== 'pass')),
  ocr_first: OCR_FIRST,
}
