import type { Template } from "../engine";

// Coordinate map: canonical field -> position on מנורה (Menora) page 1.
// Source PDF is the mislabeled כלל_טופס_תאונה.pdf (content is מנורה); bundled here as menora.pdf.
// Ported from .pdfwork/formfill/templates/menora.mjs (authored via the pdf-form-mapper agent).
const menora: Template = {
  insurer: "מנורה",
  srcFile: "menora.pdf",
  fields: [
    { key: "agent_name", right: 120, y: 767 },

    // א. פרטי המבוטח
    { key: "insured.first_name", right: 480, y: 756 },
    { key: "insured.last_name", right: 430, y: 756 },
    { key: "policy_number", right: 335, y: 756 },
    { key: "insured.id_number", right: 250, y: 748, size: 8 },
    { key: "insured.phone", right: 108, y: 756, size: 9 },
    { key: "insured.mobile", right: 108, y: 744, size: 9 },

    // ב. פרטי הנהג
    { key: "driver.first_name", right: 489, y: 731 },
    { key: "driver.last_name", right: 455, y: 731 },
    { key: "insured.address_line", right: 408, y: 731, size: 8 },
    { key: "driver.id_number", right: 420, y: 668, size: 8 },

    // ג. פרטי הרכב
    { key: "vehicle.plate", right: 484, y: 615 },
    { key: "vehicle.manufacturer", right: 386, y: 615 },
    { key: "vehicle.model", right: 323, y: 615 },
    { key: "vehicle.type", right: 260, y: 615, size: 8 }, // free-text cell -> Hebrew via labels
    { key: "vehicle.year", right: 181, y: 615, size: 9 },

    // ד. פרטי התאונה
    { key: "accident.date", right: 476, y: 596 },
    { key: "accident.time", right: 406, y: 596 },
    { key: "accident.location", right: 288, y: 596, size: 8 },

    // תוך כדי עבודה / בדרך לעבודה? — glyph yes/no boxes
    {
      key: "accident.trip_type",
      type: "checkbox",
      options: {
        work: [91, 573],
        to_from_work: [91, 573],
        private: [65, 573],
        taxi: [65, 573],
        paid_transport: [65, 573],
      },
    },

    // מוסך + שמאי (תחתית הטופס)
    { key: "garage.name", right: 492, y: 62 },
    { key: "garage.phone", right: 383, y: 62, size: 9 },
    { key: "assessor_name", right: 154, y: 62 },
  ],
};

export default menora;
