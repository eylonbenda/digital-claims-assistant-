// The wizard's single source of truth for step order, chapters, relevance and
// completeness (spec §3, §6). Pure — no React, no I/O.
import { REQUIRED_DOCS, type State } from "@/lib/collection/claim-state";

export type StepKey =
  | "intro" | "injuries" | "driver_who" | "fault" | "tp_present"
  | "vehicle" | "insured" | "driver_details" | "tp_details"
  | "when_where" | "description" | "documents" | "summary";

export type Chapter = "intro" | "quick" | "details" | "finish";

export type StepDef = {
  key: StepKey;
  chapter: Chapter;
  isTapStep: boolean;
  isRelevant: (s: State) => boolean;
  isComplete: (s: State) => boolean;
};

const filled = (v: string) => v.trim().length > 0;
const always = () => true;

// A required document is satisfied by enough completed uploads (two for the licence
// — both sides) OR an explicit "I'll send it later" tap. Uploads still in flight or
// failed don't count: only `done` reached the server. Requirements that don't apply
// to this claim (no driver on a parked car) are skipped, not deferred.
export function docsSatisfied(s: State): boolean {
  return REQUIRED_DOCS.filter((r) => r.appliesTo(s)).every(
    (r) => doneCount(s, r.type) >= r.min || s.docsDeferred?.[r.type] === true,
  );
}

export function doneCount(s: State, type: string): number {
  return s.documents.filter((d) => d.type === type && d.status === "done").length;
}

export const STEPS: StepDef[] = [
  { key: "intro",          chapter: "intro",   isTapStep: false, isRelevant: always, isComplete: (s) => s.consent },
  { key: "injuries",       chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => s.injuries !== null },
  { key: "driver_who",     chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => !!s.driver.parked || s.driver.isInsured !== null },
  { key: "fault",          chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => s.fault !== null },
  { key: "tp_present",     chapter: "quick",   isTapStep: true,  isRelevant: always, isComplete: (s) => s.thirdParty.present !== null },
  { key: "vehicle",        chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) => filled(s.vehicle.plate) && filled(s.vehicle.manufacturer) && filled(s.vehicle.year) },
  { key: "insured",        chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) =>
      filled(s.insured.first_name) && filled(s.insured.last_name) && filled(s.insured.id_number) &&
      filled(s.insured.mobile) && filled(s.insured.city) && filled(s.policyInsurer) && filled(s.insuranceType) },
  { key: "driver_details", chapter: "details", isTapStep: false,
    isRelevant: (s) => s.driver.isInsured === false,
    isComplete: (s) => filled(s.driver.first_name) && filled(s.driver.last_name) && filled(s.driver.id_number) },
  { key: "tp_details",     chapter: "details", isTapStep: false,
    isRelevant: (s) => s.thirdParty.present === true,
    // details_unknown (hit-and-run) unblocks the step — partial details are still kept.
    isComplete: (s) =>
      !!s.thirdParty.details_unknown ||
      (filled(s.thirdParty.name) && filled(s.thirdParty.plate) && filled(s.thirdParty.insurer)) },
  { key: "when_where",     chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) => filled(s.accident.date) && filled(s.accident.time) && filled(s.accident.location) },
  { key: "description",    chapter: "details", isTapStep: false, isRelevant: always,
    isComplete: (s) => filled(s.accident.description) },
  { key: "documents",      chapter: "finish",  isTapStep: false, isRelevant: always, isComplete: docsSatisfied },
  { key: "summary",        chapter: "finish",  isTapStep: false, isRelevant: always, isComplete: always },
];

export function visibleSteps(s: State): StepDef[] {
  return STEPS.filter((step) => step.isRelevant(s));
}

// Resume position: the first visible step the claimant hasn't completed.
// `documents` carries real completeness since the required uploads landed, so a
// resumed session that still owes a licence or registration returns there rather
// than skipping to the summary and submitting past the requirement. `summary` has
// no completeness of its own and is the past-the-end fallback.
export function firstIncompleteKey(s: State): StepKey {
  for (const step of visibleSteps(s)) {
    if (step.key === "summary") continue;
    if (!step.isComplete(s)) return step.key;
  }
  return "summary";
}

export function isStepKey(v: unknown): v is StepKey {
  return typeof v === "string" && STEPS.some((s) => s.key === v);
}

// Position of a step in the flow, used to keep the furthest-reached point
// monotonic: the claimant navigates backwards freely, and a funnel that dropped to
// whatever step they happened to be on last would understate how far they got.
// -1 for anything unrecognised, so an unknown key can never win a comparison.
export function stepIndex(key: unknown): number {
  return STEPS.findIndex((s) => s.key === key);
}

export const CHIP_LABEL: Record<Exclude<Chapter, "intro">, string> = {
  quick: "שאלות מהירות",
  details: "הפרטים",
  finish: "סיום",
};

export const TIME_LEFT: Record<Chapter, string> = {
  intro: "עוד כ־3 דקות",
  quick: "עוד כ־3 דקות",
  details: "עוד כ־2 דקות",
  finish: "עוד כדקה",
};
