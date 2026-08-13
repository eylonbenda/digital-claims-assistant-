import { isStepKey, type StepKey } from "@/components/collection/steps";
import type { State, UploadedDoc } from "./claim-state";

// Local persistence for the collection wizard: the client is often interrupted
// mid-flow (calls, WhatsApp, tab eviction) — without this they restart from step 0.
// Keyed per token so two claims on the same phone never bleed into each other.
// v2 keys the save by step *key* (stable across reorders) instead of a numeric
// index. A v1 blob left over from an older deploy is migrated best-effort: its
// state is restored (numeric step can't be mapped to a StepKey, so stepKey
// comes back null and the caller resumes at firstIncompleteKey) and the v1 key
// is removed so it isn't re-read.
const VERSION = 2;

export const storageKey = (token: string) => `claim-wizard:v${VERSION}:${token}`;
export const legacyStorageKey = (token: string) => `claim-wizard:v1:${token}`;

type SavedV2 = { stepKey: StepKey; state: State };
type SavedV1 = { step: number; state: State };

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

// Merges a saved (possibly partial/stale) state over `base` (EMPTY + server
// prefill) so a save written by an older deploy missing a newer field still
// loads cleanly. Shared by the v2 and v1 (migration) load paths.
function mergeState(base: State, saved: Partial<State>): State {
  return {
    ...base,
    ...saved,
    insured: { ...base.insured, ...(saved.insured ?? {}) },
    driver: { ...base.driver, ...(saved.driver ?? {}) },
    vehicle: { ...base.vehicle, ...(saved.vehicle ?? {}) },
    accident: { ...base.accident, ...(saved.accident ?? {}) },
    thirdParty: { ...base.thirdParty, ...(saved.thirdParty ?? {}) },
    declaration: { ...base.declaration, ...(saved.declaration ?? {}) },
    documents: sanitizeDocs(saved.documents),
  };
}

export function saveWizardState(token: string, stepKey: StepKey, state: State): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(storageKey(token), JSON.stringify({ stepKey, state } satisfies SavedV2));
  } catch {
    // Quota/serialization failures must never break the wizard itself.
  }
}

function loadV2(s: Storage, token: string, base: State): { stepKey: StepKey | null; state: State } | null {
  let parsed: unknown;
  try {
    const raw = s.getItem(storageKey(token));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { stepKey, state } = parsed as { stepKey?: unknown; state?: unknown };
  if (typeof state !== "object" || state === null) return null;
  return {
    stepKey: isStepKey(stepKey) ? stepKey : null,
    state: mergeState(base, state as Partial<State>),
  };
}

// Migrates a v1 `{ step: number; state }` blob: state is restored, stepKey
// comes back null (a numeric step can't map onto a StepKey), and the v1 key
// is removed best-effort so it isn't re-read on the next load.
function loadV1(s: Storage, token: string, base: State): { stepKey: StepKey | null; state: State } | null {
  let parsed: unknown;
  try {
    const raw = s.getItem(legacyStorageKey(token));
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { step, state } = parsed as Partial<SavedV1>;
  if (typeof step !== "number" || typeof state !== "object" || state === null) return null;
  try {
    s.removeItem(legacyStorageKey(token));
  } catch {
    // best-effort — a stray v1 key surviving is harmless, just re-checked next load.
  }
  return { stepKey: null, state: mergeState(base, state as Partial<State>) };
}

// Restores a saved session, merging over `base` (EMPTY + server prefill).
// Tries the v2 key first; falls back to migrating a v1 blob if present.
export function loadWizardState(token: string, base: State): { stepKey: StepKey | null; state: State } | null {
  const s = storage();
  if (!s) return null;
  return loadV2(s, token, base) ?? loadV1(s, token, base);
}

export function clearWizardState(token: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(storageKey(token));
    s.removeItem(legacyStorageKey(token));
  } catch {
    // ignore
  }
}
