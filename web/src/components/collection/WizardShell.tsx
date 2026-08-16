"use client";

import type { ReactNode } from "react";
import { CHIP_LABEL, TIME_LEFT, type Chapter } from "./steps";

export type ShellProps = {
  chapter: Chapter;
  doneChapters: Chapter[];
  dots: { count: number; index: number } | null;
  isTapStep: boolean;
  backDisabled: boolean;
  onBack: () => void;
  nextLabel: string;
  nextDisabled: boolean;
  onNext: () => void;
  nextVariant: "primary" | "submit";
  requiredHint: boolean;
  cheer: string | null;
  children: ReactNode;
};

const CHIP_ORDER: ("quick" | "details" | "finish")[] = ["quick", "details", "finish"];

// The wizard's frame: chapter chips + in-chapter dots on top (never "שלב X מתוך 11"),
// step content, required-fields hint, back/next nav, and the persistent reassurance
// footer (spec §4). Tap steps auto-advance, so their המשך button is hidden.
export default function WizardShell(p: ShellProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col p-5 text-lg">
      <div className="mb-6">
        <div className="flex items-center justify-center gap-2">
          {CHIP_ORDER.map((c) => {
            const done = p.doneChapters.includes(c);
            const active = p.chapter === c;
            return (
              <span
                key={c}
                aria-current={active ? "step" : undefined}
                className={`rounded-full px-3 py-1 text-sm ${
                  done
                    ? "bg-green-100 text-green-700"
                    : active
                      ? "bg-blue-600 font-medium text-white"
                      : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {done && "✓ "}
                {CHIP_LABEL[c]}
              </span>
            );
          })}
        </div>
        {p.dots && (
          <div aria-hidden="true" className="mt-3 flex justify-center gap-1.5">
            {Array.from({ length: p.dots.count }, (_, i) => (
              <span
                key={i}
                className={`h-2 w-2 rounded-full ${
                  i < p.dots!.index ? "bg-green-400" : i === p.dots!.index ? "bg-blue-600" : "bg-zinc-200"
                }`}
              />
            ))}
          </div>
        )}
        <p className="mt-2 text-center text-sm text-zinc-400">{TIME_LEFT[p.chapter]}</p>
        {p.cheer && (
          <p className="mt-2 text-center text-base font-medium text-green-700">{p.cheer}</p>
        )}
      </div>

      <div className="flex-1">{p.children}</div>

      {p.requiredHint && (
        <p className="mt-3 text-center text-sm text-amber-600">
          יש למלא את שדות החובה המסומנים בכוכבית (*)
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={p.onBack}
          disabled={p.backDisabled}
          className="min-h-12 rounded-lg px-4 py-2 text-zinc-600 disabled:opacity-40"
        >
          חזרה
        </button>
        {!p.isTapStep && (
          <button
            type="button"
            onClick={p.onNext}
            disabled={p.nextDisabled}
            className={`min-h-12 flex-1 rounded-lg px-4 py-3.5 font-medium text-white disabled:opacity-40 ${
              p.nextVariant === "submit" ? "bg-green-600" : "bg-blue-600"
            }`}
          >
            {p.nextLabel}
          </button>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-zinc-400">
        התשובות נשמרות — אפשר לעצור ולחזור לקישור בכל שלב
      </p>
    </div>
  );
}
