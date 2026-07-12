"use client";

import { useState } from "react";
import type { Fault } from "@/lib/formfill/types";
import type { ClaimAnalysis } from "@/lib/ai/analyze";
import { compressImage } from "@/lib/images/compress";
import { type State, type DocType, type UploadedDoc, toClaimData, INSURERS } from "@/lib/collection/claim-state";

export type { State };

const EMPTY: State = {
  consent: false,
  injuries: null,
  policyInsurer: "",
  insuranceType: "",
  insured: { first_name: "", last_name: "", id_number: "", mobile: "", city: "" },
  vehicle: { plate: "", manufacturer: "", year: "" },
  accident: { date: "", time: "", location: "", description: "" },
  fault: null,
  thirdParty: { present: null, name: "", phone: "", plate: "", insurer: "" },
  documents: [],
};

// Prefill allows partial nested objects (e.g. only mobile pre-filled from the claim).
type StatePrefill = Partial<{
  consent: boolean;
  injuries: boolean | null;
  policyInsurer: string;
  insuranceType: State["insuranceType"];
  insured: Partial<State["insured"]>;
  vehicle: Partial<State["vehicle"]>;
  accident: Partial<State["accident"]>;
  fault: Fault | null;
  thirdParty: Partial<State["thirdParty"]>;
}>;

function mergeWithEmpty(prefill?: StatePrefill): State {
  if (!prefill) return EMPTY;
  return {
    ...EMPTY,
    ...prefill,
    insured: { ...EMPTY.insured, ...(prefill.insured ?? {}) },
    vehicle: { ...EMPTY.vehicle, ...(prefill.vehicle ?? {}) },
    accident: { ...EMPTY.accident, ...(prefill.accident ?? {}) },
    thirdParty: { ...EMPTY.thirdParty, ...(prefill.thirdParty ?? {}) },
  };
}

const STEP_TITLES = [
  "הסכמה",
  "נפגעים",
  "הפרטים שלך",
  "הרכב שלך",
  "מתי ואיפה",
  "מה קרה",
  "מי אשם",
  "הצד השני",
  "מסמכים ותמונות",
  "סיכום ושליחה",
];

function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
      />
    </label>
  );
}

