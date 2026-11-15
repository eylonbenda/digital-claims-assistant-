// Chart primitives for the overview page — plain markup, no client JS, no library.
//
// Colour is assigned by the job it does (validated with the dataviz palette checker
// against a white surface):
//   - stages are an ordered pipeline → one hue, light to dark (ordinal ramp);
//   - the cycle bar splits one whole into three named parts → three categorical hues;
//   - a single measure (waiting bars, the meter, "this period") → the one accent hue;
//   - "late" is a state → the reserved status red, always with an icon and a label.
// Text never takes a data colour; a swatch beside it carries the identity.
import type { OpenStage } from "@/lib/overview/compute";

export const STAGE_COLOR: Record<OpenStage, string> = {
  with_client: "#86b6ef",
  before_send: "#5598e7",
  sent: "#2a78d6",
  awaiting_payment: "#1c5cab",
};
export const CYCLE_COLOR = { collect: "#2a78d6", prepare: "#eb6834", payment: "#1baf7a" } as const;
export const ACCENT = "#2a78d6";
export const ACCENT_TRACK = "#cde2fb";
export const DEEMPHASIS = "#c5cad3";
export const STATUS_CRITICAL = "#d03b3b";

export function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: color }} aria-hidden="true" />;
}

// One whole split into a few parts, shown beside tiles that already carry each
// part's name and figure — so the bar itself has no text.
export function SegmentedBar({
  parts,
  label,
}: {
  parts: { key: string; name: string; value: number; display: string; color: string }[];
  label: string;
}) {
  const shown = parts.filter((p) => p.value > 0);
  if (shown.length === 0) return null;
  return (
    <div className="flex h-3 w-full gap-[2px]" role="img" aria-label={label}>
      {shown.map((p, i) => (
        <div
          key={p.key}
          title={`${p.name}: ${p.display}`}
          className={`h-full min-w-[6px] ${i === 0 ? "rounded-s-[4px]" : ""} ${i === shown.length - 1 ? "rounded-e-[4px]" : ""}`}
          style={{ flexGrow: p.value, flexBasis: 0, background: p.color }}
        />
      ))}
    </div>
  );
}

// A magnitude on a shared scale. Anchored to the inline start (the right edge in
// RTL), rounded at the data end only.
export function HBar({ value, max, color, title }: { value: number; max: number; color: string; title: string }) {
  const pct = max > 0 ? Math.max(value > 0 ? 3 : 0, (value / max) * 100) : 0;
  return (
    <div className="h-3 w-full" title={title}>
      <div className="h-full rounded-e-[4px]" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// A single ratio against its whole: fill on a lighter step of the same hue.
export function Meter({ ratio, label }: { ratio: number; label: string }) {
  const pct = Math.min(100, Math.max(0, ratio * 100));
  return (
    <div
      className="h-3 w-full overflow-hidden rounded-[4px]"
      style={{ background: ACCENT_TRACK }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      aria-label={label}
      title={label}
    >
      <div className="h-full rounded-e-[4px]" style={{ width: `${pct}%`, background: ACCENT }} />
    </div>
  );
}

const ICON_PATHS = {
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2",
  timer: "M10 2h4M12 14l3-3M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  userCheck: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 0 2 2 4-4",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Zm0 0v5h5M9 13h6M9 17h6",
  send: "m22 2-7 20-4-9-9-4 20-7Zm0 0L11 13",
  wallet: "M20 7H5a2 2 0 0 1 0-4h13v4Zm0 0v4m0 0v4m0-4h-3a2 2 0 0 0 0 4h3m0 0v4H5a2 2 0 0 1-2-2V5",
  alert: "M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
} as const;
export type IconName = keyof typeof ICON_PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

const TONE = {
  blue: "bg-blue-50 text-blue-700",
  amber: "bg-amber-50 text-amber-700",
  violet: "bg-violet-50 text-violet-700",
  emerald: "bg-emerald-50 text-emerald-700",
  slate: "bg-zinc-100 text-zinc-600",
} as const;
export type Tone = keyof typeof TONE;

// The tinted square that leads a card or a tile.
export function IconTile({ name, tone, small = false }: { name: IconName; tone: Tone; small?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-lg ${small ? "h-7 w-7" : "h-9 w-9"} ${TONE[tone]}`}>
      <Icon name={name} size={small ? 15 : 18} />
    </span>
  );
}
