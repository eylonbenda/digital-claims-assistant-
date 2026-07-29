// Date display for Israeli forms and UI: dd/mm/yyyy.
//
// Dates are stored ISO (`yyyy-mm-dd`) everywhere — that's what `<input type="date">`
// reads and writes, and what sorts correctly — and converted here at the render
// boundary. Anything that isn't a plain ISO date passes through untouched, so this
// is idempotent and safe to apply to already-formatted or free-text values.
export function toILDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
}
