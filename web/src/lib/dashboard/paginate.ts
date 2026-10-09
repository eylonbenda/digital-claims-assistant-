// Client-side paging for the dashboard lists. The page fetches the whole book on
// purpose — composeDashboard orders cards by last activity across queue/tasks/brief,
// which a DB-level range() would break — so paging is a pure slice of what's loaded.

export type Page<T> = {
  items: T[];
  /** 1-based, clamped into [1, pages]. */
  page: number;
  pages: number;
  /** 1-based inclusive row numbers for "21–40 מתוך 83"; 0/0 when empty. */
  from: number;
  to: number;
  total: number;
};

export function paginate<T>(all: T[], page: number, size: number): Page<T> {
  const total = all.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * size;
  const items = all.slice(start, start + size);
  return { items, page: p, pages, from: items.length ? start + 1 : 0, to: start + items.length, total };
}

/** `?p=` / `?tp=` → positive int, anything else → 1. */
export function parsePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^\d+$/.test(v) && Number(v) >= 1 ? Number(v) : 1;
}
