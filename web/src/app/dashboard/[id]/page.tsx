import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeChecklist } from "@/lib/claims/checklist";
import { classifyFromClaimData } from "@/lib/claims/classify";
import { getOrCreateAnalysis, type SummaryJson } from "@/lib/claims/analysis-cache";
import { toClaimData, type State } from "@/lib/collection/claim-state";
import { effectiveClaimData, type ClaimSummaryJson } from "@/lib/formfill/effective";
import ClaimDocuments, { type DocView } from "./ClaimDocuments";
import FormGenerator from "./FormGenerator";
import FormFieldEditor from "./FormFieldEditor";
import ChecklistPanel from "./ChecklistPanel";
import AgentDocUpload from "./AgentDocUpload";
import ClaimTypeConfirm from "./ClaimTypeConfirm";

const BUCKET = "claim-docs";
const SIGNED_TTL = 60 * 60; // 1h — agent viewing session

type GeneratedForm = {
  id: string;
  insurer: string | null;
  created_at: string;
  url: string | null;
};

const INSURER_LABEL: Record<string, string> = {
  migdal: "מגדל",
  menora: "מנורה",
  hachshara: "הכשרה",
  harel: "הראל",
  clal: "כלל",
  phoenix: "הפניקס",
  ayalon: "איילון",
  shlomo: "שלמה",
  libra: "ליברה",
  aig: "AIG",
};

const TYPE_LABEL: Record<string, string> = {
  own_policy: "פוליסת הלקוח",
  third_party_report: "צד ג' — דוח",
  third_party_settlement: "צד ג' — הסדר",
  unknown: "—",
};

