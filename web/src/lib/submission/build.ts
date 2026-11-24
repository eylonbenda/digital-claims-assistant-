import type { SupabaseClient } from "@supabase/supabase-js";
import { computeChecklist, satisfiedDocTypes, type ComputedItem } from "@/lib/claims/checklist";
import { effectiveClaimData, type ClaimSummaryJson } from "@/lib/formfill/effective";
import { formFacts, isRepairPriced, FORM_KIND } from "@/lib/forms/kinds";
import type { ClaimType } from "@/lib/tasks/types";
import { composeSubmission, type Submission } from "./compose";

// Everything the submission is built from, as the database holds it. The claim page
// and the send route both go through buildSubmission(), so the packet the clerk
// confirms on screen is the packet that is sent.
export type SubmissionSource = {
  claim: {
    id: string;
    client_name: string | null;
    claim_type: ClaimType;
    policy_insurer: string | null;
    at_fault_insurer: string | null;
    summary_json: unknown;
    created_at: string;
    checklist_state: Record<string, boolean> | null;
    theft?: boolean | null;
    lien?: boolean | null;
    business_use?: boolean | null;
    policy_activated?: boolean | null;
    garage_network_rider?: boolean | null;
    no_repair?: boolean | null;
  };
  docs: { type: string; storage_path: string }[];
  // generated_forms, newest first.
  forms: { insurer: string | null; storage_path: string; kind: string }[];
  thirdParties: { plate: string | null; insurer: string | null }[];
  agencyName: string | null;
};

export const SUBMISSION_CLAIM_COLUMNS =
  "id, client_name, claim_type, policy_insurer, at_fault_insurer, summary_json, created_at, checklist_state, theft, lien, business_use, policy_activated, garage_network_rider, no_repair";

export function buildSubmission(src: SubmissionSource): {
  checklist: ComputedItem[];
  submission: Submission | null;
} {
  const { claim, docs, forms } = src;
  const summary = claim.summary_json as
    | (ClaimSummaryJson & { collected?: { docsDeferred?: Record<string, boolean> } })
    | null;
  const formClaimData = effectiveClaimData(summary as ClaimSummaryJson);

  // generated_forms holds more than the accident notice: only that kind counts as
  // the form; a generated demand form counts as the demand_form document instead.
  const facts = formFacts(forms.map((f) => f.kind), isRepairPriced(formClaimData));
  const uploadedDocTypes = new Set([
    ...satisfiedDocTypes(docs.map((d) => ({ type: d.type })), claim.created_at),
    ...facts.generatedDocTypes,
  ]);
  // What the claimant said they would send later (wizard `docsDeferred`).
  const deferredDocTypes = new Set(
    Object.entries(summary?.collected?.docsDeferred ?? {})
      .filter(([, v]) => v === true)
      .map(([k]) => k),
  );
  const checklist = computeChecklist(
    claim.claim_type,
    uploadedDocTypes,
    facts.hasAccidentNotice,
    claim.checklist_state ?? {},
    {
      theft: !!claim.theft,
      lien: !!claim.lien,
      business_use: !!claim.business_use,
      policy_activated: !!claim.policy_activated,
      garage_network_rider: !!claim.garage_network_rider, no_repair: !!claim.no_repair,
    },
    deferredDocTypes,
    claim.created_at,
  );

  const tp = src.thirdParties[0] ?? null;
  const submission = composeSubmission({
    claim: {
      id: claim.id,
      claimType: claim.claim_type,
      clientName: claim.client_name,
      ourPlate: formClaimData?.vehicle?.plate ?? null,
      // Canonical third_parties[0] first: with several vehicles (multi-car accidents) the
      // table rows carry no order, the form data does.
      tpPlate: formClaimData?.third_parties?.[0]?.vehicle_plate || tp?.plate || null,
      eventDate: formClaimData?.accident?.date ?? null,
      atFaultInsurer:
        claim.at_fault_insurer ?? (formClaimData?.third_parties?.[0]?.insurer || tp?.insurer) ?? null,
      policyInsurer: claim.policy_insurer,
      agencyName: src.agencyName,
    },
    checklist,
    docs,
    forms: forms
      .filter((f) => f.kind === FORM_KIND.accidentNotice)
      .map((f) => ({ insurer: f.insurer, storage_path: f.storage_path })),
    demandForms: forms
      .filter((f) => f.kind === FORM_KIND.demand)
      .map((f) => ({ storage_path: f.storage_path })),
  });

  return { checklist, submission };
}

/** Reads a claim's submission source through `supabase` (RLS-scoped). Null = not visible. */
export async function loadSubmissionSource(
  supabase: SupabaseClient,
  claimId: string,
  authUserId: string,
): Promise<(SubmissionSource & { handlingStatus: string | null; status: string }) | null> {
  const { data: claim } = await supabase
    .from("claims")
    .select(`${SUBMISSION_CLAIM_COLUMNS}, handling_status, status`)
    .eq("id", claimId)
    .maybeSingle();
  if (!claim) return null;

  const [{ data: docs }, { data: forms }, { data: tps }, { data: agent }] = await Promise.all([
    supabase
      .from("claim_documents")
      .select("type, storage_path, uploaded_at")
      .eq("claim_id", claimId)
      .order("uploaded_at", { ascending: true }),
    supabase
      .from("generated_forms")
      .select("insurer, storage_path, kind, created_at")
      .eq("claim_id", claimId)
      .order("created_at", { ascending: false }),
    supabase.from("third_parties").select("plate, insurer").eq("claim_id", claimId),
    supabase.from("agents").select("name").eq("auth_user_id", authUserId).maybeSingle(),
  ]);

  const c = claim as unknown as SubmissionSource["claim"] & { handling_status: string | null; status: string };
  return {
    claim: c,
    docs: (docs ?? []).map((d) => ({ type: d.type as string, storage_path: d.storage_path as string })),
    forms: (forms ?? []).map((f) => ({
      insurer: (f.insurer as string | null) ?? null,
      storage_path: f.storage_path as string,
      kind: f.kind as string,
    })),
    thirdParties: (tps ?? []) as { plate: string | null; insurer: string | null }[],
    agencyName: (agent?.name as string | null) ?? null,
    handlingStatus: c.handling_status ?? null,
    status: c.status,
  };
}
