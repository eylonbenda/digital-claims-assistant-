import { describe, expect, it } from "vitest";
import { MAX_SENDS_BEFORE_CALL, RULE_PRIORITY, SEND_RULES } from "./rules";

const CTX = {
  firstName: "דנה",
  blockingLabels: ["רישיון נהיגה"],
  uploadUrl: "https://app.test/c/tok",
};

describe("SEND_RULES", () => {
  it("covers exactly the three client-directed task keys", () => {
    expect(Object.keys(SEND_RULES).sort()).toEqual([
      "chase_missing_docs",
      "collect_private_report_docs",
      "get_tp_insurer",
    ]);
  });

  it("every rule is manual (auto=false) in C1", () => {
    for (const rule of Object.values(SEND_RULES)) expect(rule.auto).toBe(false);
  });

  it("cooldowns match the spec (3/3/4)", () => {
    expect(SEND_RULES.chase_missing_docs.cooldownDays).toBe(3);
    expect(SEND_RULES.get_tp_insurer.cooldownDays).toBe(3);
    expect(SEND_RULES.collect_private_report_docs.cooldownDays).toBe(4);
  });

  it("builders render a greeting; doc-chases include the upload link", () => {
    expect(SEND_RULES.chase_missing_docs.build(CTX)).toContain("https://app.test/c/tok");
    expect(SEND_RULES.collect_private_report_docs.build(CTX)).toContain("https://app.test/c/tok");
    expect(SEND_RULES.get_tp_insurer.build(CTX)).toContain("שלום דנה");
  });

  it("priority list covers all rules; give-up threshold is 3", () => {
    expect([...RULE_PRIORITY].sort()).toEqual(Object.keys(SEND_RULES).sort());
    expect(MAX_SENDS_BEFORE_CALL).toBe(3);
  });
});
