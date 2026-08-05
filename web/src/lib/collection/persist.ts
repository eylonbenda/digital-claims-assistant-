import type { State, UploadedDoc } from "./claim-state";

// Local persistence for the collection wizard: the client is often interrupted
// mid-flow (calls, WhatsApp, tab eviction) — without this they restart from step 0.
// Keyed per token so two claims on the same phone never bleed into each other.
// Bump VERSION on any breaking State shape change; stale saves are discarded.
const VERSION = 1;

export const storageKey = (token: string) => `claim-wizard:v${VERSION}:${token}`;

type Saved = { step: number; state: State };

function storage(): Storage | null {
  // localStorage can throw (SSR, private mode with storage disabled).
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

// Uploads that were still in flight (or had failed) when the page died never
// reached the server — drop them so the client re-attaches instead of trusting
// a ✅-less ghost row. Completed uploads are already persisted server-side.
function sanitizeDocs(docs: unknown): UploadedDoc[] {
  if (!Array.isArray(docs)) return [];
  return (docs as UploadedDoc[]).filter((d) => d && d.status === "done");
}

export function saveWizardState(token: string, step: number, state: State): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(storageKey(token), JSON.stringify({ step, state } satisfies Saved));
  } catch {
    // Quota/serialization failures must never break the wizard itself.
  }
}

// Restores a saved session, merging over `base` (EMPTY + server prefill) so a
// save written by an older deploy missing a newer field still loads cleanly.
export function loadWizardState(token: string, base: State): Saved | null {
  const s = storage();
  if (!s) return null;
  let parsed: unknown;
  try {
    const raw = s.getItem(storageKey(token));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { step, state } = parsed as { step?: unknown; state?: unknown };
  if (typeof step !== "number" || typeof state !== "object" || state === null) return null;
  const saved = state as Partial<State>;
  return {
    step,
    state: {
      ...base,
      ...saved,
      insured: { ...base.insured, ...(saved.insured ?? {}) },
      driver: { ...base.driver, ...(saved.driver ?? {}) },
      vehicle: { ...base.vehicle, ...(saved.vehicle ?? {}) },
      accident: { ...base.accident, ...(saved.accident ?? {}) },
      thirdParty: { ...base.thirdParty, ...(saved.thirdParty ?? {}) },
      declaration: { ...base.declaration, ...(saved.declaration ?? {}) },
      documents: sanitizeDocs(saved.documents),
    },
  };
}

export function clearWizardState(token: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(storageKey(token));
  } catch {
    // ignore
  }
}
