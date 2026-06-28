// Coordinate map: canonical field -> position on מגדל (Migdal).
// Pages: 0=page1, 1=page2, 2=page3.
// Checkbox positions are X-draw coords (box centre minus ~4,4) from boxdetect.mjs (vector squares).
export default {
  insurer: 'מגדל',
  src: 'C:/Users/eylon/digital-claims-assistant/docs/accidentStatementPdf/מגדל_טופס_תאונה.pdf',
  fields: [
    // ── Page 1 ──────────────────────────────────────────────────────────────

    // א. פרטי המבוטח
    { key: 'insured.first_name', page: 0, right: 241, y: 662 },
    { key: 'insured.last_name', page: 0, right: 402, y: 662 },
    { key: 'insured.id_number', page: 0, right: 536, y: 662 },
    { key: 'insured.birth_date', page: 0, right: 142, y: 662 },
    { key: 'insured.street', page: 0, right: 405, y: 635 },
    { key: 'insured.house_no', page: 0, right: 286, y: 635 },
    { key: 'insured.city', page: 0, right: 526, y: 635 },
    { key: 'insured.postal_code', page: 0, right: 80, y: 635 },
    { key: 'insured.mobile', page: 0, right: 112, y: 605, size: 9 },
    { key: 'insured.phone', page: 0, right: 537, y: 605, size: 9 },
    { key: 'insured.email', page: 0, right: 284, y: 605, size: 8 },

    // ב. פרטי כלי רכב
    { key: 'vehicle.plate', page: 0, right: 536, y: 515 },
    { key: 'vehicle.manufacturer', page: 0, right: 169, y: 515 },
    { key: 'vehicle.year', page: 0, right: 86, y: 515 },
    { key: 'vehicle.type', page: 0, type: 'checkbox',
      options: { private: [317, 513], commercial: [264, 513], truck: [291, 513], tractor: [353, 513], scooter: [383, 513], motorcycle: [414, 513] } },

    // ג. פרטי הנהג
    { key: 'driver.id_number', page: 0, right: 536, y: 440 },
    { key: 'driver.last_name', page: 0, right: 418, y: 440 },
    { key: 'driver.first_name', page: 0, right: 301, y: 440 },
    { key: 'driver.license_number', page: 0, right: 441, y: 380 },
    { key: 'driver.license_type', page: 0, right: 264, y: 380, size: 9 },
    { key: 'driver.license_date', page: 0, right: 115, y: 380, size: 9 },

    // ד. פרטי האירוע
    { key: 'accident.date', page: 0, right: 558, y: 335 },
    { key: 'accident.time', page: 0, right: 504, y: 335 },
    { key: 'accident.passengers', page: 0, right: 181, y: 335 },
    { key: 'accident.trip_type', page: 0, type: 'checkbox',
      options: { private: [308, 333], work: [420, 333], to_from_work: [389, 333], paid_transport: [276, 333], taxi: [226, 333] } },
    // מקום האירוע — blank underline to left of the label (same row, y=317)
    { key: 'accident.location', page: 0, right: 350, y: 317, size: 9 },
    // תיאור האירוע — first blank line below the label
    { key: 'accident.description', page: 0, right: 561, y: 225, size: 8 },

    // ── Page 3 (index 2) ────────────────────────────────────────────────────

    // ו. פרטי צד ג' — row 1: רישוי | סוג רכב | חברת ביטוח | פוליסה | סוכן | טל' סוכן
    { key: 'third_parties.0.vehicle_plate', page: 2, right: 561, y: 718, size: 9 },
    { key: 'third_parties.0.insurer', page: 2, right: 378, y: 718, size: 9 },
    // row 2: מספר זהות | שם משפחה | שם פרטי | כתובת מגורים
    // driver_name (full name) -> שם משפחה column; שם פרטי needs first/last split (schema gap)
    { key: 'third_parties.0.driver_name', page: 2, right: 429, y: 690, size: 9 },
    { key: 'third_parties.0.address', page: 2, right: 295, y: 690, size: 8 },

    // מי אשם — "מי לדעתך אחרי לתאונה?"
    // אני(המבוטח): מלא=[255,596]  חלקי=[230,596]  לא ידוע=[204,596]
    // צד ג':        מלא=[530,596]  חלקי=[505,596]  לא ידוע=[479,596]
    // fault=me -> אני מלא; fault=third_party -> צד ג' מלא; fault=unknown -> אני לא ידוע
    { key: 'fault', page: 2, type: 'checkbox',
      options: { me: [248, 592], third_party: [523, 592], unknown: [197, 592] } },
  ],
};
