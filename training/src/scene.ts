import type { Page } from "playwright";
import type { DemoClaim } from "./demo.ts";
import type { Env } from "./env.ts";
import type { Stage, Surface } from "./stage/stage.ts";

export type StepCtx = {
  page: Page;
  stage: Stage;
  demo: DemoClaim;
  env: Env;
  /** Values handed from one segment to a later one, e.g. shared.clientUrl. */
  shared: Record<string, string>;
};

/** `caption` is shown before `run`; the recorder holds on it after `run` returns. */
export type Step = { name: string; caption?: string; run: (c: StepCtx) => Promise<void> };
/** `title` becomes a full-frame chapter card before the first step. */
export type Segment = { surface: Surface; title?: string; steps: Step[] };
export type Scene = { id: string; segments: Segment[] };

// Step names become failure-screenshot file names, so they must be unique and file-safe.
export function validateScene(s: Scene): string[] {
  const errs: string[] = [];
  if (s.segments.length === 0) errs.push("scene has no segments");
  const seen = new Set<string>();
  s.segments.forEach((seg, i) => {
    if (seg.steps.length === 0) errs.push(`segment ${i + 1} has no steps`);
    for (const st of seg.steps) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(st.name)) errs.push(`step name "${st.name}" must be lowercase letters, digits and dashes`);
      else if (seen.has(st.name)) errs.push(`duplicate step name "${st.name}"`);
      seen.add(st.name);
    }
  });
  return errs;
}
