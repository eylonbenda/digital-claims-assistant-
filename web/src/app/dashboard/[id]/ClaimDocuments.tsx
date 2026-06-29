"use client";

import { useState } from "react";

export type DocView = {
  id: string;
  type: string;
  mime: string | null;
  uploaded_at: string;
  url: string | null; // short-lived signed URL, or null if signing failed
};

// Hebrew labels + display order for the claimant-uploaded document types.
const DOC_META: { type: string; label: string; icon: string }[] = [
  { type: "drivers_license", label: "רישיון נהיגה", icon: "🪪" },
  { type: "vehicle_reg", label: "רישיון רכב", icon: "📄" },
  { type: "car_photo", label: "תמונות הרכב / התאונה", icon: "📷" },
  { type: "third_party_doc", label: "מסמכי צד ג'", icon: "🚗" },
];

const FALLBACK_META = { label: "מסמך", icon: "📎" };

function isImage(mime: string | null) {
  return !!mime && mime.startsWith("image/");
}

export default function ClaimDocuments({ docs }: { docs: DocView[] }) {
  const [zoom, setZoom] = useState<DocView | null>(null);

  if (docs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        הלקוח עדיין לא העלה מסמכים.
      </p>
    );
  }

  // Group by type, preserving DOC_META order; unknown types fall to the end.
  const groups = new Map<string, DocView[]>();
  for (const d of docs) {
    if (!groups.has(d.type)) groups.set(d.type, []);
    groups.get(d.type)!.push(d);
  }
  const orderedTypes = [
    ...DOC_META.map((m) => m.type).filter((t) => groups.has(t)),
    ...[...groups.keys()].filter((t) => !DOC_META.some((m) => m.type === t)),
  ];

  return (
    <div className="space-y-6">
      {orderedTypes.map((type) => {
        const meta = DOC_META.find((m) => m.type === type) ?? {
          ...FALLBACK_META,
          type,
        };
        const items = groups.get(type)!;
        return (
          <div key={type}>
            <h3 className="mb-2 text-sm font-medium text-zinc-700">
              <span className="ml-1">{meta.icon}</span>
              {meta.label}
              <span className="mr-1 text-zinc-400"> ({items.length})</span>
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((d) => (
                <DocCard key={d.id} doc={d} onZoom={() => setZoom(d)} />
              ))}
            </div>
          </div>
        );
      })}

      {zoom && (
        <button
          type="button"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          aria-label="סגור"
        >
          {zoom.url && isImage(zoom.mime) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={zoom.url}
              alt="מסמך"
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          ) : null}
        </button>
      )}
    </div>
  );
}

function DocCard({ doc, onZoom }: { doc: DocView; onZoom: () => void }) {
  const date = new Date(doc.uploaded_at).toLocaleDateString("he-IL");

  if (!doc.url) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-center text-xs text-red-500">
        קישור לא זמין
      </div>
    );
  }

  if (isImage(doc.mime)) {
    return (
      <button
        type="button"
        onClick={onZoom}
        className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100"
        title={`הועלה ${date}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={doc.url}
          alt="מסמך"
          loading="lazy"
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      </button>
    );
  }

  // PDFs / non-images → open in a new tab.
  return (
    <a
      href={doc.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white p-2 text-center hover:bg-zinc-50"
      title={`הועלה ${date}`}
    >
      <span className="text-2xl">📄</span>
      <span className="text-xs text-blue-600">פתח PDF</span>
    </a>
  );
}
