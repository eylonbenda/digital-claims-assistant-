import { describe, expect, it } from "vitest";
import { CONSENT_RECIPIENT, NEUTRAL_HANDLER, sentTitle } from "./recipient";

describe("recipient copy", () => {
  it("names the business when one is stored", () => {
    expect(sentTitle("מוסך כהן")).toBe("הפרטים נשלחו למוסך כהן");
    expect(sentTitle("סוכנות ביטוח לוי")).toBe("הפרטים נשלחו לסוכנות ביטוח לוי");
  });

  it("falls back to neutral wording with no name", () => {
    expect(sentTitle(null)).toBe("הפרטים נשלחו לטיפול");
    expect(sentTitle(undefined)).toBe("הפרטים נשלחו לטיפול");
  });

  // A blank or whitespace-only name would otherwise render "הפרטים נשלחו ל".
  it("treats a blank name as absent", () => {
    expect(sentTitle("")).toBe("הפרטים נשלחו לטיפול");
    expect(sentTitle("   ")).toBe("הפרטים נשלחו לטיפול");
  });

  it("trims a padded name rather than rendering the padding", () => {
    expect(sentTitle("  מוסך כהן  ")).toBe("הפרטים נשלחו למוסך כהן");
  });

  // The two consent strings must never name one segment — the product serves
  // insurance agents and garages, and the pilot customer is a garage.
  it("keeps both consent strings segment-neutral", () => {
    for (const s of [CONSENT_RECIPIENT, NEUTRAL_HANDLER]) {
      expect(s).not.toMatch(/סוכן|מוסך/);
      expect(s).toContain("הגוף המטפל בתביעה".slice(1, 6));
    }
  });
});
