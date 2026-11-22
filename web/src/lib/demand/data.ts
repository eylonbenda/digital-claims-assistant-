// Pure builder: claim -> display rows of the one-page demand form. No I/O, never throws on
// missing data; every value is a string ("" when absent).
import type { ClaimData } from "../formfill/types";
import { LABELS } from "../formfill/labels";
import { toILDate } from "../dates";
import { matchInsurer } from "../submission/match";
import { INSURER_DIRECTORY } from "../submission/directory";
import { COPY } from "./copy";
import { computeDamageTotals, formatLetterAmount, VAT_RATE } from "./damages";
import { TP_INSURER_UNKNOWN } from "../collection/claim-state";

// kind: "money" rows are never capped/clipped/dropped by the renderer; "total" is also emphasised.
export type DemandRow = { label: string; value: string; kind?: "money" | "total" };
export type DemandSection = { heading: string; rows: DemandRow[]; money?: true };
export type DemandDoc = {
  date: string;
  sender: { name: string; phone: string; email: string };
  addressee: string;
  title: string;
  subtitle: DemandRow[];
  sections: DemandSection[];
};

// Addressee (spec Decision 8): at_fault_insurer when set, else the third parties' insurers if
// they all resolve to one canonical key. Exact matching only; any unresolved entry -> null.
export function resolveAddressee(
  atFaultInsurer: string | null,
  tpInsurers: (string | null)[],
): string | null {
  if (atFaultInsurer) return matchInsurer(atFaultInsurer);
  if (tpInsurers.length === 0) return null;
  const keys = tpInsurers.map((v) => matchInsurer(v));
  const first = keys[0];
  if (!first || keys.some((k) => k !== first)) return null;
  return first;
}

const s = (v: unknown): string => (v == null ? "" : String(v));
const row = (label: string, value: unknown): DemandRow => ({ label, value: s(value) });

export function buildDemandData(input: {
  data: ClaimData | null;
  sender: { name: string | null; phone: string | null; email: string | null };
  addresseeKey: string | null;
  carAtGarageAt: string | null;
  now: Date;
}): DemandDoc {
  const { data, sender, addresseeKey, carAtGarageAt, now } = input;
  const d: ClaimData = data ?? {};
  const L = COPY.labels;

  const police = d.accident?.police?.notified;
  const insuredName = [d.insured?.first_name, d.insured?.last_name].filter(Boolean).join(" ");
  const insType = d.insurance_type;

  const sections: DemandSection[] = [
    {
      heading: COPY.sections.vehicle,
      rows: [
        row(L.makeModel, d.vehicle?.manufacturer),
        row(L.year, d.vehicle?.year),
        row(L.modelCode, d.vehicle?.model_code),
      ],
    },
    {
      heading: COPY.sections.policy,
      rows: [
        row(L.policyNumber, d.policy_number),
        row(L.insuranceType, insType ? (LABELS.insurance_type[insType] ?? insType) : ""),
      ],
    },
    {
      heading: COPY.sections.insured,
      rows: [row(L.name, insuredName), row(L.phone, d.insured?.mobile)],
    },
    { heading: COPY.sections.event, rows: [row(L.version, d.accident?.description)] },
  ];

  const tps = d.third_parties ?? [];
  const addresseeLabel = addresseeKey ? (INSURER_DIRECTORY[addresseeKey]?.label ?? "") : "";
  // The claimant often does not know the other side's insurer; the handler finds out
  // and addresses the letter. With one third party, that addressee IS its insurer —
  // printing "לא ידוע" under a letter addressed to the insurer contradicts itself.
  // With several vehicles we cannot tell whose insurer it is, so nothing is inferred.
  const tpInsurer = (tp: { insurer?: string | null }) => {
    const stated = tp.insurer?.trim() ?? "";
    const unknown = !stated || stated === TP_INSURER_UNKNOWN;
    return unknown && tps.length === 1 && addresseeLabel ? addresseeLabel : tp.insurer;
  };
  tps.forEach((tp, i) => {
    sections.push({
      heading: tps.length > 1 ? `${COPY.sections.thirdParty} ${i + 1}` : COPY.sections.thirdParty,
      rows: [
        row(L.name, tp.driver_name ?? tp.owner_name),
        row(L.idNumber, tp.id_number),
        row(L.phone, tp.phone),
        row(L.thirdPlate, tp.vehicle_plate),
        row(L.insurer, tpInsurer(tp)),
      ],
    });
  });

  const totals = computeDamageTotals(d.damages);
  if (totals) {
    const money = (label: string, n: number, kind: "money" | "total" = "money"): DemandRow => ({
      label,
      value: formatLetterAmount(n),
      kind,
    });
    const rows: DemandRow[] = totals.rows.map((r) =>
      money(r.key === "other" ? r.label : COPY.damages.labels[r.key], r.amount),
    );
    if (totals.vat !== null) rows.push(money(`${COPY.damages.vat} (${Math.round(VAT_RATE * 100)}%)`, totals.vat));
    rows.push(money(COPY.damages.total, totals.total, "total"));
    sections.push({
      heading: totals.vat === null ? COPY.damages.headingExclVat : COPY.damages.headingInclVat,
      rows,
      money: true,
    });
  }

  sections.push({
    heading: COPY.sections.other,
    rows: [
      row(L.police, police === true ? COPY.yes : police === false ? COPY.no : ""),
      row(L.carAtGarage, carAtGarageAt ? toILDate(carAtGarageAt) : ""),
      row(L.appraiser, d.assessor_name),
    ],
  });

  return {
    // UTC calendar date of `now` (deterministic; differs from Asia/Jerusalem only 00:00-03:00 local).
    date: toILDate(now.toISOString().slice(0, 10)),
    sender: { name: s(sender.name), phone: s(sender.phone), email: s(sender.email) },
    addressee: addresseeLabel,
    title: COPY.title,
    subtitle: [
      row(L.plate, d.vehicle?.plate),
      row(L.eventDate, d.accident?.date ? toILDate(d.accident.date) : ""),
      row(L.claimNumber, d.tp_claim_number),
    ],
    sections,
  };
}
