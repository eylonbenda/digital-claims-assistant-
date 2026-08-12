import { chaseMessage, collectPrivateReportMessage, getTpInsurerMessage } from "@/lib/wa";

// Everything the body builders may see. blockingLabels is the LIVE checklist
// state at render time — bodies are never persisted before send (spec §3).
export type MessageCtx = {
  firstName: string | null;
  blockingLabels: string[];
  // Mandatory, not-done, doc-kind items from the checklist's "late" section —
  // a superset of blockingLabels that also catches mandatory docs the checklist
  // deliberately doesn't gate readiness on (e.g. repair_receipt, spec §2 finding
  // #2). chase_missing_docs stays on the narrower blockingLabels.
  missingDocLabels: string[];
  uploadUrl: string;
};

export type SendRule = {
  taskKey: string;
  lane: "send";
  recipientKind: "client";
  channel: "whatsapp";
  cooldownDays: number;
  // THE flip-to-auto seam (spec §4). Always false in C1. When a rule flips,
  // a cron sender composes the same body and writes the same outbound_events
  // row with actor='system' — no other code changes.
  auto: boolean;
  build: (ctx: MessageCtx) => string;
};

const rule = (taskKey: string, cooldownDays: number, build: SendRule["build"]): SendRule => ({
  taskKey, lane: "send", recipientKind: "client", channel: "whatsapp",
  cooldownDays, auto: false, build,
});

export const SEND_RULES: Record<string, SendRule> = {
  chase_missing_docs: rule("chase_missing_docs", 3, (ctx) =>
    chaseMessage({ firstName: ctx.firstName, items: ctx.blockingLabels, uploadUrl: ctx.uploadUrl }),
  ),
  get_tp_insurer: rule("get_tp_insurer", 3, (ctx) =>
    getTpInsurerMessage({ firstName: ctx.firstName }),
  ),
  collect_private_report_docs: rule("collect_private_report_docs", 4, (ctx) =>
    collectPrivateReportMessage({ firstName: ctx.firstName, items: ctx.missingDocLabels, uploadUrl: ctx.uploadUrl }),
  ),
};

// Highest first — breaks ties when two send rules are due on the same claim
// and the one-message-per-claim-per-day cap allows only one through.
export const RULE_PRIORITY = ["chase_missing_docs", "get_tp_insurer", "collect_private_report_docs"];

// After this many 'sent' events with no document arriving since, stop
// proposing and emit a phone-call escalation row instead (spec §5).
export const MAX_SENDS_BEFORE_CALL = 3;
