import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { needsAnalysis, readCachedAnalysis, type SummaryJson } from "./analysis-cache";
import { toClaimData, type State } from "@/lib/collection/claim-state";
import type { ClaimAnalysis } from "@/lib/ai/analyze";

const collected: State = {
  consent: true,
  injuries: false,
  policyInsurer: "menora",
  insuranceType: "comprehensive",
  insured: { first_name: "דנה", last_name: "לוי", id_number: "312345678", mobile: "0501234567", city: "חיפה" },
  driver: { isInsured: true, first_name: "", last_name: "", id_number: "", license_number: "", relation_to_insured: "" },
  vehicle: { plate: "12-345-67", manufacturer: "טויוטה", year: "2020" },
  accident: { date: "2026-07-10", time: "08:30", location: "צומת", description: "פגיעה מאחור" },
  fault: "third_party",
  thirdParty: { present: false, name: "", phone: "", plate: "", insurer: "" },
  declaration: { data_consent: true, poa_third_party: false, signed_date: "" },
  documents: [],
};
const hash = createHash("sha1").update(JSON.stringify(toClaimData(collected))).digest("hex");
const analysis = { summary: "x", missing: [] } as unknown as ClaimAnalysis;

afterEach(() => vi.unstubAllEnvs());

describe("readCachedAnalysis", () => {
  it("returns the analysis when the input hash matches", () => {
    expect(readCachedAnalysis({ collected, analysis, analysis_input_hash: hash })).toBe(analysis);
  });

  it("returns null when stale, absent, or nothing collected", () => {
    expect(readCachedAnalysis({ collected, analysis, analysis_input_hash: "old" })).toBeNull();
    expect(readCachedAnalysis({ collected })).toBeNull();
    expect(readCachedAnalysis({ analysis, analysis_input_hash: hash })).toBeNull();
    expect(readCachedAnalysis(null)).toBeNull();
  });
});

describe("needsAnalysis", () => {
  it("is true only for a cold/stale cache with data and a key", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const cold: SummaryJson = { collected };
    expect(needsAnalysis(cold)).toBe(true);
    expect(needsAnalysis({ collected, analysis, analysis_input_hash: hash })).toBe(false);
    expect(needsAnalysis(null)).toBe(false);
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(needsAnalysis(cold)).toBe(false);
  });
});
