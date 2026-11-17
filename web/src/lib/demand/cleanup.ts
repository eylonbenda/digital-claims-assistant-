// Every row except the newest by created_at; a tie goes to the larger id, so two
// overlapping regenerations always agree on which single demand form survives.
export function staleDemandRows<T extends { id: string; created_at: string }>(rows: T[]): T[] {
  if (rows.length <= 1) return [];
  const newer = (a: T, b: T) => {
    const d = Date.parse(a.created_at) - Date.parse(b.created_at);
    if (d !== 0 && !Number.isNaN(d)) return d > 0;
    return a.id > b.id;
  };
  let keep = rows[0];
  for (const r of rows) if (newer(r, keep)) keep = r;
  return rows.filter((r) => r !== keep);
}
