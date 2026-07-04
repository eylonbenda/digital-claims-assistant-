import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { templates, fillForm } from "@/lib/formfill";
import type { Template } from "@/lib/formfill/engine";
import { effectiveClaimData, type ClaimSummaryJson } from "@/lib/formfill/effective";

export const runtime = "nodejs"; // needs fs to read the template PDF + font

const BUCKET = "claim-docs";

function resolve(insurer: string): Template | undefined {
  return templates[insurer as keyof typeof templates];
}

// Persist the filled PDF into the case file, replacing any prior copy for the same
// insurer so manual regeneration after a data edit doesn't pile up duplicates.
// Best-effort: a storage hiccup must not fail the agent's download.
async function persistForm(claimId: string, insurer: string, pdf: Uint8Array) {
  try {
    const svc = createServiceClient();
    const { data: prior } = await svc
      .from("generated_forms")
      .select("id, storage_path")
      .eq("claim_id", claimId)
      .eq("insurer", insurer)
      .eq("kind", "accident_notice");
    if (prior?.length) {
      await svc.storage.from(BUCKET).remove(prior.map((p) => p.storage_path));
      await svc
        .from("generated_forms")
        .delete()
        .in("id", prior.map((p) => p.id));
    }
    const path = `${claimId}/forms/${insurer}-${Date.now()}.pdf`;
    const { error } = await svc.storage
      .from(BUCKET)
      .upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (!error) {
      await svc.from("generated_forms").insert({
        claim_id: claimId,
        kind: "accident_notice",
        insurer,
        storage_path: path,
      });
    }
  } catch {
    // ignore — the agent still gets the PDF in the response below
  }
}

// GET — agent-side: fill the chosen insurer's accident-notice form from the claim's
// stored collected data. Auth-gated; RLS scopes the read to the agent's own claims.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; insurer: string }> }
) {
  const { id, insurer } = await params;

  const template = resolve(insurer);
  if (!template) {
    return Response.json(
      { error: `unknown insurer: ${insurer}`, available: Object.keys(templates) },
      { status: 404 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  // RLS scopes this to the agent's own claims — a foreign id returns null.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, summary_json")
    .eq("id", id)
    .single();

  if (!claim) return Response.json({ error: "claim not found" }, { status: 404 });

  // Prefer the agent's edited form_data; fall back to the client's submission.
  const claimData = effectiveClaimData(claim.summary_json as ClaimSummaryJson);
  if (!claimData) {
    return Response.json(
      { error: "no collected data yet — the client hasn't submitted the form" },
      { status: 409 }
    );
  }

  const pdf = new Uint8Array(await fillForm(template, claimData));
  await persistForm(id, insurer, pdf); // archive into the case file (latest per insurer)
  const body = new Blob([pdf], { type: "application/pdf" });
  return new Response(body, {
    headers: {
      "content-disposition": `inline; filename="${insurer}-accident-notice.pdf"`,
    },
  });
}
