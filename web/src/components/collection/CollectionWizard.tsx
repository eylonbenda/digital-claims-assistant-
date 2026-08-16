"use client";

import { useEffect, useRef, useState } from "react";
import type { Fault } from "@/lib/formfill/types";
import { compressImage } from "@/lib/images/compress";
import { type State, type DocType, INSURERS } from "@/lib/collection/claim-state";
import { clearWizardState, loadWizardState, saveWizardState } from "@/lib/collection/persist";
import { isValidIsraeliId, isPlausiblePlate } from "@/lib/validation/il";
import { reverseGeocode } from "@/lib/geo/reverse";
import {
  isLookupablePlate,
  mergeVehicleInfo,
  normalizePlate,
  type VehicleInfo,
} from "@/lib/vehicles/registry";
import { visibleSteps, firstIncompleteKey, type StepKey } from "./steps";
import WizardShell from "./WizardShell";
import IntroStep from "./steps/IntroStep";
import InjuriesStep from "./steps/InjuriesStep";
import DriverWhoStep from "./steps/DriverWhoStep";
import FaultStep from "./steps/FaultStep";
import TpPresentStep from "./steps/TpPresentStep";
import VehicleStep from "./steps/VehicleStep";
import InsuredStep from "./steps/InsuredStep";
import DriverDetailsStep from "./steps/DriverDetailsStep";
import TpDetailsStep from "./steps/TpDetailsStep";
import WhenWhereStep from "./steps/WhenWhereStep";
import DescriptionStep from "./steps/DescriptionStep";
import DocumentsStep from "./steps/DocumentsStep";
import SummaryStep from "./steps/SummaryStep";

export type { State };

const CHEER_TEXT: Record<"details" | "finish", string> = {
  details: "החלק הראשון מאחוריך 🎉 · עוד כ־2 דקות",
  finish: "כמעט שם! 🎉 נשארו רק מסמכים וסיכום",
};

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

