// Which figures read from the appraiser's documents are still waiting for the
// clerk, and how they land in the damages lines. Pure.
// Spec: docs/superpowers/specs/2026-11-23-appraiser-amounts-design.md
import { DAMAGE_KEYS, DEFAULT_VAT, type Damages } from "./damages";

/** payload: { document_id, doc_type, verified, repair?, diminished_value?, assessor_fee? } */
export const EV_EXTRACTED = "appraiser_amounts_extracted";
/** payload: { document_id, outcome: "applied" | "dismissed" } */
export const EV_RESOLVED = "appraiser_amounts_resolved";

export const APPRAISER_REPORT = "appraiser_report";
export const ASSESSOR_FEE_INVOICE = "assessor_fee_invoice";

// Which damages lines each document type may suggest. A figure under any other
// key in an event is ignored.
export const SOURCE_KEYS = {
  [APPRAISER_REPORT]: ["repair", "diminished_value"],
  [ASSESSOR_FEE_INVOICE]: ["assessor_fee"],
} as const;
export type SourceDocType = keyof typeof SOURCE_KEYS;
export type SuggestedKey = (typeof SOURCE_KEYS)[SourceDocType][number];

// Lines whose figure was cross-checked against a VAT-inclusive total in the
// document; diminished value carries no VAT, so there is nothing to check it against.
const CHECKED_KEYS: ReadonlySet<SuggestedKey> = new Set(["repair", "assessor_fee"]);

export const isSourceDocType = (t: unknown): t is SourceDocType =>
  typeof t === "string" && Object.hasOwn(SOURCE_KEYS, t);

export type SuggestionLine = {
  key: SuggestedKey;
  suggested: number;
  /** What the damages hold now, when it differs. */
  current: number | null;
  /** The document's own totals did not confirm this figure — look before applying. */
  unverified: boolean;
};
export type Suggestion = { documentIds: string[]; lines: SuggestionLine[] };

export type SuggestionEvent = { type: string; payload_json: unknown };

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const positive = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

// `events` newest first; `liveDocs` maps each document still on the claim to its
// current type. Per document the newest extraction counts, as long as the document
// is still filed under the type it was read as and no later resolution names it.
// Only lines that differ from the current damages are offered — a clerk who typed
// the same figures has nothing to confirm. When two documents state the same line,
// the newer reading wins.
export function pendingSuggestion(
  events: SuggestionEvent[],
  liveDocs: ReadonlyMap<string, string>,
  damages: Damages | null | undefined,
): Suggestion | null {
  const seen = new Set<string>(); // documents already decided by a newer event
  const taken = new Set<SuggestedKey>();
  const documentIds: string[] = [];
  const lines: SuggestionLine[] = [];

  for (const ev of events) {
    const p = obj(ev.payload_json);
    const documentId = p && typeof p.document_id === "string" ? p.document_id : null;
    if (!p || !documentId) continue;
    if (ev.type !== EV_RESOLVED && ev.type !== EV_EXTRACTED) continue;
    if (seen.has(documentId)) continue;
    seen.add(documentId);
    if (ev.type === EV_RESOLVED) continue;

    // Events written before doc_type existed were all appraiser reports.
    const docType = p.doc_type === undefined ? APPRAISER_REPORT : p.doc_type;
    if (!isSourceDocType(docType) || liveDocs.get(documentId) !== docType) continue;

    let contributed = false;
    for (const key of SOURCE_KEYS[docType]) {
      const suggested = positive(p[key]);
      if (suggested === null || taken.has(key)) continue;
      taken.add(key);
      const current = positive(damages?.[key]?.amount);
      if (current === suggested) continue;
      lines.push({ key, suggested, current, unverified: CHECKED_KEYS.has(key) && p.verified !== true });
      contributed = true;
    }
    if (contributed) documentIds.push(documentId);
  }
  // Shown in the order the damages lines appear in the editor and the letter.
  lines.sort((a, b) => DAMAGE_KEYS.indexOf(a.key) - DAMAGE_KEYS.indexOf(b.key));
  return lines.length ? { documentIds, lines } : null;
}

/** The damages with the suggested lines written in; every other line is kept. */
export function applySuggestion(damages: Damages | null | undefined, lines: SuggestionLine[]): Damages {
  const next: Damages = { ...(damages ?? {}) };
  for (const l of lines) {
    next[l.key] = { amount: l.suggested, vat: next[l.key]?.vat ?? DEFAULT_VAT[l.key] };
  }
  return next;
}
