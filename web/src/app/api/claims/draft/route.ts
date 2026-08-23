import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs"; // needs the service client

// The wizard's in-progress answers, synced so an abandoned or device-switched
// session is not lost (localStorage is per-browser; before this, nothing reached
// the server until final submit). Stored under summary_json.draft; the submit
// route overwrites summary_json with { collected }, which clears the draft.
const MAX_BYTES = 64 * 1024; // drafts are small; anything bigger is not a wizard state

// Once submitted the collected data is authoritative — a late/stale draft write
// must not resurrect summary_json.draft. Mirrors /c/[token]'s post-submit gate.
const DRAFT_BLOCKED_STATUSES = new Set([
  "submitted",
  "classified",
  "form_generated",
  "checklist_active",
  "closed",
]);

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
  if (DRAFT_BLOCKED_STATUSES.has(claim.status)) {
    return Response.json({ error: "claim already submitted" }, { status: 409 });
  }

  // Merge, don't clobber — summary_json is shared (collected/analysis/form_data live here too).
  const summary = (claim.summary_json as Record<string, unknown> | null) ?? {};
  const { error } = await svc
    .from("claims")
    .update({
      summary_json: {
        ...summary,
        draft: {
          ...(typeof step_key === "string" ? { step_key } : {}),
          collected,
          saved_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", claim.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
