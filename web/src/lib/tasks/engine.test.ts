import { describe, it, expect } from "vitest";
import { computeChecklist, type ComputedItem } from "@/lib/claims/checklist";
import { advanceTasks } from "./engine";
import type { EngineEvent, EngineInput, TaskRow } from "./types";

const NOW = new Date("2026-07-08T10:00:00Z");
const DAY = 86_400_000;
const FLAGS = {
  theft: false, lien: false, business_use: false,
  policy_activated: false, garage_network_rider: false,
};

function checklist(
  claimType: string,
  docs: string[] = [],
  hasForm = false,
  state: Record<string, boolean> = {},
): ComputedItem[] {
  return computeChecklist(claimType, new Set(docs), hasForm, state, FLAGS);
}

function task(over: Partial<TaskRow> & { key: string }): TaskRow {
  return {
    id: `id-${over.key}`, title: "t", status: "todo",
    due_at: null, source: "template", ...over,
  };
}

function run(over: {
  claimType?: EngineInput["claim"]["claimType"];
  status?: EngineInput["claim"]["status"];
  atFaultInsurer?: string | null;
  docs?: string[];
  hasForm?: boolean;
  state?: Record<string, boolean>;
  openTasks?: TaskRow[];
  event: EngineEvent;
}) {
  const claimType = over.claimType ?? "own_policy";
  return advanceTasks({
    claim: {
      claimType,
      status: over.status ?? "classified",
      atFaultInsurer: over.atFaultInsurer ?? null,
    },
    checklist: checklist(claimType, over.docs, over.hasForm ?? false, over.state ?? {}),
    hasGeneratedForm: over.hasForm ?? false,
    openTasks: over.openTasks ?? [],
    event: over.event,
    now: NOW,
  });
}

describe("spawning", () => {
  it("track_confirmed on own_policy spawns open_claim_with_insurer due +2d", () => {
    const r = run({ event: { type: "track_confirmed" } });
    const t = r.spawn.find((s) => s.key === "open_claim_with_insurer");
    expect(t).toBeDefined();
    expect(t!.track).toBe("own_policy");
    expect(new Date(t!.due_at).getTime()).toBe(NOW.getTime() + 2 * DAY);
  });

  it("track_confirmed on TP-report without at-fault insurer spawns get_tp_insurer", () => {
    const r = run({ claimType: "third_party_report", event: { type: "track_confirmed" } });
    expect(r.spawn.some((s) => s.key === "get_tp_insurer")).toBe(true);
  });

  it("track_confirmed on TP-report WITH at-fault insurer does not spawn get_tp_insurer", () => {
    const r = run({
      claimType: "third_party_report", atFaultInsurer: "clal",
      event: { type: "track_confirmed" },
    });
    expect(r.spawn.some((s) => s.key === "get_tp_insurer")).toBe(false);
  });

  it("claim_submitted on an unclassified claim with missing base docs spawns chase_missing_docs with track null", () => {
    const r = run({ claimType: "unknown", status: "in_progress", event: { type: "claim_submitted" } });
    const t = r.spawn.find((s) => s.key === "chase_missing_docs");
    expect(t).toBeDefined();
    expect(t!.track).toBeNull(); // task_track enum has no 'unknown'
  });

  it("claim_submitted with all base docs present spawns nothing", () => {
    const r = run({
      claimType: "unknown", status: "in_progress",
      docs: ["drivers_license", "vehicle_reg", "car_photo"],
      event: { type: "claim_submitted" },
    });
    expect(r.spawn).toEqual([]);
  });

  it("condition-triggered submit_to_tp_insurer fires on the doc upload that clears the last blocker", () => {
    const r = run({
      claimType: "third_party_report",
      docs: [
        "vehicle_reg", "car_photo", "demand_form", "appraiser_report",
        "garage_invoice", "repair_receipt", "no_claim_confirmation",
      ],
      hasForm: true,
      event: { type: "doc_uploaded", docType: "repair_receipt" },
    });
    expect(r.spawn.some((s) => s.key === "submit_to_tp_insurer")).toBe(true);
  });

  it("uploading an ordinary doc spawns nothing (hybrid boundary: docs are never tasks)", () => {
    const r = run({ event: { type: "doc_uploaded", docType: "drivers_license" } });
    expect(r.spawn).toEqual([]);
  });

  it("does not spawn tasks on a closed claim, but still auto-completes", () => {
    const open = task({ key: "chase_appraiser", id: "t-c" });
    const r = run({
      status: "closed",
      docs: ["appraiser_report"],
      openTasks: [open],
      event: { type: "milestone_ticked", key: "car_at_garage", done: true },
    });
    expect(r.spawn).toEqual([]);
    expect(r.complete).toContain("t-c"); // auto-complete still runs
  });
});

