// URL mirroring for dashboard list state (`?stage=`, `?p=`). The hooks in
// app/dashboard/Pager.tsx read state back through useSearchParams, so this only
// builds the next URL. The search query never goes through here — it's PII.

/** `href` with `key` set to `value`, or removed when `value` is null. Returns path+search+hash. */
export function withSearchParam(href: string, key: string, value: string | null): string {
  const url = new URL(href);
  if (value === null) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  return `${url.pathname}${url.search}${url.hash}`;
}
