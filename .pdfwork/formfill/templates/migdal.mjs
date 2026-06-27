// Coordinate map: canonical field -> position on מגדל (Migdal) page 1.
// Checkbox positions are X-draw coords (box centre minus ~4,4) from boxdetect.mjs (vector squares).
export default {
  insurer: 'מגדל',
  src: 'C:/Users/eylon/digital-claims-assistant/docs/accidentStatementPdf/מגדל_טופס_תאונה.pdf',
  fields: [
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

    // ד. פרטי האירוע
    { key: 'accident.date', page: 0, right: 558, y: 335 },
    { key: 'accident.time', page: 0, right: 504, y: 335 },
    { key: 'accident.passengers', page: 0, right: 181, y: 335 },
    { key: 'accident.trip_type', page: 0, type: 'checkbox',
      options: { private: [308, 333], work: [420, 333], to_from_work: [389, 333], paid_transport: [276, 333], taxi: [226, 333] } },
  ],
};
