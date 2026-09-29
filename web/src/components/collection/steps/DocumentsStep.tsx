import { REQUIRED_DOCS, type DocType, type RequiredDocType, type State } from "@/lib/collection/claim-state";
import { doneCount } from "../steps";
import { DocField } from "./fields";

// The licence and vehicle registration are required (pilot, 2026-09-27: they were
// arriving missing and the office chased every one by hand), and the licence needs
// **both sides**, for whoever was driving at the time (pilot, 2026-09-29).
//
// Not a hard block, though — post-accident the documents are often in a towed car or
// with the police, and R2 in the assumptions canvas says every mandatory field needs
// a way out. The way out is explicit and recorded, so the agent gets "the client said
// they'd send it later" rather than an unexplained gap.
function DeferToggle({
  type,
  label,
  deferred,
  satisfied,
  onToggle,
}: {
  type: RequiredDocType;
  label: string;
  deferred: boolean;
  satisfied: boolean;
  onToggle: (type: RequiredDocType, next: boolean) => void;
}) {
  // Once the requirement is met the escape hatch is irrelevant — hide it rather than
  // leave a tickbox contradicting the files above it. Still shown at one-of-two,
  // because a client who can only photograph one side must be able to move on.
  if (satisfied) return null;
  return (
    <label className="mt-2 flex items-start gap-2 text-sm text-zinc-600">
      <input
        type="checkbox"
        checked={deferred}
        onChange={(e) => onToggle(type, e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
      />
      <span>אין לי את {label} כרגע — אשלח בהמשך</span>
    </label>
  );
}

// Whose licence we're asking for. The wizard already knows: the policyholder drove,
// someone else drove (named on the driver-details step), or nobody did.
function licenceOwnerHint(s: State): string {
  if (s.driver?.isInsured === false) {
    const name = [s.driver.first_name, s.driver.last_name].filter(Boolean).join(" ").trim();
    return name
      ? `שני הצדדים — של ${name}, שנהג/ה ברכב בזמן התאונה`
      : "שני הצדדים — של מי שנהג/ה ברכב בזמן התאונה";
  }
  return "שני הצדדים (קדמי ואחורי) — של מי שנהג/ה ברכב בזמן התאונה";
}

export default function DocumentsStep({
  s,
  onPick,
  onRemove,
  onDefer,
}: {
  s: State;
  onPick: (type: DocType, files: FileList) => void;
  onRemove: (localId: string) => void;
  onDefer: (type: RequiredDocType, next: boolean) => void;
}) {
  const spec = (t: RequiredDocType) => REQUIRED_DOCS.find((r) => r.type === t)!;
  const licence = spec("drivers_license");
  const licenceApplies = licence.appliesTo(s);
  const licenceDone = doneCount(s, "drivers_license");
  const regDone = doneCount(s, "vehicle_reg");
  const deferred = (t: RequiredDocType) => s.docsDeferred?.[t] === true;

  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">מסמכים ותמונות</h2>
      <p className="text-base text-zinc-500">
        {licenceApplies
          ? "רישיון הנהיגה (שני הצדדים) ורישיון הרכב נדרשים לפתיחת התביעה. אם אין לך אותם כרגע — סמן/י ואפשר לשלוח בהמשך."
          : "רישיון הרכב נדרש לפתיחת התביעה. אם אין לך אותו כרגע — סמן/י ואפשר לשלוח בהמשך."}
      </p>

      {/* No driver, no driving licence: the car was hit while parked. */}
      {licenceApplies && (
        <div>
          <DocField
            label="רישיון נהיגה"
            required
            hint={licenceOwnerHint(s)}
            type="drivers_license"
            multiple
            docs={s.documents}
            onPick={onPick}
            onRemove={onRemove}
          />
          {licenceDone > 0 && licenceDone < licence.min && (
            <p className="mt-1 text-sm text-amber-700">
              צולם צד אחד מתוך {licence.min} — נשאר לצלם את הצד השני
            </p>
          )}
          <DeferToggle
            type="drivers_license"
            label="רישיון הנהיגה"
            deferred={deferred("drivers_license")}
            satisfied={licenceDone >= licence.min}
            onToggle={onDefer}
          />
        </div>
      )}

      <div>
        <DocField
          label="רישיון רכב"
          required
          type="vehicle_reg"
          docs={s.documents}
          onPick={onPick}
          onRemove={onRemove}
        />
        <DeferToggle
          type="vehicle_reg"
          label="רישיון הרכב"
          deferred={deferred("vehicle_reg")}
          satisfied={regDone >= spec("vehicle_reg").min}
          onToggle={onDefer}
        />
      </div>

      <DocField
        label="תמונות הרכב והנזק"
        hint="לא חובה, אבל זה מאיץ את הטיפול — כמה זוויות של הנזק"
        type="car_photo"
        multiple
        docs={s.documents}
        onPick={onPick}
        onRemove={onRemove}
      />
    </div>
  );
}
