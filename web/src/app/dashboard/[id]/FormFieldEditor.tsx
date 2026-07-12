"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ClaimData } from "@/lib/formfill/types";

// ── immutable nested get/set by dot-path (supports numeric keys → arrays) ────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPath(obj: any, path: string): string {
  const v = path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  return v == null ? "" : String(v);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setPath(obj: any, path: string, value: string): any {
  const keys = path.split(".");
  const root = Array.isArray(obj) ? [...obj] : { ...(obj ?? {}) };
  let cur = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const nextIsIndex = /^\d+$/.test(keys[i + 1]);
    const existing = cur[k];
    cur[k] =
      existing != null
        ? Array.isArray(existing)
          ? [...existing]
          : { ...existing }
        : nextIsIndex
          ? []
          : {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value === "" ? undefined : value;
  return root;
}

type Validator = (v: string) => string | null; // returns Hebrew error, or null if ok
type FieldDef = { path: string; label: string; type?: string; validate?: Validator };
type Section = { title: string; fields: FieldDef[]; tpOnly?: boolean };

// ── field validators — catch the errors that get a filled form rejected ──────────
// Israeli ID: 9 digits, Luhn-style weighted checksum (ת"ז).
function validateIdNumber(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 0) return null; // empty is "missing", not "invalid"
  if (d.length !== 9) return 'ת"ז חייבת 9 ספרות';
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(d[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0 ? null : 'ת"ז לא תקינה (ספרת ביקורת)';
}
// Israeli plate: 7 or 8 digits.
function validatePlate(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 0) return null;
  return d.length === 7 || d.length === 8 ? null : "מספר רישוי: 7–8 ספרות";
}
function validatePhone(v: string): string | null {
  const d = v.replace(/\D/g, "");
  if (d.length === 0) return null;
  return d.length === 9 || d.length === 10 ? null : "מספר טלפון לא תקין";
}
// Dates on an accident notice can't be in the future.
function validatePastDate(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "תאריך לא תקין";
  // Compare date-only (local) to avoid TZ edge cases at midnight.
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return d.getTime() > today.getTime() ? "התאריך בעתיד" : null;
}

// Core accident-notice fields (canonical ClaimData; mirrors form-field-map §2).
const SECTIONS: Section[] = [
  {
    title: "מבוטח",
    fields: [
      { path: "insured.first_name", label: "שם פרטי" },
      { path: "insured.last_name", label: "שם משפחה" },
      { path: "insured.id_number", label: "תעודת זהות", validate: validateIdNumber },
      { path: "insured.birth_date", label: "תאריך לידה", type: "date", validate: validatePastDate },
      { path: "insured.mobile", label: "נייד", type: "tel", validate: validatePhone },
      { path: "insured.email", label: 'דוא"ל', type: "email" },
      { path: "insured.city", label: "עיר" },
      { path: "insured.street", label: "רחוב" },
      { path: "insured.house_no", label: "מספר בית" },
    ],
  },
  {
    title: "נהג בעת התאונה",
    fields: [
      { path: "driver.first_name", label: "שם פרטי" },
      { path: "driver.last_name", label: "שם משפחה" },
      { path: "driver.id_number", label: "תעודת זהות", validate: validateIdNumber },
      { path: "driver.license_number", label: "מספר רישיון" },
      { path: "driver.license_date", label: "תאריך הוצאת רישיון", type: "date", validate: validatePastDate },
      { path: "driver.license_type", label: "דרגת רישיון" },
      { path: "driver.relation_to_insured", label: "קרבה למבוטח" },
    ],
  },
  {
    title: "רכב",
    fields: [
      { path: "vehicle.plate", label: "מספר רישוי", validate: validatePlate },
      { path: "vehicle.manufacturer", label: "יצרן" },
      { path: "vehicle.model", label: "דגם" },
      { path: "vehicle.year", label: "שנת ייצור" },
      { path: "vehicle.odometer", label: "מד ק״מ" },
    ],
  },
  {
    title: "תאונה",
    fields: [
      { path: "accident.date", label: "תאריך", type: "date", validate: validatePastDate },
      { path: "accident.time", label: "שעה", type: "time" },
      { path: "accident.location", label: "מיקום" },
      { path: "accident.description", label: "תיאור" },
      { path: "accident.passengers", label: "נוסעים" },
    ],
  },
  {
    title: "נזקים",
    fields: [
      { path: "damage.insured_vehicle", label: "נזק לרכב המבוטח" },
      { path: "damage.third_party_vehicle", label: "נזק לרכב צד ג'" },
    ],
  },
  {
    title: "צד ג'",
    tpOnly: true,
    fields: [
      { path: "third_parties.0.owner_name", label: "שם בעל הרכב" },
      { path: "third_parties.0.driver_name", label: "שם הנהג" },
      { path: "third_parties.0.phone", label: "טלפון", validate: validatePhone },
      { path: "third_parties.0.vehicle_plate", label: "מספר רישוי", validate: validatePlate },
      { path: "third_parties.0.insurer", label: "חברת ביטוח" },
      { path: "third_parties.0.policy_number", label: "מספר פוליסה" },
      { path: "third_parties.0.damage_description", label: "תיאור הנזק" },
    ],
  },
];

export default function FormFieldEditor({
  claimId,
  initial,
  missing = [],
  edited = false,
  claimType,
  insurer,
}: {
  claimId: string;
  initial: ClaimData;
  missing?: string[];
  edited?: boolean;
  claimType?: string;
  // The claimant's insurer key — enables a one-click regenerate after save.
  insurer?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ClaimData>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function update(path: string, value: string) {
    setData((d) => setPath(d, path, value));
    setSaved(false);
  }

  // The third-party section is noise on an own-policy claim — collapse it by
  // default rather than hide, so it's still reachable if a TP is involved.
  const collapseTp = claimType === "own_policy";

  // Live validation across all fields (skips the TP section when collapsed).
  const fieldErrors: { label: string; error: string }[] = [];
  for (const section of SECTIONS) {
    if (section.tpOnly && collapseTp) continue;
    for (const f of section.fields) {
      if (!f.validate) continue;
      const err = f.validate(getPath(data, f.path));
      if (err) fieldErrors.push({ label: f.label, error: err });
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/claims/${claimId}/form-data`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form_data: data }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "שמירה נכשלה");
      return;
    }
    setSaved(true);
    router.refresh(); // so the form regenerates from the edited data
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-white py-3 text-sm text-zinc-600 hover:border-blue-400 hover:text-blue-600"
      >
        ✏️ {edited ? "ערוך שדות הטופס (נערך)" : "השלם / תקן שדות בטופס"}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-800">עריכת שדות הטופס</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-zinc-400 hover:text-zinc-600"
        >
          סגור
        </button>
      </div>

      {missing.length > 0 && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span className="font-medium">ה-AI סימן כחסר/לא ברור:</span>{" "}
          {missing.join(" · ")}
        </div>
      )}

      <p className="text-xs text-zinc-500">
        שדות ריקים מסומנים בכתום — השלם אותם או תקן ערכים שגויים. השמירה אינה משנה את
        מה שהלקוח מסר במקור (נשמר לתיעוד), רק את הנתונים שממלאים את הטופס.
      </p>

      <div className="space-y-5">
        {SECTIONS.map((section) => {
          const grid = (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {section.fields.map((f) => {
                const value = getPath(data, f.path);
                const empty = value.trim() === "";
                const err = f.validate ? f.validate(value) : null;
                return (
                  <label key={f.path} className="block">
                    <span className="text-xs text-zinc-500">{f.label}</span>
                    <input
                      type={f.type ?? "text"}
                      value={value}
                      onChange={(e) => update(f.path, e.target.value)}
                      aria-invalid={!!err}
                      className={`mt-1 w-full rounded-lg border px-2 py-1.5 text-sm outline-none focus:border-blue-500 ${
                        err
                          ? "border-red-400 bg-red-50"
                          : empty
                            ? "border-amber-300 bg-amber-50"
                            : "border-zinc-300"
                      }`}
                    />
                    {err && <span className="mt-1 block text-xs text-red-600">{err}</span>}
                  </label>
                );
              })}
            </div>
          );

          // Own-policy: keep the TP section available but out of the way.
          if (section.tpOnly && collapseTp) {
            return (
              <details key={section.title} className="rounded-lg border border-zinc-200 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-zinc-500">
                  {section.title}{" "}
                  <span className="font-normal text-zinc-400">(רלוונטי לתביעת צד ג׳)</span>
                </summary>
                <div className="mt-3">{grid}</div>
              </details>
            );
          }

          return (
            <fieldset key={section.title}>
              <legend className="mb-2 text-sm font-semibold text-zinc-700">
                {section.title}
              </legend>
              {grid}
            </fieldset>
          );
        })}
      </div>

      {fieldErrors.length > 0 && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
          <span className="font-medium">{fieldErrors.length} שדות עם שגיאה:</span>{" "}
          {fieldErrors.map((e) => e.label).join(" · ")} — ניתן לשמור בכל זאת, אך כדאי
          לתקן לפני מילוי הטופס.
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {saved && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
          <span>נשמר ✓</span>
          {insurer && (
            <a
              href={`/api/claims/${claimId}/form/${insurer}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:underline"
            >
              מלא טופס מעודכן ↗
            </a>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "שומר…" : "שמור שדות"}
        </button>
        <button
          type="button"
          onClick={() => { setData(initial); setSaved(false); setError(null); }}
          disabled={busy}
          className="text-sm text-zinc-500 hover:underline disabled:opacity-50"
        >
          אפס לשדות המקוריים
        </button>
      </div>
    </div>
  );
}
