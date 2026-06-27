import type { Template } from "../engine";

// Coordinate map: canonical field -> position on הכשרה (Hachshara) page 1.
// Checkboxes are symbol glyphs ("7"); positions came from text extraction (coords.mjs).
const hachshara: Template = {
  insurer: "הכשרה",
  srcFile: "hachshara.pdf",
  fields: [
    { key: "agent_name", right: 505, y: 708 },
    { key: "policy_number", right: 250, y: 708 },
    {
      key: "claim_type",
      type: "checkbox",
      options: {
        own_policy: [380, 677],
        third_party_report: [310, 677],
        third_party_settlement: [242, 677],
      },
    },

    { key: "insured.first_name", right: 455, y: 645 },
    { key: "insured.last_name", right: 300, y: 645 },
    { key: "insured.id_number", right: 200, y: 645 },
    { key: "insured.address_line", right: 488, y: 617 },
    { key: "insured.mobile", right: 455, y: 590 },
    { key: "insured.email", right: 175, y: 590, size: 9 },

    { key: "vehicle.plate", right: 445, y: 470 },
    { key: "accident.date", right: 230, y: 470 },
    { key: "accident.time", right: 110, y: 470 },
    { key: "accident.location", right: 445, y: 443 },
    { key: "assessor_name", right: 235, y: 443 },
    { key: "garage.name", right: 470, y: 416 },
    { key: "garage.address", right: 300, y: 416 },
    { key: "garage.phone", right: 130, y: 416 },

    {
      key: "fault",
      type: "checkbox",
      options: { me: [446, 256], third_party: [411, 256], unknown: [365, 256] },
    },
  ],
};

export default hachshara;
