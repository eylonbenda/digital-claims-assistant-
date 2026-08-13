import type { DocType, State } from "@/lib/collection/claim-state";
import { DocField } from "./fields";

export default function DocumentsStep({
  s,
  onPick,
  onRemove,
}: {
  s: State;
  set: (patch: Partial<State>) => void;
  onPick: (type: DocType, files: FileList) => void;
  onRemove: (localId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold">מסמכים ותמונות</h2>
      <p className="text-base text-zinc-500">
        לא חובה, אבל זה מאיץ את הטיפול — אפשר לצלם עכשיו או לצרף אחר כך.
      </p>
      <DocField label="תמונות הרכב והנזק" hint="כמה זוויות של הנזק" type="car_photo" multiple docs={s.documents} onPick={onPick} onRemove={onRemove} />
      <DocField label="רישיון נהיגה" type="drivers_license" docs={s.documents} onPick={onPick} onRemove={onRemove} />
      <DocField label="רישיון רכב" type="vehicle_reg" docs={s.documents} onPick={onPick} onRemove={onRemove} />
    </div>
  );
}
