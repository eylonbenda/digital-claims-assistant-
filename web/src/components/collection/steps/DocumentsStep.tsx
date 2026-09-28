import type { DocType, RequiredDocType, State } from "@/lib/collection/claim-state";
import { DocField } from "./fields";

// The licence and vehicle registration are required (pilot, 2026-09-27: they were
// arriving missing and the office chased every one by hand). They are not a hard
// block, though — post-accident the documents are often in a towed car or with the
// police, and R2 in the assumptions canvas says every mandatory field needs a way
// out. The way out is explicit and recorded, so the agent gets "the client said
// they'd send it later" rather than an unexplained gap.
function DeferToggle({
  type,
  label,
  deferred,
  hasUpload,
  onToggle,
}: {
  type: RequiredDocType;
  label: string;
  deferred: boolean;
  hasUpload: boolean;
  onToggle: (type: RequiredDocType, next: boolean) => void;
}) {
  // Once the file is attached the escape hatch is irrelevant — hide it rather
  // than leave a tickbox that contradicts the upload sitting right above it.
  if (hasUpload) return null;
  return (
    <label className="mt-2 flex items-start gap-2 text-sm text-zinc-600">
      <input
        type="checkbox"
        checked={deferred}
        onChange={(e) => onToggle(type, e.target.checked)}
        className="mt-0.5 h-5 w-5 shrink-0 accent-blue-600"
      />
      <span>
        אין לי את {label} כרגע — אשלח בהמשך
      </span>
    </label>
  );
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
  const has = (t: DocType) => s.documents.some((d) => d.type === t && d.status === "done");
  const deferred = (t: RequiredDocType) => s.docsDeferred?.[t] === true;

  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">מסמכים ותמונות</h2>
      <p className="text-base text-zinc-500">
        רישיון הנהיגה ורישיון הרכב נדרשים לפתיחת התביעה. אם אין לך אותם כרגע — סמן/י
        ואפשר לשלוח בהמשך.
      </p>

      <div>
        <DocField
          label="רישיון נהיגה"
          required
          type="drivers_license"
          docs={s.documents}
          onPick={onPick}
          onRemove={onRemove}
        />
        <DeferToggle
          type="drivers_license"
          label="רישיון הנהיגה"
          deferred={deferred("drivers_license")}
          hasUpload={has("drivers_license")}
          onToggle={onDefer}
        />
      </div>

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
          hasUpload={has("vehicle_reg")}
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
