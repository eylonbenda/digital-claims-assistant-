import { describe, expect, it } from "vitest";
import { classifyFromClaimData } from "./classify";
import type { ClaimData } from "@/lib/formfill/types";

const tpAtFault = (insurer: string, plate = ""): ClaimData => ({
  fault: "third_party",
  insurance_type: "comprehensive",
  third_parties: [{ vehicle_plate: plate, insurer }],
});

describe("classifyFromClaimData — third-party insurer sentinels", () => {
  it('does not treat "לא ידוע" alone as an identified third party', () => {
    expect(classifyFromClaimData(tpAtFault("לא ידוע")).proposedType).toBe("own_policy");
  });

  it("an identified, insured TP at fault → third-party track, high confidence", () => {
    const c = classifyFromClaimData(tpAtFault("הראל", "1234567"));
    expect(c.proposedType).toBe("third_party_report");
    expect(c.confidence).toBe("high");
    expect(c.viabilityWarning).toBeUndefined();
  });

  it("an uninsured TP keeps the track but drops confidence and warns the agent", () => {
    const c = classifyFromClaimData(tpAtFault("לא מבוטח", "1234567"));
    expect(c.proposedType).toBe("third_party_report");
    expect(c.confidence).toBe("low");
    expect(c.needsAgentChoice).toBe(true);
    expect(c.viabilityWarning).toContain("לא מבוטח");
  });

  it("one insured vehicle among several is enough to claim from", () => {
    const c = classifyFromClaimData({
      fault: "third_party",
      third_parties: [
        { vehicle_plate: "1111111", insurer: "לא מבוטח" },
        { vehicle_plate: "2222222", insurer: "כלל" },
      ],
    });
    expect(c.viabilityWarning).toBeUndefined();
  });
});
