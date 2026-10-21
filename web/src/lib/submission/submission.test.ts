import { describe, expect, test } from "vitest";
import type { ComputedItem } from "@/lib/claims/checklist";
import { INSURER_DIRECTORY } from "./directory";
import { matchInsurer } from "./match";
import { buildSubject } from "./subject";
import { buildBody } from "./body";
import { composeSubmission, type SubmissionClaim } from "./compose";

const CLAIM: SubmissionClaim = {
  id: "a1b2c3d4-0000-0000-0000-000000000000",
  claimType: "third_party_report",
  clientName: "דור פרידמן",
  ourPlate: "4834834",
  tpPlate: "1122334",
  eventDate: "2026-10-16",
  atFaultInsurer: "phoenix",
  policyInsurer: null,
  agencyName: "מוסך הדגמה",
};

function doc(key: string, label: string, docType: string, done = true): ComputedItem {
  return { key, label, kind: "doc", docType, mandatory: true, blocking: false, section: "base", done };
}

describe("directory", () => {
  test("ships with no live unverified addresses", () => {
    for (const entry of Object.values(INSURER_DIRECTORY)) {
      expect(entry.claimsEmail).toBeNull();
      expect(entry.verified).toBe(false);
    }
  });
  test("covers every wizard insurer key", () => {
    for (const k of ["migdal", "menora", "phoenix", "clal", "shomera", "aig"]) {
      expect(INSURER_DIRECTORY[k]).toBeDefined();
    }
  });
});

describe("matchInsurer", () => {
  test("exact label match with surrounding whitespace", () => {
    expect(matchInsurer("הפניקס ")).toBe("phoenix");
    expect(matchInsurer(" כלל")).toBe("clal");
  });
  test("key match", () => {
    expect(matchInsurer("phoenix")).toBe("phoenix");
  });
  test("no fuzzy matching", () => {
    expect(matchInsurer("פניקס!")).toBeNull();
    expect(matchInsurer("הפניקס חברה לביטוח")).toBeNull();
  });
  test("empty / null", () => {
    expect(matchInsurer("")).toBeNull();
    expect(matchInsurer(null)).toBeNull();
  });
});

describe("buildSubject", () => {
  test("third-party subject carries both plates, dd/mm/yyyy and the short id", () => {
    const s = buildSubject(CLAIM);
    expect(s).toBe(
      "תביעת נזקי רכוש — אירוע מיום 16/10/2026 — מבוטחכם 1122334 — נפגע 4834834 — a1b2c3d4",
    );
  });
  test("own-policy subject", () => {
    const s = buildSubject({ ...CLAIM, claimType: "own_policy", policyInsurer: "migdal" });
    expect(s).toContain("הודעה על תאונה");
    expect(s).toContain("16/10/2026");
    expect(s).toContain("4834834");
    expect(s).toContain("a1b2c3d4");
  });
  test("settlement subject", () => {
    const s = buildSubject({ ...CLAIM, claimType: "third_party_settlement" });
    expect(s).toContain("בקשת הסדר");
    expect(s).toContain("1122334");
  });
  test("missing third-party plate renders לא ידוע", () => {
    const s = buildSubject({ ...CLAIM, tpPlate: null });
    expect(s).toContain("מבוטחכם לא ידוע");
  });
});

describe("buildBody", () => {
  test("lists exactly the given attachment labels", () => {
    const body = buildBody(CLAIM, ["טופס הודעה על תאונה", "חשבונית מוסך"]);
    expect(body).toContain("המסמכים המצורפים:");
    expect(body).toContain("- טופס הודעה על תאונה");
    expect(body).toContain("- חשבונית מוסך");
    expect(body).toContain("מוסך הדגמה");
  });
});

describe("composeSubmission", () => {
  const checklist: ComputedItem[] = [
    doc("garage_invoice", "חשבונית מוסך", "garage_invoice"),
    doc("appraiser_report", "דוח שמאי", "appraiser_report", false),
  ];
  const docs = [{ type: "garage_invoice", storage_path: "c/1/invoice.pdf" }];
  const forms = [{ insurer: "phoenix", storage_path: "c/1/form.pdf" }];

  test("unknown track composes nothing", () => {
    const r = composeSubmission({
      claim: { ...CLAIM, claimType: "unknown" },
      checklist,
      docs,
      forms,
    });
    expect(r).toBeNull();
  });

  test("insurerKey resolves but recipient stays null while unverified", () => {
    const r = composeSubmission({ claim: CLAIM, checklist, docs, forms });
    if (!r) throw new Error("expected submission");
    expect(r.insurerKey).toBe("phoenix");
    expect(r.recipient).toBeNull();
    expect(r.verified).toBe(false);
  });

  test("attachments = generated form + uploaded mandatory docs with Hebrew labels", () => {
    const r = composeSubmission({ claim: CLAIM, checklist, docs, forms });
    if (!r) throw new Error("expected submission");
    expect(r.attachments).toEqual([
      { label: "טופס הודעה על תאונה", storagePath: "c/1/form.pdf" },
      { label: "חשבונית מוסך", storagePath: "c/1/invoice.pdf" },
    ]);
    expect(r.body).toContain("- חשבונית מוסך");
  });
});
