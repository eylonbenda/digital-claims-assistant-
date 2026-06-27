// Coordinate map: canonical field -> position on מנורה (Menora) page 1.
// Source PDF: כלל_טופס_תאונה.pdf (mislabeled; content is מנורה accident-notice form).
// Page size: 595x842 pt. Coords: PDF-lib space, origin bottom-left, y up.
// text: {key,page,right,y[,size]}
// checkbox: {key,type:'checkbox',options:{value:[x,y]}}
//   Glyph checkboxes: empty-string items (w=7) from coords.mjs; draw at [x,y].
export default {
  insurer: 'מנורה',
  src: 'C:/Users/eylon/digital-claims-assistant/docs/accidentStatementPdf/כלל_טופס_תאונה.pdf',
  fields: [
    // ─── Header ──────────────────────────────────────────────────────────────
    // שם הסוכן : (y=767) — blank left of label, label left-edge x=123
    { key: 'agent_name', page: 0, right: 120, y: 767 },

    // ─── א. פרטי המבוטח (y=744–756) ─────────────────────────────────────────
    // Columns RTL: שם המבוטח | מספר פוליסה | מס' זהות | טלפון בעבודה
    // שם המבוטח cell x≈374–483 (side-panel label at 484–517)
    { key: 'insured.first_name', page: 0, right: 480, y: 756 },
    { key: 'insured.last_name',  page: 0, right: 430, y: 756 },
    // מספר פוליסה cell x≈253–337 (label right-edge 374)
    { key: 'policy_number',      page: 0, right: 335, y: 756 },
    // מס' זהות cell x≈133–252; fill below label at y=748
    { key: 'insured.id_number',  page: 0, right: 250, y: 748, size: 8 },
    // טלפון בעבודה cell x≈34–109 (label left-edge 110)
    { key: 'insured.phone',      page: 0, right: 108, y: 756, size: 9 },
    // Second row (y=744): טלפון בבית cell x≈34–116 (label left-edge 117)
    { key: 'insured.mobile',     page: 0, right: 108, y: 744, size: 9 },

    // ─── ב. פרטי הנהג (y=703–731) ────────────────────────────────────────────
    // Driver name row (y=731): שם הנהג | כתובת | מה הקשר
    // שם הנהג cell x≈432–491 (label left-edge 492)
    { key: 'driver.first_name',    page: 0, right: 489, y: 731 },
    { key: 'driver.last_name',     page: 0, right: 455, y: 731 },
    // כתובת cell x≈185–412 (label left-edge 413)
    { key: 'insured.address_line', page: 0, right: 408, y: 731, size: 8 },
    // Licence row (y=677): תאריך לידה | מס' זהות | מס' רישיון נהיגה | סוג/דרגת | תאריך הוצאה
    // מס' זהות cell: column x≈337–435, blank below label. Pull right in slightly.
    { key: 'driver.id_number', page: 0, right: 420, y: 668, size: 8 },

    // ─── ג. פרטי הרכב (y=606–615) ────────────────────────────────────────────
    // Columns RTL: מספר רישוי | שם היצרן | דגם | סוג | שנת ייצור | רדיו/תוספות
    // מספר רישוי cell x≈405–485 (label left-edge 486)
    { key: 'vehicle.plate',        page: 0, right: 484, y: 615 },
    // שם היצרן cell x≈337–388 (label left-edge 389)
    { key: 'vehicle.manufacturer', page: 0, right: 386, y: 615 },
    // דגם cell x≈273–324 (label left-edge 325)
    { key: 'vehicle.model',        page: 0, right: 323, y: 615 },
    // סוג cell x≈210–262 (label left-edge 263) — free-text on this form
    { key: 'vehicle.type',         page: 0, right: 260, y: 615, size: 8 },
    // שנת ייצור cell x≈144–182 (label left-edge 183)
    { key: 'vehicle.year',         page: 0, right: 181, y: 615, size: 9 },

    // ─── ד. פרטי מקרה / התאונה (y=586–596) ──────────────────────────────────
    // Columns RTL: תאריך המקרה | שעת המקרה | המקום המדוייק | [police cols]
    // תאריך המקרה cell x≈444–477 (label left-edge 478; שעת המקרה ends at 443)
    { key: 'accident.date',     page: 0, right: 476, y: 596 },
    // שעת המקרה cell x≈381–407 (label left-edge 408)
    { key: 'accident.time',     page: 0, right: 406, y: 596 },
    // המקום המדוייק cell x≈34–290 (label left-edge 291)
    { key: 'accident.location', page: 0, right: 288, y: 596, size: 8 },

    // Trip-type row (y=573): yes/no questions, glyph boxes (w=7).
    // Q (rightmost): האם התאונה היתה תוך כדי עבודה / בדרך לעבודה?
    //   כן glyph at x=91,y=573 → draw at [91,573]
    //   לא glyph at x=65,y=573 → draw at [65,573]
    { key: 'accident.trip_type', page: 0, type: 'checkbox',
      options: {
        work:           [91, 573],
        to_from_work:   [91, 573],
        private:        [65, 573],
        taxi:           [65, 573],
        paid_transport: [65, 573],
      },
    },

    // ─── Garage / Assessor (y=62) ─────────────────────────────────────────────
    // Layout RTL: [במוסך: label x=494-553] [garage-name blank x=397-493] [טל: x=385-396]
    //             [phone blank x=308-384]  [מוסך הסדר+boxes x=220-307]   [השמאי label x=158-207]
    { key: 'garage.name',  page: 0, right: 492, y: 62 },
    { key: 'garage.phone', page: 0, right: 383, y: 62, size: 9 },
    // השמאי blank x≈34–157 (label left-edge 158)
    { key: 'assessor_name', page: 0, right: 154, y: 62 },
  ],
};
