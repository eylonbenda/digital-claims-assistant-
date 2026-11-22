import { describe, expect, it } from "vitest";
import { shownTab } from "./tabs";

describe("shownTab", () => {
  it("keeps the chosen tab while it exists", () => {
    expect(shownTab(["overview", "send", "form", "files"], "send")).toBe("send");
  });

  it("falls back to the overview when the chosen tab is gone", () => {
    // Marking a claim as sent removes the send tab while it is the open one.
    expect(shownTab(["overview", "form", "files"], "send")).toBe("overview");
  });
});
