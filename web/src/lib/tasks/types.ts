import type { ComputedItem } from "@/lib/claims/checklist";

export type ClaimType =
  | "own_policy"
  | "third_party_report"
  | "third_party_settlement"
  | "unknown";

export type ClaimStatus =
  | "created"
  | "in_progress"
  | "submitted"
  | "classified"
  | "form_generated"
  | "checklist_active"
  | "closed"
  | "abandoned";

export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";

// Forward-only lifecycle ordering; the engine never proposes a move to a
// lower ordinal. 'abandoned' is terminal — the engine never advances from it.
export const STATUS_ORDER: Record<ClaimStatus, number> = {
  created: 0,
  in_progress: 1,
  submitted: 2,
  classified: 3,
  form_generated: 4,
  checklist_active: 5,
  closed: 6,
  abandoned: 99,
};

export type TaskRow = {
  id: string;
  key: string | null; // null = manual task, never auto-completed
  title: string;
  status: TaskStatus;
  due_at: string | null;
  source: string; // 'template' | 'manual'
};

export type TaskSpawn = {
  key: string;
  title: string;
  track: Exclude<ClaimType, "unknown"> | null; // task_track enum has no 'unknown'
  due_at: string; // ISO
};

export type EngineEvent =
  | { type: "claim_submitted" }
  | { type: "track_confirmed" }
  | { type: "milestone_ticked"; key: string; done: boolean }
  | { type: "doc_uploaded"; docType: string };

export type EngineInput = {
  claim: {
    claimType: ClaimType;
    status: ClaimStatus;
    atFaultInsurer: string | null;
  };
  checklist: ComputedItem[]; // computed AFTER the event's own DB mutation
  hasGeneratedForm: boolean;
  openTasks: TaskRow[]; // status != 'done'
  event: EngineEvent;
  now: Date;
};

export type EngineResult = {
  spawn: TaskSpawn[];
  complete: string[]; // ids of open tasks to mark done
  statusAdvance: ClaimStatus | null;
};
