import { describe, it, expect } from "vitest";
import { normalizeClaimDates } from "./dates";
import type { ClaimData } from "./types";

describe("normalizeClaimDates", () => {
  it("converts the accident date — the field that reached the PDF as ISO", () => {
    const out = normalizeClaimDates({ accident: { date: "2026-07-10", time: "08:30" } });
    expect(out.accident?.date).toBe("10/07/2026");
    expect(out.accident?.time).toBe("08:30"); // time must not be touched
  });

  it("converts every date field the insurer templates draw", () => {
    const out = normalizeClaimDates({
      insured: { birth_date: "1990-01-01" },
      driver: { birth_date: "1988-03-04", license_date: "2008-06-01", license_expiry: "2030-12-31" },
      accident: { date: "2026-07-10" },
      declarations: { date: "2026-07-14" },
    });
    expect(out.insured?.birth_date).toBe("01/01/1990");
    expect(out.driver?.birth_date).toBe("04/03/1988");
    expect(out.driver?.license_date).toBe("01/06/2008");
    expect(out.driver?.license_expiry).toBe("31/12/2030");
    expect(out.accident?.date).toBe("10/07/2026");
    expect(out.declarations?.date).toBe("14/07/2026");
  });

  it("reaches date fields inside arrays (injured_persons)", () => {
    const out = normalizeClaimDates({
      injured_persons: [{ birth_date: "2001-02-03" }, { birth_date: "1975-11-30" }],
    });
    expect(out.injured_persons?.[0].birth_date).toBe("03/02/2001");
    expect(out.injured_persons?.[1].birth_date).toBe("30/11/1975");
  });

  it("leaves non-date fields and already-Israeli dates alone", () => {
    const out = normalizeClaimDates({
      insured: { first_name: "דנה", id_number: "123456782" },
      accident: { date: "22/06/2026", location: "צומת", description: "2026-07-10 לא תאריך שדה" },
    });
    expect(out.insured?.first_name).toBe("דנה");
    expect(out.insured?.id_number).toBe("123456782");
    expect(out.accident?.date).toBe("22/06/2026");
    expect(out.accident?.description).toBe("2026-07-10 לא תאריך שדה");
  });

  it("does not mutate the input (summary_json is an audit record)", () => {
    const input: ClaimData = { accident: { date: "2026-07-10" } };
    const out = normalizeClaimDates(input);
    expect(input.accident?.date).toBe("2026-07-10");
    expect(out).not.toBe(input);
  });

  it("survives empty / absent data", () => {
    expect(normalizeClaimDates({})).toEqual({});
    expect(normalizeClaimDates({ accident: { date: "" } }).accident?.date).toBe("");
  });
});
