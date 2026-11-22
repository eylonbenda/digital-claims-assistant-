import { randomInt } from "node:crypto";

// The seed deletes an agent's claims. It may only ever do that to an account this tool
// created, which it recognises by a stamp in the auth user's app_metadata — never by
// email alone: DEMO_AGENT_EMAIL could be mistyped as a real account's address.
export const DEMO_STAMP = "training_demo";

export function demoUserDecision(found: { app_metadata?: Record<string, unknown> } | null): "create" | "use" | "refuse" {
  if (found === null) return "create";
  return found.app_metadata?.[DEMO_STAMP] === true ? "use" : "refuse";
}

// A fresh phone-shaped value per run, stored on the marker claim. Seeing it on the
// dashboard proves the app reads the database THIS run seeded, not one seeded earlier.
export function newMarkerPhone(): string {
  return `05000${String(randomInt(0, 100_000)).padStart(5, "0")}`;
}

// The name shown for the demo business. The promo records an insurance-agency version too.
export const DEFAULT_AGENT_NAME = "מוסך הדגמה";
export function agentName(opts?: { businessName?: string }): string {
  return opts?.businessName?.trim() || DEFAULT_AGENT_NAME;
}