export default function CollectionWizard({
  token,
  prefill,
}: {
  token: string;
  prefill?: StatePrefill;
}) {
  const [s, setS] = useState<State>(() => mergeWithEmpty(prefill));
  const [stepKey, setStepKey] = useState<StepKey>("intro");
  const [cheer, setCheer] = useState<"details" | "finish" | null>(null);
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
      // A restored key that's no longer relevant (state changed since the save,
      // e.g. the insured now drives) can't be resolved on-screen — fall back to
      // the first incomplete step instead.
      const stillVisible = saved.stepKey && visibleSteps(saved.state).some((st) => st.key === saved.stepKey);
      setStepKey(stillVisible ? saved.stepKey! : firstIncompleteKey(saved.state));
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per token
  }, [token]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hydrated || done) return;
    saveWizardState(token, stepKey, s);
  }, [hydrated, done, token, stepKey, s]);
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
  // Same idea as sRef, for the auto-advance timer below: the current step key
  // readable from a callback firing after this render has been replaced.
  const stepKeyRef = useRef(stepKey);
  useEffect(() => {
    stepKeyRef.current = stepKey;
  }, [stepKey]);
  // Set by goTo() (summary edit-jump); consumed by the next navigateNext() call
  // so a tap-step selection or "המשך" made after the jump returns to the
  // summary instead of continuing forward through the wizard.
  const returnToSummary = useRef(false);
  // Pending tap-step auto-advance timer, so a later tap (or unmount) can cancel it.
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
    };
  }, []);
  // Guards against out-of-order responses: only the newest lookup may write.
  const lookupSeq = useRef(0);

  // A stepKey that no longer matches any visible step (state changed
  // elsewhere, e.g. via a restored session or a relevance flip) used to
  // silently fall back to index 0 — flashing the intro. Correct stepKey
  // itself here; the render below independently computes the same fallback
  // index so there's no flash while this effect is still pending.
  /* eslint-disable react-hooks/set-state-in-effect -- correcting an
     out-of-sync stepKey is exactly this effect's job; see comment above */
  useEffect(() => {
    const vis = visibleSteps(s);
    if (!vis.some((st) => st.key === stepKey)) {
      setStepKey(firstIncompleteKey(s));
    }
  }, [s, stepKey]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Look the vehicle up in the Ministry of Transport registry once the plate
  // looks complete. Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    if (stepKey !== "vehicle") return;
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
  }, [plateDigits, stepKey]);
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

  const set = (patch: Partial<State>) => setS((p) => ({ ...p, ...patch }));
  const docDone = s.documents.filter((d) => d.status === "done").length;

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

  // Registry-driven position: derived fresh every render from `s` + `stepKey`
  // (spec §3/§6) rather than tracked separately, so relevance changes (e.g. the
  // insured starts driving) can never leave the wizard pointed at a stale step.
  const visible = visibleSteps(s);
  const rawIdx = visible.findIndex((st) => st.key === stepKey);
  // rawIdx === -1 means the effect above hasn't corrected stepKey yet (it
  // can't run until after this render commits) — render the first
  // incomplete step's index in the meantime instead of falling through to
  // index 0 (intro).
  const idx =
    rawIdx === -1 ? Math.max(0, visible.findIndex((st) => st.key === firstIncompleteKey(s))) : rawIdx;
  const active = visible[idx];
  const chapterSteps = visible.filter((st) => st.chapter === active.chapter);
  const dots =
    active.chapter === "intro"
      ? null
      : { count: chapterSteps.length, index: chapterSteps.findIndex((st) => st.key === stepKey) };
  const doneChapters = (["quick", "details", "finish"] as const).filter((c) =>
    visible.filter((st) => st.chapter === c).every((st) => visible.indexOf(st) < idx)
  );

  // Shared navigation logic used both by the synchronous "next" click and by
  // the (possibly delayed) auto-advance timer below. Takes state/stepKey as
  // arguments rather than closing over `s`/`stepKey` so the timer callback can
  // pass the CURRENT values (via refs) instead of the stale click-time ones.
  function navigateNext(currentState: State, currentStepKey: StepKey) {
    const vis = visibleSteps(currentState);
    const i = Math.max(0, vis.findIndex((st) => st.key === currentStepKey));
    const curr = vis[i];
    // An edit-jump from the summary always returns to the summary — it never
    // re-crosses a chapter boundary, so no cheer here either.
    if (returnToSummary.current) {
      returnToSummary.current = false;
      setCheer(null);
      setStepKey("summary");
      return;
    }
    const next = vis[i + 1];
    if (!next) return;
    // Crossing a chapter boundary out of quick/details → inline cheer line
    // for the chapter just arrived at.
    if (next.chapter !== curr.chapter && (curr.chapter === "quick" || curr.chapter === "details")) {
      setCheer(curr.chapter === "quick" ? "details" : "finish");
    } else {
      setCheer(null);
    }
    setStepKey(next.key);
  }
  function goNext() {
    navigateNext(s, stepKey);
  }
  function goBack() {
    // Wandering backwards means the client has left the edit-jump flow —
    // resume normal forward navigation instead of snapping back to summary.
    returnToSummary.current = false;
    setCheer(null);
    if (idx > 0) setStepKey(visible[idx - 1].key);
  }
  function goTo(key: StepKey) {
    returnToSummary.current = true;
    setCheer(null);
    setStepKey(key);
  }
  function cancelAdvance() {
    if (advanceTimer.current) {
      clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
  }
  // Tap-step auto-advance (selected-state flash). Cancels any pending timer
  // first so a rapid double-tap can't fire a stale, pre-tap navigation, and
  // resolves the destination fresh (from refs) at fire time rather than from
  // the click-time closure.
  function advance() {
    cancelAdvance();
    advanceTimer.current = setTimeout(() => {
      advanceTimer.current = null;
      navigateNext(sRef.current, stepKeyRef.current);
    }, 250);
  }

  const isSummary = active.key === "summary";
  const nextDisabled = isSummary ? submitBusy || !s.declaration.data_consent : !active.isComplete(s);
  const nextLabel = isSummary ? (submitBusy ? "שולח…" : "שליחה לסוכן") : active.key === "intro" ? "בוא נתחיל" : "המשך";
  const requiredHint =
    !active.isTapStep && active.key !== "intro" && active.key !== "documents" && !isSummary && !active.isComplete(s);
  // The injuries tap step is the one exception: on "יש נפגעים" it must keep
  // showing the shell's המשך instead of auto-advancing past the warning.
  const isTapStep = active.isTapStep && !(active.key === "injuries" && s.injuries === true);

  return (
    <WizardShell
      chapter={active.chapter}
      doneChapters={doneChapters}
      dots={dots}
      isTapStep={isTapStep}
      backDisabled={idx === 0}
      onBack={goBack}
      nextLabel={nextLabel}
      nextDisabled={nextDisabled}
      onNext={isSummary ? handleSubmit : goNext}
      nextVariant={isSummary ? "submit" : "primary"}
      requiredHint={requiredHint}
      cheer={cheer && CHEER_TEXT[cheer]}
    >
      {active.key === "intro" && <IntroStep s={s} set={set} />}
      {active.key === "injuries" && (
        <InjuriesStep s={s} set={set} advance={advance} cancelAdvance={cancelAdvance} />
      )}
      {active.key === "driver_who" && <DriverWhoStep s={s} set={set} advance={advance} />}
      {active.key === "fault" && <FaultStep s={s} set={set} advance={advance} />}
      {active.key === "tp_present" && <TpPresentStep s={s} set={set} advance={advance} />}
      {active.key === "vehicle" && (
        <VehicleStep s={s} set={set} lookup={vehicleLookup} plateWarn={plateWarn} />
      )}
      {active.key === "insured" && <InsuredStep s={s} set={set} idWarn={idWarn} />}
      {active.key === "driver_details" && <DriverDetailsStep s={s} set={set} idWarn={idWarn} />}
      {active.key === "tp_details" && (
        <TpDetailsStep
          s={s}
          set={set}
          plateWarn={plateWarn}
          tpInsurerCustom={tpInsurerCustom}
          setTpInsurerOther={setTpInsurerOther}
        />
      )}
      {active.key === "when_where" && (
        <WhenWhereStep s={s} set={set} geoBusy={geoBusy} geoError={geoError} useMyLocation={useMyLocation} />
      )}
      {active.key === "description" && <DescriptionStep s={s} set={set} />}
      {active.key === "documents" && (
        <DocumentsStep s={s} onPick={onPickDocs} onRemove={removeDoc} />
      )}
      {active.key === "summary" && (
        <SummaryStep s={s} set={set} goTo={goTo} docDone={docDone} submitError={submitError} />
      )}
    </WizardShell>
  );
}