const STATUS_LABEL: Record<string, string> = {
  created: "נוצר",
  in_progress: "בטיפול",
  submitted: "הוגש",
  classified: "סווג",
  form_generated: "טופס נוצר",
  checklist_active: "רשימת פעולות",
  closed: "סגור",
  abandoned: "נטוש",
};

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this to the agent's own claims — a foreign id returns null.
  const { data: claim } = await supabase
    .from("claims")
    .select(
      "id, client_name, client_phone, claim_type, status, summary_json, created_at, submitted_at, checklist_state, theft, lien, business_use, policy_activated, garage_network_rider"
    )
    .eq("id", id)
    .single();

  if (!claim) notFound();

  // RLS-scoped reads (claim_belongs_to_me): the claimant-uploaded docs + the
  // auto-generated accident-notice form(s).
  const [{ data: rows }, { data: formRows }] = await Promise.all([
    supabase
      .from("claim_documents")
      .select("id, type, storage_path, mime, uploaded_at")
      .eq("claim_id", id)
      .order("uploaded_at", { ascending: true }),
    supabase
      .from("generated_forms")
      .select("id, insurer, storage_path, created_at")
      .eq("claim_id", id)
      .order("created_at", { ascending: false }),
  ]);

  // Lazy-cached AI analysis: computes once on first view, then reads from
  // summary_json.analysis. Supplies the narrative signals (incident kind / inferred
  // fault) that the structured fields alone can't provide. Best-effort → null.
  const summaryJson = claim.summary_json as SummaryJson;
  const analysis = await getOrCreateAnalysis(claim.id, summaryJson);

  // Deterministic classifier, now narrative-aware when analysis is available. This is
  // the proposal + confidence the agent sees before confirming.
  const collected = summaryJson?.collected;
  const classification = collected
    ? classifyFromClaimData(
        toClaimData(collected),
        analysis
          ? {
              incidentKind: analysis.incident_kind,
              inferredFault: analysis.fault_assessment.inferred,
            }
          : undefined,
      )
    : null;

  // Canonical data that fills the accident-notice form: the agent's edits if any,
  // else the client's submission. Drives the editable form-field panel.
  const formSummary = claim.summary_json as ClaimSummaryJson;
  const formClaimData = effectiveClaimData(formSummary);
  const formDataEdited = !!formSummary?.form_data;

  // Compute the dynamic checklist on the server — pure function, no I/O.
  const flags = {
    theft:                !!(claim as Record<string, unknown>).theft,
    lien:                 !!(claim as Record<string, unknown>).lien,
    business_use:         !!(claim as Record<string, unknown>).business_use,
    policy_activated:     !!(claim as Record<string, unknown>).policy_activated,
    garage_network_rider: !!(claim as Record<string, unknown>).garage_network_rider,
  };
  const uploadedDocTypes = new Set((rows ?? []).map((r) => r.type as string));
  const checklistState = ((claim as Record<string, unknown>).checklist_state as Record<string, boolean> | null) ?? {};
  const checklistItems = computeChecklist(
    claim.claim_type,
    uploadedDocTypes,
    (formRows ?? []).length > 0,
    checklistState,
    flags,
  );

  // Ownership is already proven by the RLS queries above; the service client only
  // mints short-lived signed URLs for the private bucket (Storage RLS is separate).
  const docs: DocView[] = [];
  const forms: GeneratedForm[] = [];
  const allPaths = [
    ...(rows ?? []).map((r) => r.storage_path),
    ...(formRows ?? []).map((r) => r.storage_path),
  ];
  if (allPaths.length) {
    const svc = createServiceClient();
    const { data: signed } = await svc.storage
      .from(BUCKET)
      .createSignedUrls(allPaths, SIGNED_TTL);
    const urlByPath = new Map(
      (signed ?? []).map((s) => [s.path, s.error ? null : s.signedUrl])
    );
    for (const r of rows ?? []) {
      docs.push({
        id: r.id,
        type: r.type,
        mime: r.mime,
        uploaded_at: r.uploaded_at,
        url: urlByPath.get(r.storage_path) ?? null,
      });
    }
    for (const r of formRows ?? []) {
      forms.push({
        id: r.id,
        insurer: r.insurer,
        created_at: r.created_at,
        url: urlByPath.get(r.storage_path) ?? null,
      });
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50" dir="rtl">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← חזרה לתביעות
          </Link>
          <span className="text-sm text-zinc-500">{user.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <h1 className="text-xl font-semibold text-zinc-900">
            {claim.client_name ?? "ללא שם"}
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-600">
            {claim.client_phone && <span>{claim.client_phone}</span>}
            <span>סוג: {TYPE_LABEL[claim.claim_type] ?? claim.claim_type}</span>
            <span>סטטוס: {STATUS_LABEL[claim.status] ?? claim.status}</span>
            <span>
              נפתח: {new Date(claim.created_at).toLocaleDateString("he-IL")}
            </span>
          </div>
        </section>

        {classification && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-zinc-900">
              סיווג התביעה
            </h2>

            {analysis && (
              <div className="mb-3 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
                <p className="text-zinc-700">{analysis.summary}</p>
                {analysis.missing.length > 0 && (
                  <div className="mt-3">
                    <span className="text-zinc-500">חסר / לא ברור:</span>
                    <ul className="mr-4 mt-1 list-disc text-zinc-600">
                      {analysis.missing.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <ClaimTypeConfirm
              claimId={claim.id}
              currentType={claim.claim_type}
              classification={classification}
            />
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            רשימת מסמכים והתקדמות
          </h2>
          <ChecklistPanel
            claimId={claim.id}
            claimType={claim.claim_type}
            initialItems={checklistItems}
          />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            העלאת מסמך לתיק
          </h2>
          <AgentDocUpload claimId={claim.id} />
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            הודעה על תאונה
          </h2>

          {forms.length > 0 && (
            <ul className="mb-3 space-y-2">
              {forms.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-green-200 bg-green-50 px-4 py-3"
                >
                  <span className="text-sm text-zinc-700">
                    <span className="ml-1">📄</span>
                    טופס ממולא
                    {f.insurer && ` — ${INSURER_LABEL[f.insurer] ?? f.insurer}`}
                    <span className="mr-1 text-zinc-400">
                      ({new Date(f.created_at).toLocaleDateString("he-IL")})
                    </span>
                  </span>
                  {f.url ? (
                    <a
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-blue-600 hover:underline"
                    >
                      פתח / הורד ↗
                    </a>
                  ) : (
                    <span className="text-xs text-red-500">קישור לא זמין</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Manual fill / regenerate — for untemplated insurers, older claims,
              or after the claim data was edited. */}
          <FormGenerator
            claimId={claim.id}
            hasData={!!(claim.summary_json as { collected?: unknown } | null)?.collected}
            hasStoredForm={forms.length > 0}
          />

          {/* Agent edits the canonical form data (complete missing / fix wrong fields);
              regenerating the form above then fills from these edits. */}
          {formClaimData && (
            <div className="mt-3">
              <FormFieldEditor
                claimId={claim.id}
                initial={formClaimData}
                missing={analysis?.missing ?? []}
                edited={formDataEdited}
              />
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">
            מסמכים ותמונות{" "}
            <span className="text-sm font-normal text-zinc-400">
              ({docs.length})
            </span>
          </h2>
          <ClaimDocuments docs={docs} />
        </section>
      </main>
    </div>
  );
}
