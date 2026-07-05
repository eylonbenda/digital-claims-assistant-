"use client";

import { useState } from "react";

export type InsurerOption = { key: string; label: string };

export default function FormGenerator({
  claimId,
  hasData,
  hasStoredForm = false,
  insurers,
  defaultInsurer,
}: {
  claimId: string;
  hasData: boolean;
  hasStoredForm?: boolean;
  // Server-derived from the formfill template registry — stays in sync as
  // insurer templates land, without bundling the templates client-side.
  insurers: InsurerOption[];
  // The claimant's own insurer, when we have a template for it.
  defaultInsurer?: string | null;
}) {
  const [insurer, setInsurer] = useState(
    defaultInsurer && insurers.some((i) => i.key === defaultInsurer)
      ? defaultInsurer
      : insurers[0]?.key ?? "",
  );

  if (!hasData) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
        הטופס ייווצר אוטומטית לאחר שהלקוח ימלא וישלח את פרטי התביעה.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <label className="text-sm text-zinc-600">
        {hasStoredForm ? "מלא טופס נוסף / חברה אחרת:" : "חברת ביטוח:"}
      </label>
      <select
        value={insurer}
        onChange={(e) => setInsurer(e.target.value)}
        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500"
      >
        {insurers.map((i) => (
          <option key={i.key} value={i.key}>
            {i.label}
          </option>
        ))}
      </select>
      <a
        href={`/api/claims/${claimId}/form/${insurer}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
      >
        מלא טופס הודעה על תאונה ↗
      </a>
    </div>
  );
}
