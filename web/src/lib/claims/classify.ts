// Two-layer claim classifier.
//
// Layer 1 (fact-driven, deterministic here): own_policy vs. third-party.
//   Pivot = fault × identified-third-party × coverage type.
// Layer 2 (business choice, NOT derivable from facts): third_party_report ("דוח פרטי")
//   vs. third_party_settlement ("הסדר"). We only *recommend* a default and force the
//   agent to choose (needsAgentChoice), because both need identical facts and the split
//   drives a 15-item vs. a 5-item checklist.
//
// The LLM never picks the enum. It only supplies interpreted narrative *signals*
// (incidentKind, inferredFault); this pure function owns the decision so it stays
// auditable and can't hallucinate a track.

import type { ClaimData, ClaimType, Fault, InsuranceType } from "@/lib/formfill/types";

export type IncidentKind =
  | "collision" // standard multi-vehicle impact
  | "single_vehicle" // lost control / hit a fixed object, no other car
  | "theft"
  | "vandalism"
  | "hit_and_run" // other vehicle fled and is unidentified
  | "animal"
  | "other";

export type Confidence = "high" | "medium" | "low";

export type ClassifierInput = {
  fault: Fault; // claimant-stated (me | third_party | unknown)
  thirdPartyIdentified: boolean; // do we hold a plate / insurer for a TP?
  insuranceType?: InsuranceType; // comprehensive | mandatory | third_party
  incidentKind?: IncidentKind; // narrative-derived (LLM), optional
  inferredFault?: Fault; // narrative-derived (LLM), optional
};

export type Classification = {
  proposedType: ClaimType;
  confidence: Confidence;
  needsAgentChoice: boolean; // Layer 2 (report vs settlement) is open → agent must pick
  tpStrategyRecommendation?: Extract<
    ClaimType,
    "third_party_report" | "third_party_settlement"
  >;
  viabilityWarning?: string; // Hebrew — set when no viable property claim exists
  faultMismatch: boolean; // stated fault conflicts with narrative-inferred fault
  reasons: string[]; // Hebrew audit trail
};

// Incident kinds where the damage is to the claimant's own car with no liable,
// identified counterparty → the only recovery route is the claimant's own מקיף.
const OWN_DAMAGE_KINDS: ReadonlySet<IncidentKind> = new Set([
  "theft",
  "vandalism",
  "single_vehicle",
  "animal",
]);

const NO_OWN_COVERAGE =
  "אין כיסוי מקיף — נזק לרכב עצמו אינו מכוסה, ולא ניתן לתבוע צד ג' מזוהה. ייתכן שאין תביעה רכושית ברת-מימוש.";

