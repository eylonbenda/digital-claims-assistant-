import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "../src/env.ts";
import type { Audience } from "./copy.ts";

// The moments of the real app the promo shows. Compositions refer to captures by these ids.
// The app is captured in a narrow window and at a high pixel density, so its own text is
// large and sharp when a capture fills a frame of the video. The "docs" stills are the same
// step of the client's form as each document lands; "case-*" and "form-tab" are whole pages.
export const CAPTURE_IDS = [
  "client-question", "client-docs-0", "client-docs-1", "client-docs-2", "client-docs-3", "client-sent",
  "case-overview", "case-files", "form-tab",
  "pdf-page-1",
] as const;
export type CaptureId = (typeof CAPTURE_IDS)[number];

// `marks`: where named parts of the app sit in the still (0..1 on each axis) and how large
// their text is in the app's own pixels. Measured at capture time, so the camera, a tap or a
// highlight lands on the part even after the app's layout shifts.
export type Mark = { x: number; y: number; w: number; h: number; px: number };
// `avoid`: parts of the still that must not appear in a video (0..1 on each axis). "login" is
// the demo account's address; "agent-word" is the app saying "סוכן", which the garage version
// must not show. Found in the page at capture time, so a layout change cannot slip one in.
export type Avoid = { what: "login" | "agent-word"; x: number; y: number; w: number; h: number };
export type Capture = {
  id: CaptureId; file: string; width: number; height: number; surface: "phone" | "desktop" | "pdf";
  cssWidth?: number; // the width of the app's window when this was taken, in the app's pixels
  marks?: Record<string, Mark>;
  avoid?: Avoid[];
};
export type Manifest = { audience: Audience; capturedAt: string; captures: Capture[] };

export const captureDir = (audience: Audience, outDir = OUT_DIR) => path.join(outDir, "promo", "captures", audience);

// Why this manifest cannot be rendered from, or [] when it can.
export function checkManifest(m: Manifest, audience: Audience): string[] {
  if (m.audience !== audience) return [`captures belong to the ${m.audience} version, not ${audience}`];
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const c of m.captures) {
    if (seen.has(c.id)) problems.push(`duplicate capture: ${c.id}`);
    seen.add(c.id);
  }
  for (const id of CAPTURE_IDS) if (!seen.has(id)) problems.push(`missing capture: ${id}`);
  return problems;
}

export function readManifest(audience: Audience, outDir = OUT_DIR): Manifest {
  const file = path.join(captureDir(audience, outDir), "manifest.json");
  if (!fs.existsSync(file)) throw new Error(`no captures for the ${audience} version — run \`npm run promo:capture\` first`);
  const m = JSON.parse(fs.readFileSync(file, "utf8")) as Manifest;
  const problems = checkManifest(m, audience);
  if (problems.length) throw new Error(`captures for ${audience} are unusable: ${problems.join("; ")}`);
  for (const c of m.captures) {
    if (!fs.existsSync(path.join(captureDir(audience, outDir), c.file))) throw new Error(`capture file is missing: ${c.file}`);
  }
  return m;
}
