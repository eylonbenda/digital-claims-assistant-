import { toILDate } from "@/lib/dates";

// Canonical `ClaimData` carries dates as ISO `yyyy-mm-dd` (what the wizard's and the
// agent editor's `<input type="date">` produce). Insurer forms want dd/mm/yyyy, and the
// fill engine draws values verbatim — so normalize here, at the fill boundary, and every
// path is covered: client submit, agent on-demand regeneration, and agent-edited
// `summary_json.form_data`.
//
// Keyed on field name rather than an explicit path list so array members
// (`injured_persons[].birth_date`, `third_parties[]`) are reached too, and a date field
// added to `ClaimData` later is handled without a second edit here.
const DATE_KEYS = new Set(["date", "birth_date", "license_date", "license_expiry"]);

// Returns a deep copy — `summary_json.collected` is an audit record and must not be mutated.
export function normalizeClaimDates<T>(data: T): T {
  const walk = (node: unknown, key?: string): unknown => {
    if (typeof node === "string") return key && DATE_KEYS.has(key) ? toILDate(node) : node;
    if (Array.isArray(node)) return node.map((v) => walk(v, key));
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, walk(v, k)])
      );
    }
    return node;
  };
  return walk(data) as T;
}
