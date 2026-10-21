import type { ComputedItem } from "@/lib/claims/checklist";
import type { ClaimType } from "@/lib/tasks/types";
import { INSURER_DIRECTORY } from "./directory";
import { matchInsurer } from "./match";
import { buildSubject } from "./subject";
import { buildBody } from "./body";

// The slice of a claim the submission builders need. Built by the cockpit page
// from data it already loads — no extra queries.
export type SubmissionClaim = {
  id: string;
  claimType: ClaimType;
  clientName: string | null;
  ourPlate: string | null;
  tpPlate: string | null;
  eventDate: string | null; // ISO date
  atFaultInsurer: string | null; // canonical key OR client free text
  policyInsurer: string | null; // canonical key
  agencyName: string | null;
};

export type Submission = {
  insurerKey: string | null;
  recipient: string | null; // directory address, only when verified
  cc: string[];
  verified: boolean;
  subject: string;
  body: string;
  attachments: { label: string; storagePath: string }[];
};

export function composeSubmission(input: {
  claim: SubmissionClaim;
  checklist: ComputedItem[];
  docs: { type: string; storage_path: string }[];
  forms: { insurer: string | null; storage_path: string }[];
}): Submission | null {
  const { claim, checklist, docs, forms } = input;
  if (claim.claimType === "unknown") return null;

  // matchInsurer accepts both canonical keys and Hebrew labels, so this covers
  // claims.at_fault_insurer whether it holds our key or the client's free text.
  const insurerKey =
    claim.claimType === "own_policy"
      ? claim.policyInsurer
      : matchInsurer(claim.atFaultInsurer);
  const entry = insurerKey ? INSURER_DIRECTORY[insurerKey] : undefined;

  // Attachments: the latest generated accident-notice form, then every uploaded
  // doc whose checklist item is mandatory for this track, labeled in Hebrew.
  const attachments: { label: string; storagePath: string }[] = [];
  const form = forms[0];
  if (form) attachments.push({ label: "טופס הודעה על תאונה", storagePath: form.storage_path });
  const byType = new Map(docs.map((d) => [d.type, d.storage_path]));
  for (const item of checklist) {
    if (item.kind !== "doc" || !item.mandatory || !item.docType || !item.done) continue;
    const path = byType.get(item.docType);
    if (path) attachments.push({ label: item.label, storagePath: path });
  }

  return {
    insurerKey: insurerKey ?? null,
    recipient: entry?.verified ? entry.claimsEmail : null,
    cc: entry?.verified ? entry.cc : [],
    verified: entry?.verified ?? false,
    subject: buildSubject(claim),
    body: buildBody(
      claim,
      attachments.map((a) => a.label),
    ),
    attachments,
  };
}
