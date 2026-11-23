// Which figures read from the appraiser report are still waiting for the clerk,
// and how they land in the damages lines. Pure.
// Spec: docs/superpowers/specs/2026-11-23-appraiser-amounts-design.md
import { DEFAULT_VAT, type Damages } from "./damages";

/** payload: { document_id, repair, diminished_value, verified } */
export const EV_EXTRACTED = "appraiser_amounts_extracted";
/** payload: { document_id, outcome: "applied" | "dismissed" } */
export const EV_RESOLVED = "appraiser_amounts_resolved";

export const SUGGESTED_KEYS = ["repair", "diminished_value"] as const;
export type SuggestedKey = (typeof SUGGESTED_KEYS)[number];

export type SuggestionLine = { key: SuggestedKey; suggested: number; current: number | null };
export type Suggestion = { documentId: string; verified: boolean; lines: SuggestionLine[] };

export type SuggestionEvent = { type: string; payload_json: unknown };

const obj = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const positive = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;

// `events` newest first. The newest extraction of a report that is still filed on
// the claim wins; it is pending until a later resolution names the same document,
// and only for the lines that differ from what the damages already hold — a clerk
// who typed the same figures has nothing to confirm.
export function pendingSuggestion(
  events: SuggestionEvent[],
  liveDocIds: ReadonlySet<string>,
  damages: Damages | null | undefined,
): Suggestion | null {
  const resolved = new Set<string>();
  for (const ev of events) {
    const p = obj(ev.payload_json);
    const documentId = p && typeof p.document_id === "string" ? p.document_id : null;
    if (!p || !documentId) continue;
    if (ev.type === EV_RESOLVED) {
      resolved.add(documentId);
      continue;
    }
    if (ev.type !== EV_EXTRACTED || !liveDocIds.has(documentId)) continue;
    if (resolved.has(documentId)) return null;

    const lines: SuggestionLine[] = [];
    for (const key of SUGGESTED_KEYS) {
      const suggested = positive(p[key]);
      if (suggested === null) continue;
      const current = positive(damages?.[key]?.amount);
      if (current !== suggested) lines.push({ key, suggested, current });
    }
    return lines.length ? { documentId, verified: p.verified === true, lines } : null;
  }
  return null;
}

/** The damages with the suggested lines written in; every other line is kept. */
export function applySuggestion(damages: Damages | null | undefined, lines: SuggestionLine[]): Damages {
  const next: Damages = { ...(damages ?? {}) };
  for (const l of lines) {
    next[l.key] = { amount: l.suggested, vat: next[l.key]?.vat ?? DEFAULT_VAT[l.key] };
  }
  return next;
}
