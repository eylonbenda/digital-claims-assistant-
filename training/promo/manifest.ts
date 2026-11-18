import fs from "node:fs";
import path from "node:path";
import { OUT_DIR } from "../src/env.ts";
import type { Audience } from "./copy.ts";

// The moments of the real app the promo shows. Compositions refer to captures by these ids.
export const CAPTURE_IDS = [
  "client-question", "client-licence", "client-photos", "client-sent",
  "dashboard-submitted", "cockpit-overview", "cockpit-files", "form-tab",
  "pdf-page-1",
] as const;
export type CaptureId = (typeof CAPTURE_IDS)[number];

export type Capture = { id: CaptureId; file: string; width: number; height: number; surface: "phone" | "desktop" | "pdf" };
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
