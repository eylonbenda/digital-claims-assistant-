// Pure decisions around demand-form generation, kept out of the I/O code so they can be
// unit-tested without Supabase.
import { INSURER_DIRECTORY } from "../submission/directory";
import { milestoneDates, type MilestoneEvent } from "../claims/milestone-dates";
import { resolveAddressee } from "./data";

export const DEMAND_TRACK = "third_party_report";

// POST /api/claims/[id]/demand-form body: { at_fault_insurer?: string }.
// Absent/null/"" means "don't change it"; anything else must be a directory key.
export type DemandFormBody = { ok: true; atFaultInsurer: string | null } | { ok: false };

export function parseDemandFormBody(body: unknown): DemandFormBody {
  if (body == null) return { ok: true, atFaultInsurer: null };
  if (typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const v = (body as Record<string, unknown>).at_fault_insurer;
  if (v === undefined || v === null || v === "") return { ok: true, atFaultInsurer: null };
  if (typeof v !== "string" || !Object.prototype.hasOwnProperty.call(INSURER_DIRECTORY, v)) return { ok: false };
  return { ok: true, atFaultInsurer: v };
}

// Rows read from the DB -> the non-content inputs of buildDemandData.
export function demandInputs(input: {
  atFaultInsurer: string | null;
  tpInsurers: (string | null)[];
  agent: { name: string | null; phone: string | null; email: string | null } | null;
  events: MilestoneEvent[];
}): {
  addresseeKey: string | null;
  sender: { name: string | null; phone: string | null; email: string | null };
  carAtGarageAt: string | null;
} {
  return {
    addresseeKey: resolveAddressee(input.atFaultInsurer, input.tpInsurers),
    sender: {
      name: input.agent?.name ?? null,
      phone: input.agent?.phone ?? null,
      email: input.agent?.email ?? null,
    },
    carAtGarageAt: milestoneDates(input.events).car_at_garage ?? null,
  };
}
