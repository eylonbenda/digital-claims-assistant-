// Immutable nested set by dot-path (numeric keys create/copy arrays). A "" or undefined value
// removes the key; booleans are stored as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function setPath(obj: any, path: string, value: string | boolean | undefined): any {
  const keys = path.split(".");
  const root = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const nextIsIndex = /^\d+$/.test(keys[i + 1]);
    const existing = cur[k];
    cur[k] =
      existing != null
        ? Array.isArray(existing)
          ? [...existing]
          : { ...existing }
        : nextIsIndex
          ? []
          : {};
    cur = cur[k];
  }
  const last = keys[keys.length - 1];
  if (value === "" || value === undefined) delete cur[last];
  else cur[last] = value;
  return root;
}
