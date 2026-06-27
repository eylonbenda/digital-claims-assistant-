"use client";

import { useState } from "react";
import type { ClaimData, Fault } from "@/lib/formfill/types";
import type { ClaimAnalysis } from "@/lib/ai/analyze";

export type State = {
  consent: boolean;
  injuries: boolean | null;
  insured: { first_name: string; last_name: string; id_number: string; mobile: string; city: string };
  vehicle: { plate: string; manufacturer: string; year: string };
  accident: { date: string; time: string; location: string; description: string };
  fault: Fault | null;
  thirdParty: { present: boolean | null; name: string; phone: string; plate: string; insurer: string };
};

const EMPTY: State = {
  consent: false,
  injuries: null,
  insured: { first_name: "", last_name: "", id_number: "", mobile: "", city: "" },
  vehicle: { plate: "", manufacturer: "", year: "" },
  accident: { date: "", time: "", location: "", description: "" },
  fault: null,
  thirdParty: { present: null, name: "", phone: "", plate: "", insurer: "" },
};

// Prefill allows partial nested objects (e.g. only mobile pre-filled from the claim).
type StatePrefill = Partial<{
  consent: boolean;
  injuries: boolean | null;
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
  "סיכום ושליחה",
];

function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-600">{label}</span>
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

function toClaimData(s: State): ClaimData {
  return {
    insured: {
      first_name: s.insured.first_name,
      last_name: s.insured.last_name,
      id_number: s.insured.id_number,
      mobile: s.insured.mobile,
      city: s.insured.city,
    },
    vehicle: {
      plate: s.vehicle.plate,
      manufacturer: s.vehicle.manufacturer,
      year: s.vehicle.year,
      type: "private",
    },
    accident: {
      date: s.accident.date,
      time: s.accident.time,
      location: s.accident.location,
      description: s.accident.description,
    },
    fault: s.fault ?? "unknown",
    // Third-party block — only when the claimant reported one. Was previously dropped here,
    // so it never reached the PDF or the AI analysis.
    ...(s.thirdParty.present
      ? {
          third_parties: [
            {
              owner_name: s.thirdParty.name,
              driver_name: s.thirdParty.name,
              phone: s.thirdParty.phone,
              vehicle_plate: s.thirdParty.plate,
              insurer: s.thirdParty.insurer,
            },
          ],
        }
      : {}),
  };
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
  const [insurer, setInsurer] = useState("migdal");
  const [busy, setBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<ClaimAnalysis | null>(null);

  const last = STEP_TITLES.length - 1;
  const set = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }));

  const canNext = (): boolean => {
    switch (step) {
      case 0:
        return s.consent;
      case 1:
        return s.injuries !== null;
      case 6:
        return s.fault !== null;
      case 7:
        return s.thirdParty.present !== null;
      default:
        return true;
    }
  };

  async function downloadForm() {
    setBusy(true);
    try {
      const res = await fetch(`/api/forms/${insurer}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(toClaimData(s)),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${insurer}-הודעה-על-תאונה.pdf`;
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
            <Text label="שם פרטי" value={s.insured.first_name} onChange={(v) => set({ insured: { ...s.insured, first_name: v } })} />
            <Text label="שם משפחה" value={s.insured.last_name} onChange={(v) => set({ insured: { ...s.insured, last_name: v } })} />
            <Text label="תעודת זהות" value={s.insured.id_number} onChange={(v) => set({ insured: { ...s.insured, id_number: v } })} />
            <Text label="טלפון נייד" type="tel" value={s.insured.mobile} onChange={(v) => set({ insured: { ...s.insured, mobile: v } })} />
            <Text label="עיר מגורים" value={s.insured.city} onChange={(v) => set({ insured: { ...s.insured, city: v } })} />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">הרכב שלך</h2>
            <Text label="מספר רישוי" value={s.vehicle.plate} onChange={(v) => set({ vehicle: { ...s.vehicle, plate: v } })} />
            <Text label="יצרן ודגם" value={s.vehicle.manufacturer} onChange={(v) => set({ vehicle: { ...s.vehicle, manufacturer: v } })} placeholder="לדוגמה: טויוטה קורולה" />
            <Text label="שנת ייצור" value={s.vehicle.year} onChange={(v) => set({ vehicle: { ...s.vehicle, year: v } })} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">מתי ואיפה קרתה התאונה?</h2>
            <Text label="תאריך" type="date" value={s.accident.date} onChange={(v) => set({ accident: { ...s.accident, date: v } })} />
            <Text label="שעה" type="time" value={s.accident.time} onChange={(v) => set({ accident: { ...s.accident, time: v } })} />
            <Text label="מיקום" value={s.accident.location} onChange={(v) => set({ accident: { ...s.accident, location: v } })} placeholder="צומת / כתובת / כביש" />
          </div>
        )}

        {step === 5 && (
          <div>
            <h2 className="text-xl font-bold">מה קרה?</h2>
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
                <Text label="שם הנהג השני" value={s.thirdParty.name} onChange={(v) => set({ thirdParty: { ...s.thirdParty, name: v } })} />
                <Text label="טלפון" type="tel" value={s.thirdParty.phone} onChange={(v) => set({ thirdParty: { ...s.thirdParty, phone: v } })} />
                <Text label="מספר רישוי" value={s.thirdParty.plate} onChange={(v) => set({ thirdParty: { ...s.thirdParty, plate: v } })} />
                <Text label="חברת הביטוח שלו" value={s.thirdParty.insurer} onChange={(v) => set({ thirdParty: { ...s.thirdParty, insurer: v } })} />
              </div>
            )}
          </div>
        )}

        {step === 8 && (
          <div>
            <h2 className="text-xl font-bold">סיכום</h2>
            <dl className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm">
              <Row k="שם" v={`${s.insured.first_name} ${s.insured.last_name}`.trim() || "—"} />
              <Row k="רכב" v={[s.vehicle.plate, s.vehicle.manufacturer].filter(Boolean).join(" · ") || "—"} />
              <Row k="מתי" v={[s.accident.date, s.accident.time].filter(Boolean).join(" ") || "—"} />
              <Row k="איפה" v={s.accident.location || "—"} />
              <Row k="מי אשם" v={s.fault === "me" ? "אני" : s.fault === "third_party" ? "הצד השני" : "לא בטוח"} />
              <Row k="נפגעים" v={s.injuries ? "כן" : "לא"} />
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
                    {aiResult.rationale ? ` — ${aiResult.rationale}` : ""}
                  </p>
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
                תצוגה מקדימה: יצירת טופס &quot;הודעה על תאונה&quot; ממולא מהפרטים שמסרת.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={insurer}
                  onChange={(e) => setInsurer(e.target.value)}
                  className="rounded-lg border border-zinc-300 px-2 py-2 text-sm"
                >
                  <option value="migdal">מגדל</option>
                  <option value="hachshara">הכשרה</option>
                </select>
                <button
                  type="button"
                  onClick={downloadForm}
                  disabled={busy}
                  className="rounded-lg border border-blue-600 px-3 py-2 text-sm text-blue-700 disabled:opacity-50"
                >
                  {busy ? "מייצר…" : "צור טופס ממולא"}
                </button>
              </div>
            </div>

            {submitError && (
              <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between px-4 py-2">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
