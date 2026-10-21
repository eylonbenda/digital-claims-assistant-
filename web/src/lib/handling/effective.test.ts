import { describe, expect, test } from "vitest";
import { effectiveHandling } from "./effective";

describe("effectiveHandling", () => {
  test("the column wins over any milestone state", () => {
    expect(
      effectiveHandling("paid", { submitted_to_tp_insurer: true }, "third_party_report"),
    ).toBe("paid");
  });

  test("legacy claim: null column + ticked sent-milestone derives 'sent'", () => {
    expect(
      effectiveHandling(null, { submitted_to_tp_insurer: true }, "third_party_report"),
    ).toBe("sent");
    expect(effectiveHandling(null, { submitted_to_insurer: true }, "own_policy")).toBe("sent");
    expect(
      effectiveHandling(null, { approval_requested: true }, "third_party_settlement"),
    ).toBe("sent");
  });

  test("a ticked milestone of the wrong track derives nothing", () => {
    expect(
      effectiveHandling(null, { submitted_to_insurer: true }, "third_party_report"),
    ).toBeNull();
  });

  test("unknown track derives nothing without the column", () => {
    expect(
      effectiveHandling(null, { submitted_to_tp_insurer: true }, "unknown"),
    ).toBeNull();
  });

  test("null state and empty state derive nothing", () => {
    expect(effectiveHandling(null, null, "third_party_report")).toBeNull();
    expect(effectiveHandling(null, {}, "own_policy")).toBeNull();
  });

  test("an unrecognized column value is ignored (falls back to derivation)", () => {
    expect(
      effectiveHandling("garbage", { submitted_to_insurer: true }, "own_policy"),
    ).toBe("sent");
  });
});

describe("effectiveHandling — legacy paid derivation", () => {
  test("a hand-ticked payment_received derives 'paid', beating the sent milestone", () => {
    expect(
      effectiveHandling(
        null,
        { submitted_to_tp_insurer: true, payment_received: true },
        "third_party_report",
      ),
    ).toBe("paid");
  });
});