function Choice<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={`rounded-xl border px-4 py-3 text-right text-base transition-colors ${
            value === o.v ? "border-blue-600 bg-blue-50 font-medium" : "border-zinc-300 hover:bg-zinc-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function CollectionWizard({
  token,
  prefill,
}: {
  token: string;
  prefill?: StatePrefill;
}) {
  const [s, setS] = useState<State>(() => mergeWithEmpty(prefill));
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const insurerTemplated = INSURERS.find((i) => i.key === s.policyInsurer)?.templated ?? false;
  const [busy, setBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ClaimAnalysis | null>(null);

  const last = STEP_TITLES.length - 1;
  const set = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }));
  const docDone = s.documents.filter((d) => d.status === "done").length;

  const filled = (v: string) => v.trim().length > 0;

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return s.consent;
      case 1:
        return s.injuries !== null;
      case 2:
        return (
          filled(s.insured.first_name) &&
          filled(s.insured.last_name) &&
          filled(s.insured.id_number) &&
          filled(s.insured.mobile) &&
          filled(s.insured.city) &&
          filled(s.policyInsurer) &&
          filled(s.insuranceType)
        );
      case 3:
        return filled(s.vehicle.plate) && filled(s.vehicle.manufacturer) && filled(s.vehicle.year);
      case 4:
        return filled(s.accident.date) && filled(s.accident.time) && filled(s.accident.location);
      case 5:
        return filled(s.accident.description);
      case 6:
        return s.fault !== null;
      case 7:
        // present must be chosen; if a third party is involved, require its key identifiers.
        return (
          s.thirdParty.present !== null &&
          (!s.thirdParty.present ||
            (filled(s.thirdParty.name) && filled(s.thirdParty.plate) && filled(s.thirdParty.insurer)))
        );
      default:
        return true;
    }
  };

  async function downloadForm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/forms/${s.policyInsurer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toClaimData(s)),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${s.policyInsurer}-הודעה-על-תאונה.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  const TYPE_LABELS: Record<string, string> = {
    own_policy: "פוליסת הלקוח",
    third_party_report: "צד ג' — דוח פרטי",
    third_party_settlement: "צד ג' — הסדר",
    unknown: "לא ידוע",
  };

  const CONFIDENCE_LABELS: Record<string, string> = {
    high: "גבוהה",
    medium: "בינונית",
    low: "נמוכה",
  };

  async function runAnalyze() {
    setAiBusy(true);
    setAiError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toClaimData(s)),
      });
      const json = await res.json();
      if (!res.ok) {
        setAiError(json.error ?? "שגיאה בניתוח");
        return;
      }
      setAiResult(json as ClaimAnalysis);
    } catch {
      setAiError("שגיאת רשת");
    } finally {
      setAiBusy(false);
    }
  }

  async function handleSubmit() {
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/claims/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, collected: s }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(json.error ?? "שגיאה בשליחה");
        return;
      }
      setDone(true);
    } catch {
      setSubmitError("שגיאת רשת");
    } finally {
      setSubmitBusy(false);
    }
  }

  function onPickDocs(type: DocType, files: FileList) {
    Array.from(files).forEach((file) => uploadDoc(type, file));
  }

  function removeDoc(localId: string) {
    setS((p) => ({ ...p, documents: p.documents.filter((d) => d.localId !== localId) }));
  }

  async function uploadDoc(type: DocType, file: File) {
    const localId = crypto.randomUUID();
    setS((p) => ({
      ...p,
      documents: [...p.documents, { localId, type, name: file.name, status: "uploading" }],
    }));
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append("token", token);
      fd.append("type", type);
      fd.append("file", compressed);
      const res = await fetch("/api/claims/documents", { method: "POST", body: fd });
      const err = res.ok
        ? undefined
        : (((await res.json().catch(() => ({}))) as { error?: string }).error ?? "ההעלאה נכשלה");
      setS((p) => ({
        ...p,
        documents: p.documents.map((d) =>
          d.localId === localId ? { ...d, status: res.ok ? "done" : "error", error: err } : d
        ),
      }));
    } catch {
      setS((p) => ({
        ...p,
        documents: p.documents.map((d) => (d.localId === localId ? { ...d, status: "error" } : d)),
      }));
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <div className="text-5xl">✅</div>
        <h1 className="mt-4 text-2xl font-bold">הפרטים נשלחו לסוכן</h1>
        <p className="mt-2 text-zinc-600">
          תודה. הסוכן יקבל תיק מסודר עם כל מה שמסרת. אם חסר משהו, ניצור איתך קשר.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-5">
      {/* progress */}
      <div className="mb-5">
        <div className="h-1.5 w-full rounded-full bg-zinc-200">
          <div
            className="h-1.5 rounded-full bg-blue-600 transition-all"
            style={{ width: `${(step / last) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          שלב {step + 1} מתוך {STEP_TITLES.length} · {STEP_TITLES[step]}
        </p>
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div>
            <h2 className="text-xl font-bold">דיווח על תאונת רכב</h2>
            <p className="mt-2 text-zinc-600">
              ניקח 3 דקות לאסוף את פרטי התאונה, כדי שהסוכן יוכל לטפל מהר. הפרטים מועברים
              לסוכן הביטוח שלך בלבד.
            </p>
            <label className="mt-5 flex items-start gap-2">
              <input
                type="checkbox"
                checked={s.consent}
                onChange={(e) => set({ consent: e.target.checked })}
                className="mt-1 h-5 w-5"
              />
              <span className="text-sm">אני מאשר/ת איסוף הפרטים והעברתם לסוכן הביטוח.</span>
            </label>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-xl font-bold">יש נפגעים בתאונה?</h2>
            <div className="mt-4">
              <Choice<"yes" | "no">
                value={s.injuries === null ? null : s.injuries ? "yes" : "no"}
                options={[
                  { v: "yes", label: "כן, יש נפגעים" },
                  { v: "no", label: "לא, אין נפגעים" },
                ]}
                onChange={(v) => set({ injuries: v === "yes" })}
              />
            </div>
            {s.injuries && (
              <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                <strong>אם יש סכנת חיים — חייגו 101 מיד.</strong> מומלץ גם להזעיק משטרה
                (100). אפשר להמשיך במילוי לאחר מכן — הסוכן יקבל התראה דחופה.
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">הפרטים שלך</h2>
            <Text required label="שם פרטי" value={s.insured.first_name} onChange={(v) => set({ insured: { ...s.insured, first_name: v } })} />
            <Text required label="שם משפחה" value={s.insured.last_name} onChange={(v) => set({ insured: { ...s.insured, last_name: v } })} />
            <Text required label="תעודת זהות" value={s.insured.id_number} onChange={(v) => set({ insured: { ...s.insured, id_number: v } })} />
            <Text required label="טלפון נייד" type="tel" value={s.insured.mobile} onChange={(v) => set({ insured: { ...s.insured, mobile: v } })} />
            <Text required label="עיר מגורים" value={s.insured.city} onChange={(v) => set({ insured: { ...s.insured, city: v } })} />
            <label className="block">
              <span className="text-sm text-zinc-600">
                חברת הביטוח שלך<span className="text-red-500"> *</span>
              </span>
              <select
                value={s.policyInsurer}
                onChange={(e) => set({ policyInsurer: e.target.value })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
              >
                <option value="">בחר/י חברת ביטוח…</option>
                {INSURERS.map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-zinc-600">
                סוג הביטוח שלך<span className="text-red-500"> *</span>
              </span>
              <select
                value={s.insuranceType}
                onChange={(e) => set({ insuranceType: e.target.value as State["insuranceType"] })}
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
              >
                <option value="">בחר/י סוג ביטוח…</option>
                <option value="comprehensive">מקיף</option>
                <option value="third_party">צד ג׳</option>
                <option value="mandatory">חובה בלבד</option>
              </select>
              <span className="mt-1 block text-xs text-zinc-400">
                קובע אם ניתן לתבוע דרך הפוליסה שלך.
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">הרכב שלך</h2>
            <Text required label="מספר רישוי" value={s.vehicle.plate} onChange={(v) => set({ vehicle: { ...s.vehicle, plate: v } })} />
            <Text required label="יצרן ודגם" value={s.vehicle.manufacturer} onChange={(v) => set({ vehicle: { ...s.vehicle, manufacturer: v } })} placeholder="לדוגמה: טויוטה קורולה" />
            <Text required label="שנת ייצור" value={s.vehicle.year} onChange={(v) => set({ vehicle: { ...s.vehicle, year: v } })} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">מתי ואיפה קרתה התאונה?</h2>
            <Text required label="תאריך" type="date" value={s.accident.date} onChange={(v) => set({ accident: { ...s.accident, date: v } })} />
            <Text required label="שעה" type="time" value={s.accident.time} onChange={(v) => set({ accident: { ...s.accident, time: v } })} />
            <Text required label="מיקום" value={s.accident.location} onChange={(v) => set({ accident: { ...s.accident, location: v } })} placeholder="צומת / כתובת / כביש" />
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="text-xl font-bold">
              מה קרה?<span className="text-red-500"> *</span>
            </h2>
            <p className="mt-1 text-sm text-zinc-500">תאר/י בקצרה את האירוע במילים שלך.</p>
            <textarea
              value={s.accident.description}
              onChange={(e) => set({ accident: { ...s.accident, description: e.target.value } })}
              rows={5}
              className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
              placeholder="למשל: עצרתי ברמזור אדום ורכב מאחור פגע בי..."
            />
          </div>
        )}

        {step === 6 && (
          <div>
            <h2 className="text-xl font-bold">מי אשם בתאונה?</h2>
            <p className="mt-1 text-sm text-zinc-500">לפי דעתך — אפשר לשנות בהמשך.</p>
            <div className="mt-4">
              <Choice<Fault>
                value={s.fault}
                options={[
                  { v: "third_party", label: "הצד השני אשם" },
                  { v: "me", label: "אני אשם/ת" },
                  { v: "unknown", label: "לא בטוח/ה" },
                ]}
                onChange={(v) => set({ fault: v })}
              />
            </div>
          </div>
        )}

        {step === 7 && (
          <div>
            <h2 className="text-xl font-bold">היה צד שני מעורב?</h2>
            <div className="mt-4">
              <Choice<"yes" | "no">
                value={s.thirdParty.present === null ? null : s.thirdParty.present ? "yes" : "no"}
                options={[
                  { v: "yes", label: "כן" },
                  { v: "no", label: "לא (תאונה עצמית)" },
                ]}
                onChange={(v) => set({ thirdParty: { ...s.thirdParty, present: v === "yes" } })}
              />
            </div>
            {s.thirdParty.present && (
              <div className="mt-4 space-y-3">
                <Text required label="שם הנהג השני" value={s.thirdParty.name} onChange={(v) => set({ thirdParty: { ...s.thirdParty, name: v } })} />
                <Text label="טלפון" type="tel" value={s.thirdParty.phone} onChange={(v) => set({ thirdParty: { ...s.thirdParty, phone: v } })} />
                <Text required label="מספר רישוי" value={s.thirdParty.plate} onChange={(v) => set({ thirdParty: { ...s.thirdParty, plate: v } })} />
                <Text required label="חברת הביטוח שלו" value={s.thirdParty.insurer} onChange={(v) => set({ thirdParty: { ...s.thirdParty, insurer: v } })} />
              </div>
            )}
          </div>
        )}

        {step === 8 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">מסמכים ותמונות</h2>
            <p className="text-sm text-zinc-500">
              לא חובה, אבל זה מאיץ את הטיפול — אפשר לצלם עכשיו או לצרף אחר כך.
            </p>
            <DocField label="תמונות הרכב והנזק" hint="כמה זוויות של הנזק" type="car_photo" multiple docs={s.documents} onPick={onPickDocs} onRemove={removeDoc} />
            <DocField label="רישיון נהיגה" type="drivers_license" docs={s.documents} onPick={onPickDocs} onRemove={removeDoc} />
            <DocField label="רישיון רכב" type="vehicle_reg" docs={s.documents} onPick={onPickDocs} onRemove={removeDoc} />
          </div>
        )}

        {step === 9 && (
          <div>
            <h2 className="text-xl font-bold">סיכום</h2>
            <dl className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm">
              <Row k="שם" v={`${s.insured.first_name} ${s.insured.last_name}`.trim() || "—"} />
              <Row k="רכב" v={[s.vehicle.plate, s.vehicle.manufacturer].filter(Boolean).join(" · ") || "—"} />
              <Row k="מתי" v={[s.accident.date, s.accident.time].filter(Boolean).join(" ") || "—"} />
              <Row k="איפה" v={s.accident.location || "—"} />
              <Row k="מי אשם" v={s.fault === "me" ? "אני" : s.fault === "third_party" ? "הצד השני" : "לא בטוח"} />
              <Row k="נפגעים" v={s.injuries ? "כן" : "לא"} />
              <Row k="מסמכים" v={docDone ? `${docDone} צורפו` : "—"} />
            </dl>

            <div className="mt-5 rounded-xl border border-zinc-200 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">סיכום חכם (AI)</p>
                <button
                  type="button"
                  onClick={runAnalyze}
                  disabled={aiBusy}
                  className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm text-blue-700 disabled:opacity-50"
                >
                  {aiBusy ? "מסכם…" : "סכם עם AI"}
                </button>
              </div>
              {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
              {aiResult && (
                <div className="mt-3 space-y-2 text-sm">
                  <p>{aiResult.summary}</p>
                  <p>
                    <span className="text-zinc-500">סוג תביעה מוצע: </span>
                    <strong>{TYPE_LABELS[aiResult.proposed_claim_type]}</strong>
                    <span className="mr-1 text-xs text-zinc-400">
                      (ודאות: {CONFIDENCE_LABELS[aiResult.confidence]})
                    </span>
                    {aiResult.rationale ? ` — ${aiResult.rationale}` : ""}
                  </p>
                  {aiResult.needs_agent_choice && (
                    <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      ⓘ הסוכן יבחר בין &quot;דוח פרטי&quot; ל&quot;הסדר&quot; לפי אסטרטגיית הטיפול.
                    </p>
                  )}
                  {aiResult.fault_assessment.mismatch && (
                    <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                      ⚠️ אי-התאמה בין האשמה שסומנה לתיאור האירוע — לבדיקת הסוכן.
                    </p>
                  )}
                  {aiResult.viability_warning && (
                    <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                      ⚠️ {aiResult.viability_warning}
                    </p>
                  )}
                  {aiResult.missing.length > 0 && (
                    <div>
                      <span className="text-zinc-500">חסר / לא ברור:</span>
                      <ul className="mr-4 list-disc">
                        {aiResult.missing.map((m, i) => (
                          <li key={i}>{m}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-zinc-200 p-4">
              <p className="text-sm text-zinc-600">
                תצוגה מקדימה: טופס &quot;הודעה על תאונה&quot; ממולא מהפרטים שמסרת
                {insurerTemplated ? "." : " — הסוכן יכין את הטופס עבור חברת הביטוח שלך."}
              </p>
              {insurerTemplated && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadForm}
                    disabled={busy}
                    className="rounded-lg border border-blue-600 px-3 py-2 text-sm text-blue-700 disabled:opacity-50"
                  >
                    {busy ? "מייצר…" : "צור טופס ממולא"}
                  </button>
                </div>
              )}
            </div>

            {submitError && (
              <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

      {step < last && [2, 3, 4, 5, 7].includes(step) && !canNext() && (
        <p className="mt-3 text-center text-xs text-amber-600">
          יש למלא את שדות החובה המסומנים בכוכבית (*)
        </p>
      )}

      {/* footer nav */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setStep((n) => Math.max(0, n - 1))}
          disabled={step === 0}
          className="rounded-lg px-4 py-2 text-zinc-600 disabled:opacity-40"
        >
          חזרה
        </button>
        {step < last ? (
          <button
            type="button"
            onClick={() => setStep((n) => n + 1)}
            disabled={!canNext()}
            className="flex-1 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white disabled:opacity-40"
          >
            המשך
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitBusy}
            className="flex-1 rounded-lg bg-green-600 px-4 py-3 font-medium text-white disabled:opacity-50"
          >
            {submitBusy ? "שולח…" : "שליחה לסוכן"}
          </button>
        )}
      </div>
    </div>
  );
}

function DocField({
  label,
  hint,
  type,
  multiple,
  docs,
  onPick,
  onRemove,
}: {
  label: string;
  hint?: string;
  type: DocType;
  multiple?: boolean;
  docs: UploadedDoc[];
  onPick: (type: DocType, files: FileList) => void;
  onRemove: (localId: string) => void;
}) {
  const mine = docs.filter((d) => d.type === type);
  return (
    <div className="rounded-xl border border-zinc-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <label className="shrink-0 cursor-pointer rounded-lg border border-blue-600 px-3 py-1.5 text-sm text-blue-700">
          {mine.length ? "הוסף/י" : "צילום / קובץ"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple={multiple}
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onPick(type, e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      {mine.length > 0 && (
        <ul className="mt-2 space-y-1">
          {mine.map((d) => (
            <li key={d.localId} className="text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {d.status === "uploading" ? "⏳" : d.status === "done" ? "✅" : "⚠️"} {d.name}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(d.localId)}
                  className="shrink-0 text-xs text-zinc-400 hover:text-red-600"
                >
                  הסר
                </button>
              </div>
              {d.status === "error" && d.error && (
                <p className="mt-0.5 text-xs text-red-600">{d.error}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between px-4 py-2">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
