import type { ClaimType, EngineEvent } from "./types";

// Relative due-date offsets in days. FIELD ASSUMPTIONS (regulatory-clock.md §3),
// not regulated SLAs — tune with the design partner.
export const DUE_OFFSETS: Record<string, number> = {
  chase_missing_docs: 3,
  open_claim_with_insurer: 2,
  chase_appraiser: 3,
  follow_up_insurer: 14,
  get_tp_insurer: 2,
  collect_private_report_docs: 5,
  submit_to_tp_insurer: 2,
  follow_up_tp_insurer: 14,
  request_settlement_approval: 2,
  follow_up_approval: 5,
  schedule_garage: 3,
  follow_up_repair: 7,
};

// Read-only view of the claim the rules can query. Built by the engine from
// the computed checklist — rules never see raw rows.
export type RuleCtx = {
  claimType: ClaimType;
  atFaultInsurer: string | null;
  hasGeneratedForm: boolean;
  docDone: (docType: string) => boolean;
  milestoneDone: (key: string) => boolean;
  blockingMissing: () => boolean;
  // client-facing base docs still missing (kind 'doc' only — the generated
  // form is the system's job, not the client's)
  mandatoryBaseDocsMissing: () => boolean;
  blockingSectionMissing: (section: "base" | "late") => boolean;
};

export type TaskRule = {
  key: string;
  title: string; // Hebrew — shown verbatim in the UI
  dueDays: number;
  track: ClaimType | "all";
  spawnOn: (event: EngineEvent, ctx: RuleCtx) => boolean;
  completeWhen: (ctx: RuleCtx) => boolean;
};

export const TASK_RULES: TaskRule[] = [
  // ── all tracks ──────────────────────────────────────────────────────────
  {
    key: "chase_missing_docs",
    title: "להשלים מסמכים חסרים מהלקוח",
    dueDays: DUE_OFFSETS.chase_missing_docs,
    track: "all",
    // At submit the track is still 'unknown' (whose items are non-blocking),
    // so this keys off mandatory base DOCS, not blocking items. Re-evaluated
    // at track confirm, when the fuller track checklist kicks in.
    spawnOn: (e, ctx) =>
      (e.type === "claim_submitted" || e.type === "track_confirmed") &&
      ctx.mandatoryBaseDocsMissing(),
    completeWhen: (ctx) => !ctx.mandatoryBaseDocsMissing(),
  },

  // ── own_policy ──────────────────────────────────────────────────────────
  {
    key: "open_claim_with_insurer",
    title: "פתיחת תביעה מול מבטח הלקוח",
    dueDays: DUE_OFFSETS.open_claim_with_insurer,
    track: "own_policy",
    spawnOn: (e) => e.type === "track_confirmed",
    completeWhen: (ctx) => ctx.milestoneDone("submitted_to_insurer"),
  },
  {
    key: "chase_appraiser",
    title: "לוודא תיאום שמאי / דוח שמאי",
    dueDays: DUE_OFFSETS.chase_appraiser,
    track: "own_policy",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "car_at_garage" && e.done,
    completeWhen: (ctx) => ctx.docDone("appraiser_report"),
  },
  {
    key: "follow_up_insurer",
    title: "מעקב תשובת מבטח",
    dueDays: DUE_OFFSETS.follow_up_insurer,
    track: "own_policy",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "submitted_to_insurer" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("payment_received"),
  },

  // ── third_party_report ──────────────────────────────────────────────────
  {
    key: "get_tp_insurer",
    title: "להשיג פרטי מבטח צד ג'",
    dueDays: DUE_OFFSETS.get_tp_insurer,
    track: "third_party_report",
    spawnOn: (e, ctx) => e.type === "track_confirmed" && !ctx.atFaultInsurer,
    completeWhen: (ctx) => !!ctx.atFaultInsurer,
  },
  {
    key: "chase_appraiser",
    title: "לוודא דוח שמאי",
    dueDays: DUE_OFFSETS.chase_appraiser,
    track: "third_party_report",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "car_at_garage" && e.done,
    completeWhen: (ctx) => ctx.docDone("appraiser_report"),
  },
  {
    key: "collect_private_report_docs",
    title: 'לאסוף מסמכי "דוח פרטי" (קבלה, אישור אי-הגשה, עבר ביטוחי)',
    dueDays: DUE_OFFSETS.collect_private_report_docs,
    track: "third_party_report",
    spawnOn: (e) => e.type === "doc_uploaded" && e.docType === "garage_invoice",
    completeWhen: (ctx) => !ctx.blockingSectionMissing("late"),
  },
  {
    key: "submit_to_tp_insurer",
    title: "להגיש למבטח צד ג'",
    dueDays: DUE_OFFSETS.submit_to_tp_insurer,
    track: "third_party_report",
    // condition-triggered: fires on whatever event clears the last blocker
    spawnOn: (_e, ctx) => !ctx.blockingMissing(),
    completeWhen: (ctx) => ctx.milestoneDone("submitted_to_tp_insurer"),
  },
  {
    key: "follow_up_tp_insurer",
    title: "מעקב אישור / דחייה / השלמות",
    dueDays: DUE_OFFSETS.follow_up_tp_insurer,
    track: "third_party_report",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "submitted_to_tp_insurer" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("payment_received"),
  },

  // ── third_party_settlement ──────────────────────────────────────────────
  {
    key: "request_settlement_approval",
    title: "לשלוח בקשת אישור הסדר למבטח צד ג'",
    dueDays: DUE_OFFSETS.request_settlement_approval,
    track: "third_party_settlement",
    spawnOn: (e) => e.type === "track_confirmed",
    completeWhen: (ctx) => ctx.milestoneDone("approval_requested"),
  },
  {
    key: "follow_up_approval",
    title: "מעקב אישור מסלול הסדר",
    dueDays: DUE_OFFSETS.follow_up_approval,
    track: "third_party_settlement",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "approval_requested" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("route_approved"),
  },
  {
    key: "schedule_garage",
    title: "לתאם כניסה למוסך הסדר",
    dueDays: DUE_OFFSETS.schedule_garage,
    track: "third_party_settlement",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "route_approved" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("car_at_garage"),
  },
  {
    key: "follow_up_repair",
    title: "מעקב סיום תיקון",
    dueDays: DUE_OFFSETS.follow_up_repair,
    track: "third_party_settlement",
    spawnOn: (e) =>
      e.type === "milestone_ticked" && e.key === "car_at_garage" && e.done,
    completeWhen: (ctx) => ctx.milestoneDone("payment_received"),
  },
];
