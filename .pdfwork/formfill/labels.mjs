// Canonical enum -> Hebrew display label, keyed by canonical field path. Used by engine.mjs
// when an enum field is rendered as FREE TEXT on a form (checkbox forms map the enum key to a
// box instead, so they never reach this). The same vocabulary should drive the collection UI.
export const LABELS = {
  insurance_type:          { comprehensive: 'מקיף', mandatory: 'חובה', third_party: "צד ג׳" },
  claim_type:              { own_policy: 'ביטוח עצמי', third_party_report: 'דוח פרטי', third_party_settlement: 'הסדר', unknown: 'לא ידוע' },
  fault:                   { me: 'אני', third_party: "צד ג׳", unknown: 'לא יודע' },
  'vehicle.type':          { private: 'פרטי', commercial: 'מסחרי', truck: 'משאית', tractor: 'טרקטור', scooter: 'קטנוע', motorcycle: 'אופנוע' },
  'accident.trip_type':    { private: 'פרטי', work: 'עבודה', to_from_work: 'בדרך לעבודה', paid_transport: 'הסעה בשכר', taxi: 'מונית' },
  'accident.area_type':    { urban: 'עירוני', intercity: 'בין-עירוני', parking: 'חניון', junction: 'צומת' },
  'driver.license_origin': { israeli: 'ישראלי', foreign: 'זר' },
};
