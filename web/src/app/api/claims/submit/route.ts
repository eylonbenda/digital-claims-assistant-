import { createServiceClient } from "@/lib/supabase/service";
import { templates, fillForm } from "@/lib/formfill";
import { toClaimData, type State } from "@/lib/collection/claim-state";

export const runtime = "nodejs"; // form-fill reads the template PDF + font from disk

const BUCKET = "claim-docs";

const TERMINAL_STATUSES = new Set([
  "submitted",
  "classified",
  "form_generated",
  "checklist_active",
  "closed",
]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.token) {
    return Response.json({ error: "token required" }, { status: 400 });
  }

  const { token, collected } = body as { token: string; collected: Record<string, unknown> };

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Supabase not configured — silently succeed so the wizard still works in demo mode.
    return Response.json({ ok: true, demo: true });
  }

  const svc = createServiceClient();

  const { data: claim } = await svc
    .from("claims")
    .select("id, status")
    .eq("access_token", token)
    .single();

  if (!claim) return Response.json({ error: "invalid token" }, { status: 404 });
  if (TERMINAL_STATUSES.has(claim.status)) {
    return Response.json({ error: "already submitted" }, { status: 409 });
  }

  const insured = (collected?.insured ?? {}) as Record<string, string>;
  const thirdParty = (collected?.thirdParty ?? {}) as Record<string, unknown>;
  const policyInsurer = (collected?.policyInsurer as string) || null;

  const clientName =
    [insured.first_name, insured.last_name].filter(Boolean).join(" ") || null;

  // Persist collected data; summary_json.analysis filled later by AI flow.
  await svc
    .from("claims")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      client_name: clientName,
      client_phone: insured.mobile || null,
      policy_insurer: policyInsurer,
      fault: (collected?.fault as string) || null,
      summary_json: { collected },
    })
    .eq("id", claim.id);

  // Auto-generate the accident-notice form once, here, when we have a coordinate
  // template for the claimant's insurer. Stored in the case file so the agent never
  // regenerates it. Best-effort: a fill failure must not fail the submission.
  if (policyInsurer && policyInsurer in templates) {
    try {
      const template = templates[policyInsurer as keyof typeof templates];
      const pdf = await fillForm(template, toClaimData(collected as unknown as State));
      const formPath = `${claim.id}/forms/${policyInsurer}-${Date.now()}.pdf`;
      const { error: upErr } = await svc.storage
        .from(BUCKET)
        .upload(formPath, new Uint8Array(pdf), {
          contentType: "application/pdf",
          upsert: false,
        });
      if (!upErr) {
        await svc.from("generated_forms").insert({
          claim_id: claim.id,
          kind: "accident_notice",
          insurer: policyInsurer,
          storage_path: formPath,
        });
        await svc.from("claim_events").insert({
          claim_id: claim.id,
          type: "form_generated",
          payload_json: { insurer: policyInsurer },
        });
      }
    } catch {
      // Swallow — the agent can still fill on demand from the dashboard.
    }
  }

  if (thirdParty.present) {
    await svc.from("third_parties").insert({
      claim_id: claim.id,
      name: (thirdParty.name as string) || null,
      phone: (thirdParty.phone as string) || null,
      plate: (thirdParty.plate as string) || null,
      insurer: (thirdParty.insurer as string) || null,
    });
  }

  await svc.from("claim_events").insert({
    claim_id: claim.id,
    type: "submitted",
    payload_json: { sections: Object.keys(collected ?? {}) },
  });

  return Response.json({ ok: true });
}
