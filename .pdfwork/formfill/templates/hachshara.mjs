// Coordinate map: canonical field -> position on הכשרה (Hachshara) page 1.
// text: {key,page,right,y[,size]} ; checkbox: {key,type:'checkbox',options:{value:[x,y]}}
// Checkboxes here are symbol glyphs ("7"), positions from coords.mjs text extraction.
export default {
  insurer: 'הכשרה',
  src: 'C:/Users/eylon/digital-claims-assistant/docs/accidentStatementPdf/הכשרה_טופס_הודעה.pdf',
  fields: [
    { key: 'agent_name', page: 0, right: 505, y: 708 },
    { key: 'policy_number', page: 0, right: 250, y: 708 },
    { key: 'claim_type', page: 0, type: 'checkbox',
      options: { own_policy: [380, 677], third_party_report: [310, 677], third_party_settlement: [242, 677] } },

    { key: 'insured.first_name', page: 0, right: 455, y: 645 },
    { key: 'insured.last_name', page: 0, right: 300, y: 645 },
    { key: 'insured.id_number', page: 0, right: 200, y: 645 },
    { key: 'insured.address_line', page: 0, right: 488, y: 617 },
    { key: 'insured.mobile', page: 0, right: 455, y: 590 },
    { key: 'insured.email', page: 0, right: 175, y: 590, size: 9 },

    { key: 'vehicle.plate', page: 0, right: 445, y: 470 },
    { key: 'accident.date', page: 0, right: 230, y: 470 },
    { key: 'accident.time', page: 0, right: 110, y: 470 },
    { key: 'accident.location', page: 0, right: 445, y: 443 },
    { key: 'assessor_name', page: 0, right: 235, y: 443 },
    { key: 'garage.name', page: 0, right: 470, y: 416 },
    { key: 'garage.address', page: 0, right: 300, y: 416 },
    { key: 'garage.phone', page: 0, right: 130, y: 416 },

    { key: 'fault', page: 0, type: 'checkbox',
      options: { me: [446, 256], third_party: [411, 256], unknown: [365, 256] } },
  ],
};
