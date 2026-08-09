"use client";

import { useEffect, useRef, useState } from "react";
import type { Fault } from "@/lib/formfill/types";
import { compressImage } from "@/lib/images/compress";
import { type State, type DocType, type UploadedDoc, INSURERS } from "@/lib/collection/claim-state";
import { clearWizardState, loadWizardState, saveWizardState } from "@/lib/collection/persist";
import { isValidIsraeliId, isPlausiblePlate } from "@/lib/validation/il";
import { reverseGeocode } from "@/lib/geo/reverse";
import {
  isLookupablePlate,
  mergeVehicleInfo,
  normalizePlate,
  type VehicleInfo,
} from "@/lib/vehicles/registry";
import { toILDate } from "@/lib/dates";

export type { State };

// Local calendar date as ISO yyyy-mm-dd (avoids the UTC off-by-one of toISOString near midnight).
function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const EMPTY: State = {
  consent: false,
  injuries: null,
  policyInsurer: "",
  insuranceType: "",
  insured: { first_name: "", last_name: "", id_number: "", mobile: "", city: "" },
  driver: { isInsured: null, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "", manufacturer: "", year: "" },
  accident: { date: "", time: "", location: "", description: "" },
  fault: null,
  thirdParty: { present: null, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: false, poa_third_party: false, signed_date: "" },
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

// Select sentinel for "a company not in the list" — never stored in state.
const OTHER_INSURER = "__other__";

const STEP_TITLES = [
  "הסכמה",
  "נפגעים",
  "הפרטים שלך",
  "מי נהג",
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
  inputMode,
  warn,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "numeric" | "tel";
  warn?: string; // gentle plausibility warning — never blocks continuing
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-600">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-base outline-none focus:border-blue-500 ${
          warn ? "border-amber-400" : "border-zinc-300"
        }`}
      />
      {warn && <span className="mt-1 block text-xs text-amber-600">{warn}</span>}
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
  // Restore a saved session after mount (not in the initializer — the server render
  // has no localStorage, and diverging from it would break hydration). The sync
  // setState here is the point: one deliberate second render with the restored state.
  const [hydrated, setHydrated] = useState(false);
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadWizardState(token, mergeWithEmpty(prefill));
    if (saved) {
      setS(saved.state);
      setStep(Math.min(Math.max(saved.step, 0), STEP_TITLES.length - 1));
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per token
  }, [token]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || done) return;
    saveWizardState(token, step, s);
  }, [hydrated, done, token, step, s]);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const plateDigits = normalizePlate(s.vehicle.plate);
  // Registry lookup by plate: "idle" | "looking" | "found" | "missing".
  const [vehicleLookup, setVehicleLookup] = useState<"idle" | "looking" | "found" | "missing">("idle");
  // What we last auto-filled, so a corrected plate can replace our own values
  // while anything the claimant typed themselves is left untouched.
  const autoFilled = useRef<{ manufacturer: string; year: string } | null>(null);
  // Latest state, readable from async callbacks without re-running the effect.
  // Decisions are made here rather than inside a setS updater: React may invoke
  // an updater more than once, so an updater that also wrote `autoFilled` would
  // see its own write on the second pass and overwrite the claimant's typing.
  const sRef = useRef(s);
  useEffect(() => {
    sRef.current = s;
  }, [s]);
  // Guards against out-of-order responses: only the newest lookup may write.
  const lookupSeq = useRef(0);

  // Look the vehicle up in the Ministry of Transport registry once the plate
  // looks complete. Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (step !== 4) return;
    const timer = setTimeout(async () => {
      if (!isLookupablePlate(plateDigits)) {
        setVehicleLookup("idle");
        return;
      }
      const seq = ++lookupSeq.current;
      setVehicleLookup("looking");
      try {
        const res = await fetch(`/api/vehicle/${plateDigits}`);
        const vehicle = res.ok ? ((await res.json()).vehicle as VehicleInfo | null) : null;
        if (seq !== lookupSeq.current) return; // a newer plate is already in flight
        if (!vehicle) {
          setVehicleLookup("missing");
          return;
        }
        const { manufacturer, year } = mergeVehicleInfo(
          sRef.current.vehicle,
          vehicle,
          autoFilled.current
        );
        autoFilled.current = { manufacturer, year };
        setS((p) => ({ ...p, vehicle: { ...p.vehicle, manufacturer, year } }));
        setVehicleLookup("found");
      } catch {
        setVehicleLookup("idle"); // network hiccup — stay quiet, let them type
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [plateDigits, step]);
  // Third-party insurer: select of known insurers; "חברה אחרת…" reveals a free-text
  // field. A restored session with a custom name (not in the list) reopens it too.
  const [tpInsurerOther, setTpInsurerOther] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const tpInsurerCustom =
    tpInsurerOther ||
    (!!s.thirdParty.insurer &&
      s.thirdParty.insurer !== "לא ידוע" &&
      !INSURERS.some((i) => i.label === s.thirdParty.insurer));

  const last = STEP_TITLES.length - 1;
  const set = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }));
  const docDone = s.documents.filter((d) => d.status === "done").length;

  const filled = (v: string) => v.trim().length > 0;

  // Plausibility warnings (amber, non-blocking). Warn only once enough is typed
  // that it can't be a partial entry — mid-typing must stay quiet.
  const idWarn = (v: string) =>
    v.replace(/\D/g, "").length >= 9 && !isValidIsraeliId(v)
      ? "מספר תעודת הזהות נראה שגוי — כדאי לבדוק שוב"
      : undefined;
  const plateWarn = (v: string) => {
    const t = v.trim();
    if (!t || isPlausiblePlate(t)) return undefined;
    // under-length is likely mid-typing — stay quiet; letters / over-length are definite
    if (/[^\d\s-]/.test(t) || t.replace(/\D/g, "").length > 8)
      return "מספר רישוי הוא בדרך כלל 7–8 ספרות";
    return undefined;
  };

  // Fill the location field from device GPS (clients are often still at the
  // scene). Result stays fully editable; any failure degrades to a hint, and
  // reverse-geocode failure degrades to raw coordinates inside reverseGeocode.
  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("הדפדפן לא תומך באיתור מיקום — אפשר להקליד ידנית");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const label = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        setS((p) => ({ ...p, accident: { ...p.accident, location: label } }));
        setGeoBusy(false);
      },
      () => {
        setGeoError("לא הצלחנו לקבל את המיקום — אפשר להקליד ידנית");
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

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
        // must pick who drove; if someone other than the insured, require their identity.
        return (
          s.driver.isInsured !== null &&
          (s.driver.isInsured ||
            (filled(s.driver.first_name) && filled(s.driver.last_name) && filled(s.driver.id_number)))
        );
      case 4:
        return filled(s.vehicle.plate) && filled(s.vehicle.manufacturer) && filled(s.vehicle.year);
      case 5:
        return filled(s.accident.date) && filled(s.accident.time) && filled(s.accident.location);
      case 6:
        return filled(s.accident.description);
      case 7:
        return s.fault !== null;
      case 8:
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
      clearWizardState(token);
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
          תודה. הסוכן יעבור על הפרטים וייצור איתך קשר להמשך הטיפול.
        </p>
        <p className="mt-3 text-sm text-zinc-500">
          נזכרת במשהו? אפשר לחזור לקישור הזה בכל שלב כדי להוסיף תמונות ומסמכים.
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
              מצטערים על התאונה — אנחנו כאן לעזור. כמה שאלות קצרות (כ־3 דקות), והסוכן
              ייקח את זה מכאן.
            </p>
            <p className="mt-2 text-sm text-zinc-500">
              הפרטים מועברים לסוכן הביטוח שלך בלבד, והתשובות נשמרות — אפשר לעצור ולחזור
              לקישור בכל שלב.
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
                (100). הסוכן יקבל התראה דחופה. אפשר לסגור עכשיו ולחזור לקישור מאוחר
                יותר — התשובות שלך נשמרות.
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">הפרטים שלך</h2>
            <Text required label="שם פרטי" value={s.insured.first_name} onChange={(v) => set({ insured: { ...s.insured, first_name: v } })} />
            <Text required label="שם משפחה" value={s.insured.last_name} onChange={(v) => set({ insured: { ...s.insured, last_name: v } })} />
            <Text required label="תעודת זהות" inputMode="numeric" warn={idWarn(s.insured.id_number)} value={s.insured.id_number} onChange={(v) => set({ insured: { ...s.insured, id_number: v } })} />
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
                <option value="unknown">לא בטוח/ה — הסוכן ישלים</option>
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
                <option value="unknown">לא בטוח/ה — הסוכן ישלים</option>
              </select>
              <span className="mt-1 block text-xs text-zinc-400">
                לא בטוח/ה? אין בעיה — בחר/י &quot;הסוכן ישלים&quot; והמשיכ/י.
              </span>
            </label>
          </div>
        )}

        {step === 3 && (
          <div>
            <h2 className="text-xl font-bold">מי נהג ברכב בזמן התאונה?</h2>
            <div className="mt-4">
              <Choice<"insured" | "other">
                value={s.driver.isInsured === null ? null : s.driver.isInsured ? "insured" : "other"}
                options={[
                  { v: "insured", label: "אני (המבוטח)" },
                  { v: "other", label: "מישהו אחר" },
                ]}
                onChange={(v) => set({ driver: { ...s.driver, isInsured: v === "insured" } })}
              />
            </div>
            {s.driver.isInsured === false && (
              <div className="mt-4 space-y-3">
                <Text required label="שם פרטי" value={s.driver.first_name} onChange={(v) => set({ driver: { ...s.driver, first_name: v } })} />
                <Text required label="שם משפחה" value={s.driver.last_name} onChange={(v) => set({ driver: { ...s.driver, last_name: v } })} />
                <Text required label="תעודת זהות" inputMode="numeric" warn={idWarn(s.driver.id_number)} value={s.driver.id_number} onChange={(v) => set({ driver: { ...s.driver, id_number: v } })} />
                <Text label="מספר רישיון נהיגה" inputMode="numeric" value={s.driver.license_number} onChange={(v) => set({ driver: { ...s.driver, license_number: v } })} />
                <Text label="קרבה למבוטח" value={s.driver.relation_to_insured} onChange={(v) => set({ driver: { ...s.driver, relation_to_insured: v } })} placeholder="בן/בת זוג, עובד, בן משפחה…" />
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">הרכב שלך</h2>
            <p className="text-sm text-zinc-500">
              הזן/י מספר רישוי — נשלים את פרטי הרכב אוטומטית.
            </p>
            <Text required label="מספר רישוי" inputMode="numeric" warn={plateWarn(s.vehicle.plate)} value={s.vehicle.plate} onChange={(v) => set({ vehicle: { ...s.vehicle, plate: v } })} />
            {vehicleLookup === "looking" && <p className="text-xs text-zinc-500">מחפש את הרכב…</p>}
            {vehicleLookup === "found" && (
              <p className="text-xs text-green-700">✓ מולא ממאגר משרד התחבורה — אפשר לתקן</p>
            )}
            {vehicleLookup === "missing" && (
              <p className="text-xs text-zinc-500">לא מצאנו את הרכב במאגר — אפשר למלא ידנית</p>
            )}
            <Text required label="יצרן ודגם" value={s.vehicle.manufacturer} onChange={(v) => set({ vehicle: { ...s.vehicle, manufacturer: v } })} placeholder="לדוגמה: טויוטה קורולה" />
            <Text required label="שנת ייצור" inputMode="numeric" value={s.vehicle.year} onChange={(v) => set({ vehicle: { ...s.vehicle, year: v } })} />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-3">
            <h2 className="text-xl font-bold">מתי ואיפה קרתה התאונה?</h2>
            <Text required label="תאריך" type="date" value={s.accident.date} onChange={(v) => set({ accident: { ...s.accident, date: v } })} />
            <Text required label="שעה" type="time" value={s.accident.time} onChange={(v) => set({ accident: { ...s.accident, time: v } })} />
            <Text required label="מיקום" value={s.accident.location} onChange={(v) => set({ accident: { ...s.accident, location: v } })} placeholder="צומת / כתובת / כביש" />
            <button
              type="button"
              onClick={useMyLocation}
              disabled={geoBusy}
              className="rounded-lg border border-blue-600 px-3 py-2 text-sm text-blue-700 disabled:opacity-50"
            >
              {geoBusy ? "מאתר…" : "📍 המיקום הנוכחי שלי"}
            </button>
            {geoError && <p className="text-xs text-amber-600">{geoError}</p>}
          </div>
        )}

        {step === 6 && (
          <div>
            <h2 className="text-xl font-bold">
              מה קרה?<span className="text-red-500"> *</span>
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              תאר/י בקצרה את האירוע במילים שלך — גם 2–3 משפטים מספיקים. הסוכן ישלים
              איתך פרטים אם צריך.
            </p>
            <textarea
              value={s.accident.description}
              onChange={(e) => set({ accident: { ...s.accident, description: e.target.value } })}
              rows={5}
              className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
              placeholder="למשל: עצרתי ברמזור אדום ורכב מאחור פגע בי..."
            />
          </div>
        )}

        {step === 7 && (
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

        {step === 8 && (
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
                <Text required label="מספר רישוי" inputMode="numeric" warn={plateWarn(s.thirdParty.plate)} value={s.thirdParty.plate} onChange={(v) => set({ thirdParty: { ...s.thirdParty, plate: v } })} />
                <label className="block">
                  <span className="text-sm text-zinc-600">
                    חברת הביטוח שלו<span className="text-red-500"> *</span>
                  </span>
                  <select
                    value={tpInsurerCustom ? OTHER_INSURER : s.thirdParty.insurer}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTpInsurerOther(v === OTHER_INSURER);
                      set({ thirdParty: { ...s.thirdParty, insurer: v === OTHER_INSURER ? "" : v } });
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-base outline-none focus:border-blue-500"
                  >
                    <option value="">בחר/י חברת ביטוח…</option>
                    {INSURERS.map((i) => (
                      <option key={i.key} value={i.label}>
                        {i.label}
                      </option>
                    ))}
                    <option value="לא ידוע">לא ידוע כרגע</option>
                    <option value={OTHER_INSURER}>חברה אחרת…</option>
                  </select>
                </label>
                {tpInsurerCustom && (
                  <Text required label="שם חברת הביטוח" value={s.thirdParty.insurer} onChange={(v) => set({ thirdParty: { ...s.thirdParty, insurer: v } })} />
                )}
              </div>
            )}
          </div>
        )}

        {step === 9 && (
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

        {step === 10 && (
          <div>
            <h2 className="text-xl font-bold">סיכום</h2>
            <p className="mt-1 text-sm text-zinc-500">לחיצה על שורה חוזרת לשלב המתאים לתיקון.</p>
            <dl className="mt-3 divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm">
              <Row k="שם" v={`${s.insured.first_name} ${s.insured.last_name}`.trim() || "—"} onEdit={() => setStep(2)} />
              <Row k="רכב" v={[s.vehicle.plate, s.vehicle.manufacturer].filter(Boolean).join(" · ") || "—"} onEdit={() => setStep(4)} />
              <Row k="נהג" v={s.driver.isInsured === false ? `${s.driver.first_name} ${s.driver.last_name}`.trim() || "—" : s.driver.isInsured ? "המבוטח" : "—"} onEdit={() => setStep(3)} />
              <Row k="מתי" v={[toILDate(s.accident.date), s.accident.time].filter(Boolean).join(" ") || "—"} onEdit={() => setStep(5)} />
              <Row k="איפה" v={s.accident.location || "—"} onEdit={() => setStep(5)} />
              <Row k="מה קרה" v={s.accident.description || "—"} onEdit={() => setStep(6)} />
              <Row k="מי אשם" v={s.fault === "me" ? "אני" : s.fault === "third_party" ? "הצד השני" : "לא בטוח"} onEdit={() => setStep(7)} />
              <Row k="נפגעים" v={s.injuries ? "כן" : "לא"} onEdit={() => setStep(1)} />
              <Row k="מסמכים" v={docDone ? `${docDone} צורפו` : "—"} onEdit={() => setStep(9)} />
            </dl>

            <div className="mt-5 rounded-xl border border-zinc-200 p-4">
              <p className="text-sm font-medium">הצהרת המבוטח</p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-600">
                אני החתום/ה מטה מצהיר/ה כי הפרטים שמסרתי נכונים ומלאים, ומסכים/ה כי המידע יועבר
                לחברת הביטוח ולסוכן לצורך טיפול בתביעה, לרבות העברת מידע מהאגף לרישוי במשרד התחבורה.
              </p>
              <label className="mt-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={s.declaration.data_consent}
                  onChange={(e) =>
                    set({
                      declaration: {
                        ...s.declaration,
                        data_consent: e.target.checked,
                        signed_date: e.target.checked ? s.declaration.signed_date || todayISO() : "",
                      },
                    })
                  }
                  className="mt-1 h-5 w-5"
                />
                <span className="text-sm">אני מאשר/ת את ההצהרה ואת העברת המידע.</span>
              </label>
              {s.thirdParty.present && (
                <label className="mt-2 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={s.declaration.poa_third_party}
                    onChange={(e) => set({ declaration: { ...s.declaration, poa_third_party: e.target.checked } })}
                    className="mt-1 h-5 w-5"
                  />
                  <span className="text-sm">
                    אני מייפה את כוח חברת הביטוח לטפל בתביעת צד ג׳ (סעיף 68 לחוק חוזה הביטוח).
                  </span>
                </label>
              )}
              <p className="mt-3 text-xs text-zinc-500">
                חתימה: <span className="font-medium">{`${s.insured.first_name} ${s.insured.last_name}`.trim() || "—"}</span>
                {s.declaration.signed_date && <> · {toILDate(s.declaration.signed_date)}</>}
              </p>
            </div>

            {submitError && (
              <p className="mt-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                {submitError}
              </p>
            )}
          </div>
        )}
      </div>

      {step < last && [2, 3, 4, 5, 6, 8].includes(step) && !canNext() && (
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
            disabled={submitBusy || !s.declaration.data_consent}
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
            // No `capture` attribute — see FollowupUpload: it would force the camera and
            // hide gallery/Files on mobile.
            accept="image/*,application/pdf"
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

// A summary line that jumps back to the step it came from — clients review by
// tapping the row instead of hammering "חזרה" through the whole wizard.
function Row({ k, v, onEdit }: { k: string; v: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2">
      <dt className="shrink-0 text-zinc-500">{k}</dt>
      <dd className="min-w-0">
        <button
          type="button"
          onClick={onEdit}
          className="flex max-w-full items-center gap-1.5 text-right font-medium"
        >
          <span className="truncate">{v}</span>
          <span aria-label="עריכה" className="shrink-0 text-xs text-blue-600">
            ✎
          </span>
        </button>
      </dd>
    </div>
  );
}
