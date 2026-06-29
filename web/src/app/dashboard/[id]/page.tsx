import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import ClaimDocuments, { type DocView } from "./ClaimDocuments";
import FormGenerator from "./FormGenerator";

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
      "id, client_name, client_phone, claim_type, status, summary_json, created_at, submitted_at"
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
