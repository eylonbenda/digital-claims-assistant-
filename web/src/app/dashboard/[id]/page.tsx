import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { computeChecklist } from "@/lib/claims/checklist";
import { classifyFromClaimData } from "@/lib/claims/classify";
import { getOrCreateAnalysis, type SummaryJson } from "@/lib/claims/analysis-cache";
import { toClaimData, type State } from "@/lib/collection/claim-state";
import { effectiveClaimData, type ClaimSummaryJson } from "@/lib/formfill/effective";
import { templates } from "@/lib/formfill";
import ClaimDocuments, { type DocView } from "./ClaimDocuments";
import FormGenerator, { type InsurerOption } from "./FormGenerator";
import FormFieldEditor from "./FormFieldEditor";
import ChecklistPanel from "./ChecklistPanel";
import AgentDocUpload from "./AgentDocUpload";
import ClaimTypeConfirm from "./ClaimTypeConfirm";
import ReadinessStrip from "./ReadinessStrip";
import NotesPanel, { type NoteView } from "./NotesPanel";

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

// Scannable status pill — color encodes lifecycle stage so the agent reads state
// at a glance instead of parsing an inline label.
const STATUS_BADGE: Record<string, string> = {
  created: "bg-zinc-100 text-zinc-600 ring-zinc-200",
  in_progress: "bg-blue-100 text-blue-800 ring-blue-200",
  submitted: "bg-indigo-100 text-indigo-800 ring-indigo-200",
  classified: "bg-violet-100 text-violet-800 ring-violet-200",
  form_generated: "bg-teal-100 text-teal-800 ring-teal-200",
  checklist_active: "bg-amber-100 text-amber-800 ring-amber-200",
  closed: "bg-green-100 text-green-800 ring-green-200",
  abandoned: "bg-red-100 text-red-700 ring-red-200",
};

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Absolute origin for links baked into rendered HTML (e.g. the WhatsApp
  // message body) — computed server-side so SSR and client hydration match.
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this to the agent's own claims — a foreign id returns null.
  const { data: claim } = await supabase
    .from("claims")
    .select(
      "id, client_name, client_phone, claim_type, status, urgent, access_token, policy_insurer, summary_json, created_at, submitted_at, checklist_state, theft, lien, business_use, policy_activated, garage_network_rider"
    )
    .eq("id", id)
    .single();

  if (!claim) notFound();

  // RLS-scoped reads (claim_belongs_to_me): the claimant-uploaded docs, the
  // auto-generated accident-notice form(s), and the agent's notes.
  const [{ data: rows }, { data: formRows }, { data: noteRows }] = await Promise.all([
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
    supabase
      .from("claim_notes")
      .select("id, body, created_at")
      .eq("claim_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const notes: NoteView[] = noteRows ?? [];

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

  // docType → newest signed URL, so a satisfied checklist doc-item links straight
  // to the file that satisfied it. `docs` is ascending by uploaded_at, so the last
  // write per type wins (= most recent upload).
  const docUrlByType: Record<string, string> = {};
  for (const d of docs) if (d.url) docUrlByType[d.type] = d.url;

  const statusBadge =
    STATUS_BADGE[claim.status] ?? "bg-zinc-100 text-zinc-600 ring-zinc-200";

  // ── Readiness + triage signals (all derived, no extra I/O) ────────────────
  const blockingMissing = checklistItems
    .filter((i) => i.blocking && !i.done)
    .map((i) => ({ key: i.key, label: i.label }));
  const nextMilestone =
    checklistItems.find((i) => i.kind === "milestone" && !i.done) ?? null;

  const daysOpen = Math.max(
    0,
    Math.floor((Date.now() - new Date(claim.created_at).getTime()) / 86_400_000),
  );
  // Latest touch on the case file: submission, any doc upload, or agent note.
  const lastActivityTs = Math.max(
    claim.submitted_at ? new Date(claim.submitted_at).getTime() : 0,
    ...(rows ?? []).map((r) => new Date(r.uploaded_at).getTime()),
    ...notes.map((n) => new Date(n.created_at).getTime()),
  );
  const daysSinceActivity = lastActivityTs
    ? Math.floor((Date.now() - lastActivityTs) / 86_400_000)
    : null;

  const confirmed = claim.claim_type !== "unknown";
  const classificationNeedsAttention =
    !confirmed || !!classification?.needsAgentChoice || classification?.confidence === "low";

  // Insurer options for manual fill — derived from the template registry.
  const insurerOptions: InsurerOption[] = Object.keys(templates).map((key) => ({
    key,
    label: INSURER_LABEL[key] ?? key,
  }));

  return (
    <div className="min-h-screen bg-zinc-50" dir="rtl">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← חזרה לתביעות
          </Link>
          <span className="text-sm text-zinc-500">{user.email}</span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-6">
        {/* ── Hero: identity + status glance + AI one-line read ───────────── */}
        <section className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-zinc-900">
                  {claim.client_name ?? "ללא שם"}
                </h1>
                {claim.urgent && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200">
                    ⚑ דחוף
                  </span>
                )}
              </div>
              {claim.client_phone && (
                <p className="mt-1 text-sm text-zinc-500" dir="ltr">
                  {claim.client_phone}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${statusBadge}`}
              >
                {STATUS_LABEL[claim.status] ?? claim.status}
              </span>
              <span className="text-sm text-zinc-400">
                {daysOpen === 0 ? "נפתחה היום" : `${daysOpen} ימים פתוחה`}
              </span>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-zinc-100 pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-zinc-400">מסלול</dt>
              <dd className="mt-0.5 font-medium text-zinc-800">
                {TYPE_LABEL[claim.claim_type] ?? claim.claim_type}
                {confirmed && <span className="mr-1 text-green-600">✓</span>}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">מבטח הלקוח</dt>
              <dd className="mt-0.5 font-medium text-zinc-800">
                {claim.policy_insurer
                  ? INSURER_LABEL[claim.policy_insurer] ?? claim.policy_insurer
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">מסמכים בתיק</dt>
              <dd className="mt-0.5 font-medium text-zinc-800">{docs.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">עדכון אחרון בתיק</dt>
              <dd
                className={`mt-0.5 font-medium ${
                  daysSinceActivity !== null && daysSinceActivity >= 4
                    ? "text-amber-700"
                    : "text-zinc-800"
                }`}
              >
                {daysSinceActivity === null
                  ? "—"
                  : daysSinceActivity === 0
                    ? "היום"
                    : `לפני ${daysSinceActivity} ימים`}
              </dd>
            </div>
          </dl>

          {analysis?.summary && (
            <p className="mt-4 rounded-lg bg-zinc-50 px-4 py-3 text-sm leading-relaxed text-zinc-700">
              {analysis.summary}
            </p>
          )}
        </section>

        {/* ── Readiness strip: the page's thesis — submittable or not, and the
               one action that moves it forward ───────────────────────────── */}
        <ReadinessStrip
          claimId={claim.id}
          claimType={claim.claim_type}
          blocking={blockingMissing}
          nextMilestone={
            nextMilestone ? { key: nextMilestone.key, label: nextMilestone.label } : null
          }
          clientPhone={claim.client_phone}
          uploadUrl={`${origin}/c/${claim.access_token}`}
          clientName={claim.client_name}
        />

        {/* ── Two-column: action items (wide) · compact controls (narrow) ── */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main column — what the agent acts on */}
          <div className="space-y-6 lg:col-span-2">
            {classification && (
              <section>
                {/* Confirmed + uncontested → collapse to a one-liner; the track
                    already shows ✓ in the hero. Open when a decision is pending. */}
                <details open={classificationNeedsAttention}>
                  <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-lg font-semibold text-zinc-900 marker:content-none">
                    סיווג התביעה
                    {!classificationNeedsAttention && (
                      <span className="text-sm font-normal text-zinc-400">
                        — מאושר · פתח לפרטים / שינוי
                      </span>
                    )}
                  </summary>

                  {analysis && analysis.missing.length > 0 && (
                    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                      <span className="font-medium text-amber-800">חסר / לא ברור:</span>
                      <ul className="mr-4 mt-1 list-disc text-amber-700">
                        {analysis.missing.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <ClaimTypeConfirm
                    claimId={claim.id}
                    currentType={claim.claim_type}
                    classification={classification}
                  />
                </details>
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
                docUrls={docUrlByType}
              />
            </section>
          </div>

          {/* Sidebar — compact controls: form downloads + upload */}
          <aside className="space-y-6">
            <section>
              <h2 className="mb-3 text-lg font-semibold text-zinc-900">
                הודעה על תאונה
              </h2>

              {forms.length > 0 && (
                <ul className="mb-3 space-y-2">
                  {forms.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-xl border border-green-200 bg-green-50 px-4 py-3"
                    >
                      <div className="text-sm text-zinc-700">
                        <span className="ml-1">📄</span>
                        טופס ממולא
                        {f.insurer && ` — ${INSURER_LABEL[f.insurer] ?? f.insurer}`}
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-xs text-zinc-400">
                          {new Date(f.created_at).toLocaleDateString("he-IL")}
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
                      </div>
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
                insurers={insurerOptions}
                defaultInsurer={claim.policy_insurer}
              />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-zinc-900">
                הערות סוכן
                {notes.length > 0 && (
                  <span className="mr-1 text-sm font-normal text-zinc-400">
                    ({notes.length})
                  </span>
                )}
              </h2>
              <NotesPanel claimId={claim.id} notes={notes} />
            </section>

            <section>
              <h2 className="mb-3 text-lg font-semibold text-zinc-900">
                העלאת מסמך לתיק
              </h2>
              <AgentDocUpload claimId={claim.id} />
            </section>
          </aside>
        </div>

        {/* ── Form-field editor: a drill-in task, collapsed by default ───── */}
        {formClaimData && (
          <section className="rounded-2xl border border-zinc-200 bg-white">
            <details className="group">
              <summary className="flex cursor-pointer items-center justify-between px-5 py-4 text-lg font-semibold text-zinc-900 marker:content-none">
                <span>
                  עריכת שדות הטופס
                  {formDataEdited && (
                    <span className="mr-2 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      נערך
                    </span>
                  )}
                </span>
                <span className="text-sm font-normal text-zinc-400 group-open:hidden">
                  פתח לעריכה ↓
                </span>
                <span className="hidden text-sm font-normal text-zinc-400 group-open:inline">
                  סגור ↑
                </span>
              </summary>
              <div className="border-t border-zinc-100 p-5">
                <p className="mb-4 text-sm text-zinc-500">
                  השלמת שדות חסרים או תיקון שדות לפני מילוי הטופס. לאחר שמירה, יש
                  למלא מחדש את הטופס למעלה כדי להחיל את השינויים.
                </p>
                <FormFieldEditor
                  claimId={claim.id}
                  initial={formClaimData}
                  missing={analysis?.missing ?? []}
                  edited={formDataEdited}
                  claimType={claim.claim_type}
                  insurer={claim.policy_insurer}
                />
              </div>
            </details>
          </section>
        )}

        {/* ── Documents grid: width-hungry, full row ─────────────────────── */}
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