describe("idempotency", () => {
  it("does not spawn when an open task with the same key exists", () => {
    const r = run({
      event: { type: "track_confirmed" },
      openTasks: [task({ key: "open_claim_with_insurer" })],
    });
    expect(r.spawn.some((s) => s.key === "open_claim_with_insurer")).toBe(false);
  });

  it("re-spawns after the previous task was done, if the condition still fails (spec §10)", () => {
    // openTasks excludes done tasks — a freed key spawns again on replay
    const r = run({ event: { type: "track_confirmed" }, openTasks: [] });
    expect(r.spawn.some((s) => s.key === "open_claim_with_insurer")).toBe(true);
  });

  it("never spawns a task whose completion condition already holds", () => {
    const r = run({
      state: { car_at_garage: true },
      docs: ["appraiser_report"],
      event: { type: "milestone_ticked", key: "car_at_garage", done: true },
    });
    expect(r.spawn.some((s) => s.key === "chase_appraiser")).toBe(false);
  });
});

describe("auto-complete", () => {
  it("completes chase_appraiser when the appraiser report lands", () => {
    const open = task({ key: "chase_appraiser", id: "t-1" });
    const r = run({
      docs: ["appraiser_report"],
      openTasks: [open],
      event: { type: "doc_uploaded", docType: "appraiser_report" },
    });
    expect(r.complete).toContain("t-1");
  });

  it("never auto-completes manual tasks (key null)", () => {
    const manual: TaskRow = {
      id: "m-1", key: null, title: "ידני", status: "todo", due_at: null, source: "manual",
    };
    const r = run({
      docs: ["appraiser_report"],
      openTasks: [manual],
      event: { type: "doc_uploaded", docType: "appraiser_report" },
    });
    expect(r.complete).toEqual([]);
  });

  it("settlement chain: approval_requested tick completes the request task and spawns follow-up", () => {
    const open = task({ key: "request_settlement_approval", id: "t-req" });
    const r = run({
      claimType: "third_party_settlement",
      state: { approval_requested: true },
      openTasks: [open],
      event: { type: "milestone_ticked", key: "approval_requested", done: true },
    });
    expect(r.complete).toContain("t-req");
    expect(r.spawn.some((s) => s.key === "follow_up_approval")).toBe(true);
  });
});

describe("status advance", () => {
  it("claim_submitted advances to submitted", () => {
    const r = run({ claimType: "unknown", status: "in_progress", event: { type: "claim_submitted" } });
    expect(r.statusAdvance).toBe("submitted");
  });

  it("track_confirmed advances submitted → classified when no form exists", () => {
    const r = run({ status: "submitted", event: { type: "track_confirmed" } });
    expect(r.statusAdvance).toBe("classified");
  });

  it("track_confirmed advances to form_generated when a form exists", () => {
    const r = run({ status: "submitted", hasForm: true, event: { type: "track_confirmed" } });
    expect(r.statusAdvance).toBe("form_generated");
  });

  it("milestone tick advances to checklist_active", () => {
    const r = run({
      status: "classified",
      state: { car_at_garage: true },
      event: { type: "milestone_ticked", key: "car_at_garage", done: true },
    });
    expect(r.statusAdvance).toBe("checklist_active");
  });

  it("payment_received tick closes the claim", () => {
    const r = run({
      status: "checklist_active",
      state: { payment_received: true },
      event: { type: "milestone_ticked", key: "payment_received", done: true },
    });
    expect(r.statusAdvance).toBe("closed");
  });

  it("is forward-only: track_confirmed on a checklist_active claim does not regress", () => {
    const r = run({ status: "checklist_active", event: { type: "track_confirmed" } });
    expect(r.statusAdvance).toBeNull();
  });

  it("unticking a milestone never changes status", () => {
    const r = run({
      status: "checklist_active",
      event: { type: "milestone_ticked", key: "car_at_garage", done: false },
    });
    expect(r.statusAdvance).toBeNull();
  });

  it("doc uploads never change status", () => {
    const r = run({ status: "submitted", event: { type: "doc_uploaded", docType: "car_photo" } });
    expect(r.statusAdvance).toBeNull();
  });

  it("never advances a closed claim", () => {
    const r = run({
      status: "closed",
      state: { car_at_garage: true },
      event: { type: "milestone_ticked", key: "car_at_garage", done: true },
    });
    expect(r.statusAdvance).toBeNull();
  });
});
