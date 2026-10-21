import { describe, expect, test } from "vitest";
import { AGENT_DOC_TYPES } from "./agent-doc-types";
import { requirementFor } from "@/lib/handling/transitions";
import { HANDLING_STATUSES } from "@/lib/handling/types";

describe("AGENT_DOC_TYPES", () => {
  test("every evidence doc the handling gates require is uploadable by the agent", () => {
    for (const s of HANDLING_STATUSES) {
      const doc = requirementFor(s).evidenceDoc;
      if (doc) expect(AGENT_DOC_TYPES.has(doc)).toBe(true);
    }
  });
  test("the pre-existing agent types are still present", () => {
    for (const t of ["appraiser_report", "garage_invoice", "demand_form", "other"]) {
      expect(AGENT_DOC_TYPES.has(t)).toBe(true);
    }
  });
});
