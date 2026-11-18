import { describe, expect, it } from "vitest";
import { FORM_KIND } from "@/lib/forms/kinds";
import { buildSubmission, type SubmissionSource } from "./build";

function src(over: Partial<SubmissionSource> = {}, claim: Partial<SubmissionSource["claim"]> = {}): SubmissionSource {
  return {
    claim: {
      id: "1a2b3c4d-0000-4000-8000-000000000000",
      client_name: "דנה כהן",
      claim_type: "third_party_report",
      policy_insurer: null,
      at_fault_insurer: null,
      summary_json: null,
      created_at: "2026-11-01T08:00:00Z",
      checklist_state: {},
      ...claim,
    },
    docs: [],
    forms: [],
    thirdParties: [],
    agencyName: "מוסך כהן",
    ...over,
  };
}

describe("buildSubmission", () => {
  it("has no submission while the claim is unclassified, but still a checklist", () => {
    const out = buildSubmission(src({}, { claim_type: "unknown" }));
    expect(out.submission).toBeNull();
    expect(out.checklist.length).toBeGreaterThan(0);
  });

  it("attaches the newest accident notice, never a demand form as the notice", () => {
    const out = buildSubmission(
      src({
        forms: [
          { insurer: "harel", storage_path: "forms/new-notice.pdf", kind: FORM_KIND.accidentNotice },
          { insurer: null, storage_path: "forms/demand.pdf", kind: FORM_KIND.demand },
          { insurer: "harel", storage_path: "forms/old-notice.pdf", kind: FORM_KIND.accidentNotice },
        ],
      }),
    );
    const paths = out.submission!.attachments.map((a) => a.storagePath);
    expect(paths[0]).toBe("forms/new-notice.pdf");
    expect(paths).toContain("forms/demand.pdf");
    expect(paths).not.toContain("forms/old-notice.pdf");
  });

  it("falls back to the third-party row for the at-fault insurer", () => {
    const out = buildSubmission(src({ thirdParties: [{ plate: "12-345-67", insurer: "הראל" }] }));
    expect(out.submission!.insurerKey).toBe("harel");
    // The stored column wins once the clerk has confirmed an insurer.
    const confirmed = buildSubmission(
      src({ thirdParties: [{ plate: null, insurer: "הראל" }] }, { at_fault_insurer: "menora" }),
    );
    expect(confirmed.submission!.insurerKey).toBe("menora");
  });
});
