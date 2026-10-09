import { describe, expect, it } from "vitest";
import { milestoneDates, type MilestoneEvent } from "./milestone-dates";

const ev = (key: string, done: boolean, at: string): MilestoneEvent => ({
  type: "milestone_ticked",
  payload_json: { key, done },
  created_at: at,
});

describe("milestoneDates", () => {
  it("dates each ticked milestone", () => {
    expect(
      milestoneDates([
        ev("car_at_garage", true, "2026-10-01T08:00:00Z"),
        ev("submitted_to_insurer", true, "2026-10-03T09:00:00Z"),
      ]),
    ).toEqual({
      car_at_garage: "2026-10-01T08:00:00Z",
      submitted_to_insurer: "2026-10-03T09:00:00Z",
    });
  });

  it("an un-tick clears the date; a re-tick dates from the re-tick", () => {
    expect(
      milestoneDates([
        ev("car_at_garage", true, "2026-10-01T08:00:00Z"),
        ev("car_at_garage", false, "2026-10-01T08:05:00Z"),
      ]),
    ).toEqual({});
    expect(
      milestoneDates([
        ev("car_at_garage", true, "2026-10-01T08:00:00Z"),
        ev("car_at_garage", false, "2026-10-01T08:05:00Z"),
        ev("car_at_garage", true, "2026-10-02T10:00:00Z"),
      ]),
    ).toEqual({ car_at_garage: "2026-10-02T10:00:00Z" });
  });

  it("is order-independent and ignores other events and malformed payloads", () => {
    expect(
      milestoneDates([
        ev("payment_received", true, "2026-10-09T12:00:00Z"),
        { type: "submitted", payload_json: { key: "x", done: true }, created_at: "2026-10-01T00:00:00Z" },
        { type: "milestone_ticked", payload_json: { key: 1 }, created_at: "2026-10-02T00:00:00Z" },
        ev("payment_received", false, "2026-10-08T12:00:00Z"),
      ]),
    ).toEqual({ payment_received: "2026-10-09T12:00:00Z" });
  });
});