export function classify(input: ClaimInputResolved): Classification {
  const { fault, thirdPartyIdentified, insuranceType, incidentKind, inferredFault } = input;

  const hasComprehensive = insuranceType === "comprehensive";
  const coverageKnown = insuranceType != null;
  const reasons: string[] = [];

  // Fault mismatch: the claimant said one thing, the narrative reads another way.
  // Doesn't flip the decision on its own, but lowers confidence and flags the agent.
  const faultMismatch =
    !!inferredFault && inferredFault !== "unknown" && fault !== "unknown" && inferredFault !== fault;
  if (faultMismatch) {
    reasons.push(
      `אי-התאמה: הלקוח סימן "${faultLabel(fault)}" אך תיאור האירוע נקרא כ-"${faultLabel(inferredFault!)}".`,
    );
  }

  // ── Own-damage incidents (theft / vandalism / single-vehicle / animal) ──
  if (incidentKind && OWN_DAMAGE_KINDS.has(incidentKind)) {
    reasons.push(`אירוע מסוג "${incidentLabel(incidentKind)}" — נזק עצמי ללא צד ג' אחראי.`);
    if (hasComprehensive) {
      return done("own_policy", faultMismatch ? "medium" : "high", { reasons, faultMismatch });
    }
    return done("own_policy", "low", {
      reasons,
      faultMismatch,
      viabilityWarning: coverageKnown ? NO_OWN_COVERAGE : undefined,
    });
  }

  // ── Hit-and-run: TP at fault but unidentified → own policy only ──
  if (incidentKind === "hit_and_run" && !thirdPartyIdentified) {
    reasons.push("פגע-וברח — הצד השני אחראי אך אינו מזוהה; אין נגד מי לתבוע ישירות.");
    if (hasComprehensive) {
      return done("own_policy", "medium", { reasons, faultMismatch });
    }
    return done("own_policy", "low", {
      reasons,
      faultMismatch,
      viabilityWarning: coverageKnown ? NO_OWN_COVERAGE : undefined,
    });
  }

  // ── No identified third party at all → own policy (needs מקיף) ──
  if (!thirdPartyIdentified) {
    reasons.push("אין צד ג' מזוהה (מספר רישוי / מבטח).");
    if (hasComprehensive) {
      return done("own_policy", "high", { reasons, faultMismatch });
    }
    if (coverageKnown) {
      return done("own_policy", "low", { reasons, faultMismatch, viabilityWarning: NO_OWN_COVERAGE });
    }
    return done("own_policy", "medium", { reasons, faultMismatch });
  }

  // ── A third party IS identified → decision hinges on fault ──
  switch (fault) {
    case "me": {
      reasons.push("צד ג' מזוהה, אך הלקוח אשם — נזק עצמי משוחזר רק דרך פוליסת הלקוח.");
      reasons.push("הערה: הצד השני עשוי לתבוע את הלקוח (חבות) — טיפול נפרד.");
      if (hasComprehensive) {
        return done("own_policy", faultMismatch ? "medium" : "high", { reasons, faultMismatch });
      }
      return done("own_policy", "low", {
        reasons,
        faultMismatch,
        viabilityWarning: coverageKnown ? NO_OWN_COVERAGE : undefined,
      });
    }

    case "third_party": {
      reasons.push("צד ג' מזוהה והלקוח אינו אשם — תביעה מול מבטח צד ג'.");
      reasons.push('בחירת מסלול נדרשת: "דוח פרטי" (מלא, אחרי תיקון) מול "הסדר" (אישור מראש).');
      return done("third_party_report", faultMismatch ? "low" : "high", {
        reasons,
        faultMismatch,
        needsAgentChoice: true,
        tpStrategyRecommendation: "third_party_report",
      });
    }

    default: {
      // fault unknown / disputed
      reasons.push("האשמה אינה ברורה או שנויה במחלוקת.");
      if (hasComprehensive) {
        reasons.push("קיים כיסוי מקיף — ניתן להתקדם דרך פוליסת הלקוח, והמבטח ישפה/ישבב בהמשך.");
        return done("own_policy", "medium", { reasons, faultMismatch });
      }
      return done("unknown", "low", { reasons, faultMismatch });
    }
  }
}

type ClaimInputResolved = ClassifierInput;

function done(
  proposedType: ClaimType,
  confidence: Confidence,
  extra: {
    reasons: string[];
    faultMismatch: boolean;
    needsAgentChoice?: boolean;
    tpStrategyRecommendation?: Classification["tpStrategyRecommendation"];
    viabilityWarning?: string;
  },
): Classification {
  return {
    proposedType,
    confidence,
    needsAgentChoice: extra.needsAgentChoice ?? false,
    tpStrategyRecommendation: extra.tpStrategyRecommendation,
    viabilityWarning: extra.viabilityWarning,
    faultMismatch: extra.faultMismatch,
    reasons: extra.reasons,
  };
}

function faultLabel(f: Fault): string {
  return f === "me" ? "אני אשם" : f === "third_party" ? "הצד השני אשם" : "לא ידוע";
}

function incidentLabel(k: IncidentKind): string {
  const M: Record<IncidentKind, string> = {
    collision: "התנגשות",
    single_vehicle: "רכב יחיד",
    theft: "גניבה",
    vandalism: "ונדליזם",
    hit_and_run: "פגע וברח",
    animal: "פגיעת בעל חיים",
    other: "אחר",
  };
  return M[k];
}

// Bridge: derive classifier inputs from the canonical ClaimData, so both the AI flow
// and the agent dashboard classify from one source of truth.
export function classifyFromClaimData(
  data: ClaimData,
  signals?: { incidentKind?: IncidentKind; inferredFault?: Fault },
): Classification {
  const thirdPartyIdentified =
    data.third_parties?.some((tp) => !!(tp.vehicle_plate || tp.insurer)) ?? false;
  return classify({
    fault: data.fault ?? "unknown",
    thirdPartyIdentified,
    insuranceType: data.insurance_type,
    incidentKind: signals?.incidentKind,
    inferredFault: signals?.inferredFault,
  });
}
