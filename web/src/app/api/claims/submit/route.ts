import { createServiceClient } from "@/lib/supabase/service";

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
      fault: (collected?.fault as string) || null,
      summary_json: { collected },
    })
    .eq("id", claim.id);

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
