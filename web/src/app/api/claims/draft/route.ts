import { createServiceClient } from "@/lib/supabase/service";
import { stepIndex } from "@/components/collection/steps";
import { SUBMITTED_STATUSES } from "@/lib/collection/submit";

export const runtime = "nodejs"; // needs the service client

// The wizard's in-progress answers, synced so an abandoned or device-switched
// session is not lost (localStorage is per-browser; before this, nothing reached
// the server until final submit). Stored under summary_json.draft; the submit
// route overwrites summary_json with { collected }, which clears the draft.
const MAX_BYTES = 64 * 1024; // drafts are small; anything bigger is not a wizard state


// POST { token, step_key, collected } -> merges summary_json.draft on the claim.
export async function POST(request: Request) {
  const raw = await request.text().catch(() => null);
  if (!raw || raw.length > MAX_BYTES) {
    return Response.json({ error: "invalid draft payload" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { token, step_key, collected } = (body ?? {}) as {
    token?: unknown;
    step_key?: unknown;
    collected?: unknown;
  };
  if (typeof token !== "string" || !token || typeof collected !== "object" || collected === null) {
    return Response.json({ error: "token and collected are required" }, { status: 400 });
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Supabase not configured — succeed silently so the wizard works in demo mode.
    return Response.json({ ok: true, demo: true });
  }

  const svc = createServiceClient();
  const { data: claim } = await svc
    .from("claims")
    .select("id, status, summary_json")
    .eq("access_token", token)
    .single();
  if (!claim) {
    return Response.json({ error: "invalid token" }, { status: 404 });
  }
  // Once submitted the collected data is authoritative — a late/stale draft write
  // must not resurrect summary_json.draft.
  if (SUBMITTED_STATUSES.has(claim.status)) {
    return Response.json({ error: "claim already submitted" }, { status: 409 });
  }

  // Merge, don't clobber — summary_json is shared (collected/analysis/form_data live here too).
  const summary = (claim.summary_json as Record<string, unknown> | null) ?? {};

  // Furthest step reached, kept monotonic. This is the funnel signal: the claimant
  // moves backwards freely, so `step_key` alone (wherever they happened to stop)
  // understates their progress. Needed to answer how far abandoned sessions get —
  // the open remainder on C1 in docs/assumptions-canvas.md — and to see whether a
  // newly required field starts costing completions.
  const prevDraft = (summary.draft as Record<string, unknown> | null) ?? {};
  const prevMax = prevDraft.max_step_key;
  const maxStepKey =
    stepIndex(step_key) > stepIndex(prevMax) ? (step_key as string) : (prevMax as string | undefined);
  // Conditional on the status we read. The last wizard edit schedules a debounced
  // draft save that can race the final submit; if submit flips the status between
  // our read and this write, this matches 0 rows instead of writing the stale
  // summary back over the just-submitted `collected`.
  const { data: written, error } = await svc
    .from("claims")
    .update({
      summary_json: {
        ...summary,
        draft: {
          ...(typeof step_key === "string" ? { step_key } : {}),
          ...(typeof maxStepKey === "string" ? { max_step_key: maxStepKey } : {}),
          ...(prevDraft.first_saved_at
            ? { first_saved_at: prevDraft.first_saved_at }
            : { first_saved_at: new Date().toISOString() }),
          collected,
          saved_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", claim.id)
    .eq("status", claim.status)
    .select("id");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!written?.length) {
    return Response.json({ error: "claim already submitted" }, { status: 409 });
  }
  return Response.json({ ok: true });
}
